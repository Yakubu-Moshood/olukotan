import { linesToDocument, paragraphsToDocument, styleTypeFromName, type LayoutImportResult, type SourceLine } from "./layout-import";

/**
 * Word (.docx) screenplay import. Uses, in order of trust: paragraph style
 * names (Final Draft, Fade In and WriterDuet exports use "Scene Heading",
 * "Character", "Dialogue"…), then paragraph indentation, then the text.
 */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(data); controller.close(); } });
  const stream = source.pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal ZIP reader (stored + deflate), enough for Office documents. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This file is not a valid Word document (it isn't a ZIP package). Nothing was imported.");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compressed);
    if (/^word\/(?:document|styles)\.xml$/u.test(name)) files.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const attr = (node: Element | null | undefined, name: string) => node?.getAttributeNS(W, name) ?? node?.getAttribute(`w:${name}`) ?? null;
const child = (node: Element, name: string) => [...node.children].find((item) => item.localName === name) ?? null;
const on = (node: Element | null) => !!node && !["0", "false", "none"].includes(attr(node, "val") ?? "true");

export async function parseDocx(bytes: Uint8Array): Promise<LayoutImportResult & { titleGuess?: string }> {
  const files = await readZip(bytes);
  const documentXml = files.get("word/document.xml");
  if (!documentXml) throw new Error("This Word file has no document body. Nothing was imported.");
  const parser = new DOMParser();
  const doc = parser.parseFromString(new TextDecoder().decode(documentXml), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("This Word document is damaged and could not be read. Nothing was imported.");
  // Style id → style name (e.g. "SceneHeading" → "Scene Heading"), plus indent defined on the style.
  const styleNames = new Map<string, string>(), styleIndent = new Map<string, number>(), styleAlign = new Map<string, string>();
  const stylesXml = files.get("word/styles.xml");
  if (stylesXml) {
    const styles = parser.parseFromString(new TextDecoder().decode(stylesXml), "application/xml");
    for (const style of [...styles.getElementsByTagNameNS(W, "style")]) {
      const id = attr(style, "styleId"); if (!id) continue;
      const name = attr(child(style, "name"), "val"); if (name) styleNames.set(id, name);
      const pPr = child(style, "pPr"); const ind = pPr && child(pPr, "ind");
      const left = ind && (attr(ind, "left") ?? attr(ind, "start")); if (left) styleIndent.set(id, Number(left) / 1440);
      const jc = pPr && child(pPr, "jc"); if (jc) styleAlign.set(id, attr(jc, "val") ?? "");
    }
  }
  const lines: SourceLine[] = [];
  const plain: string[] = [];
  let styled = 0, indented = 0;
  for (const paragraph of [...doc.getElementsByTagNameNS(W, "p")]) {
    if (paragraph.parentElement?.localName === "txbxContent") continue;
    const pPr = child(paragraph, "pPr");
    const styleId = attr(pPr && child(pPr, "pStyle"), "val") ?? undefined;
    const styleType = styleTypeFromName(styleId ? styleNames.get(styleId) ?? styleId : undefined);
    const ind = pPr && child(pPr, "ind");
    const leftAttr = ind && (attr(ind, "left") ?? attr(ind, "start"));
    let x = leftAttr !== null && leftAttr !== undefined ? Number(leftAttr) / 1440 : styleId && styleIndent.has(styleId) ? styleIndent.get(styleId)! : 0;
    const jc = attr(pPr && child(pPr, "jc"), "val") ?? (styleId ? styleAlign.get(styleId) : undefined);
    let text = "";
    for (const run of [...paragraph.getElementsByTagNameNS(W, "r")]) {
      const rPr = child(run, "rPr");
      const bold = on(rPr && child(rPr, "b")), italic = on(rPr && child(rPr, "i")), underline = !!rPr && !!child(rPr, "u") && attr(child(rPr, "u"), "val") !== "none";
      const caps = on(rPr && child(rPr, "caps"));
      let value = "";
      for (const node of [...run.children]) {
        if (node.localName === "t") value += node.textContent ?? "";
        else if (node.localName === "tab") value += "\t";
        else if (node.localName === "br" && attr(node, "type") !== "page") value += " ";
      }
      if (caps) value = value.toLocaleUpperCase("en-GB");
      if (!value) continue;
      value = value.replace(/([*_\\])/gu, "\\$1");
      const core = value.trim();
      if (core && (bold || italic || underline)) {
        let wrapped = core; if (underline) wrapped = `_${wrapped}_`;
        wrapped = bold && italic ? `***${wrapped}***` : bold ? `**${wrapped}**` : italic ? `*${wrapped}*` : wrapped;
        value = value.replace(core, wrapped);
      }
      text += value;
    }
    // Leading tabs/spaces are a common hand-made indent (Courier: 10 characters per inch, tab ≈ 0.5").
    const lead = text.match(/^[\t ]*/u)![0];
    x += [...lead].reduce((sum, ch) => sum + (ch === "\t" ? 0.5 : 0.1), 0);
    text = text.slice(lead.length).replace(/\t+/gu, " ");
    plain.push(text);
    if (!text.trim()) continue;
    if (styleType) styled++;
    if (x > 0.4) indented++;
    lines.push({ text, x, align: jc === "right" || jc === "end" ? "right" : jc === "center" ? "center" : "left", styleType });
  }
  if (!lines.length) throw new Error("This Word document is empty. Nothing was imported.");
  const result = styled >= lines.length * 0.5 || indented >= lines.length * 0.15
    ? linesToDocument(lines.map((line) => (styled >= lines.length * 0.5 ? line : { ...line, styleType: undefined })))
    : paragraphsToDocument(plain);
  return result;
}
