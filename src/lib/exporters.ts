import type { ExportFormat, ProjectData, ProjectPayload } from "../types";
import { serializeFountain, type ScreenplayDocument, type ScreenplayElement } from "./screenplay-elements";
import { renderedCharacterCue } from "./screenplay-production";

export interface ExportOptions {
  includeTitlePage: boolean; includeSceneNumbers: boolean; includePageNumbers: boolean;
  includeScriptNotes: boolean; includeRevisionMarks: boolean; includeOmittedScenes: boolean;
}
export interface ExportContext { project: ProjectPayload; document: ScreenplayDocument; projectData: ProjectData; options: ExportOptions }
export interface ExportResult { format: ExportFormat; extension: string; mimeType: string; data: string | Uint8Array }
export interface Exporter { format: ExportFormat; extension: string; export(context: ExportContext): Promise<ExportResult> }

const encoder = new TextEncoder();
const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cleanFormatting = (value: string) => value.replace(/\*\*([^*]+)\*\*/gu, "$1").replace(/\*([^*]+)\*/gu, "$1").replace(/_([^_]+)_/gu, "$1");
const sceneNumber = (element: ScreenplayElement, data: ProjectData) => data.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId)?.number;
const visibleElements = (context: ExportContext) => context.document.elements.filter((element) =>
  (context.options.includeScriptNotes || element.type !== "note") &&
  (context.options.includeOmittedScenes || !context.projectData.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId)?.omitted));
const exportText = (context: ExportContext, element: ScreenplayElement) => element.type === "character"
  ? renderedCharacterCue(context.document.elements, context.document.elements.findIndex((candidate) => candidate.id === element.id), context.projectData.screenplaySettings)
  : element.text;
const titleFields = (context: ExportContext) => Object.fromEntries(context.document.preamble.split("\n").map((line) => line.split(/:\s*/u)).filter((parts) => parts.length > 1).map(([key, ...value]) => [key.toLowerCase(), value.join(": ")]));
const result = (format: ExportFormat, extension: string, mimeType: string, data: string | Uint8Array): ExportResult => ({ format, extension, mimeType, data });

function readableText(context: ExportContext) {
  return visibleElements(context).map((element) => {
    const text = cleanFormatting(exportText(context, element)); const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined;
    if (element.type === "character") return `\n${text}`;
    if (element.type === "dialogue" || element.type === "parenthetical") return `    ${text}`;
    if (element.type === "transition") return `\n${text.padStart(70)}`;
    if (element.type === "page-break") return "\f";
    return `${element.type === "scene-heading" ? "\n" : ""}${number ? `${number}  ` : ""}${text}${number ? `  ${number}` : ""}`;
  }).join("\n").trimStart() + "\n";
}

const fountainExporter: Exporter = { format: "fountain", extension: "fountain", async export(context) { return result("fountain", "fountain", "text/plain;charset=utf-8", serializeFountain(context.document)); } };
const txtExporter: Exporter = { format: "txt", extension: "txt", async export(context) { return result("txt", "txt", "text/plain;charset=utf-8", readableText(context)); } };
const markdownExporter: Exporter = { format: "md", extension: "md", async export(context) {
  const body = visibleElements(context).map((element) => {
    const text = exportText(context, element); const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined;
    if (element.type === "scene-heading") return `## ${number ? `${number} · ` : ""}${text}`;
    if (element.type === "character") return `**${text}**`;
    if (element.type === "dialogue") return `> ${text}`;
    if (element.type === "parenthetical") return `> *${text}*`;
    if (element.type === "transition") return `**${text}**`;
    if (element.type === "page-break") return "---";
    return text;
  }).join("\n\n");
  return result("md", "md", "text/markdown;charset=utf-8", `${context.options.includeTitlePage ? `# ${context.project.manifest.title}\n\n` : ""}${body}\n`);
} };
const htmlExporter: Exporter = { format: "html", extension: "html", async export(context) {
  const body = visibleElements(context).map((element) => {
    if (element.type === "page-break") return '<hr class="page-break">';
    const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined;
    return `<div class="${element.type}">${number ? `<span class="scene-number left">${escapeXml(number)}</span>` : ""}${escapeXml(exportText(context, element))}${number ? `<span class="scene-number right">${escapeXml(number)}</span>` : ""}</div>`;
  }).join("\n");
  const css = "body{max-width:720px;margin:48px auto;font:12pt/1.3 Courier New,monospace}.scene-heading{font-weight:bold;margin:1.4em 0 1em;position:relative}.action{margin:0 0 1em}.character{margin:1em 0 0 38%}.dialogue{width:54%;margin-left:23%}.parenthetical{width:40%;margin-left:30%}.transition{text-align:right}.scene-number.left{position:absolute;right:102%}.scene-number.right{position:absolute;left:102%}.page-break{break-after:page;border:0}";
  return result("html", "html", "text/html;charset=utf-8", `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(context.project.manifest.title)}</title><style>${css}</style></head><body>${context.options.includeTitlePage ? `<header><h1>${escapeXml(context.project.manifest.title)}</h1><p>${escapeXml(context.project.manifest.author)}</p></header>` : ""}${body}</body></html>`);
} };

const fdxType: Record<string, string> = { "scene-heading": "Scene Heading", action: "Action", character: "Character", parenthetical: "Parenthetical", dialogue: "Dialogue", transition: "Transition", shot: "Shot", general: "General", note: "ScriptNote" };
const fdxExporter: Exporter = { format: "fdx", extension: "fdx", async export(context) {
  const paragraphs = visibleElements(context).filter((element) => element.type !== "page-break").map((element) => {
    const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined;
    return `<Paragraph Type="${fdxType[element.type] ?? "Action"}"${number ? ` Number="${escapeXml(number)}"` : ""}${element.metadata?.sceneId ? ` SceneId="${escapeXml(element.metadata.sceneId)}"` : ""}><Text>${escapeXml(exportText(context, element))}</Text></Paragraph>`;
  }).join("");
  const title = context.options.includeTitlePage ? `<TitlePage><Content><Paragraph Type="Title"><Text>${escapeXml(context.project.manifest.title)}</Text></Paragraph><Paragraph Type="Author"><Text>${escapeXml(context.project.manifest.author)}</Text></Paragraph></Content></TitlePage>` : "";
  return result("fdx", "fdx", "application/xml;charset=utf-8", `<?xml version="1.0" encoding="UTF-8" standalone="no"?><FinalDraft DocumentType="Script" Template="No" Version="5">${title}<Content>${paragraphs}</Content></FinalDraft>`);
} };

const rtfEscape = (value: string) => [...value].map((character) => { const code = character.charCodeAt(0); if (character === "\\" || character === "{" || character === "}") return `\\${character}`; return code > 127 ? `\\u${code > 32767 ? code - 65536 : code}?` : character; }).join("");
const rtfExporter: Exporter = { format: "rtf", extension: "rtf", async export(context) {
  const body = visibleElements(context).map((element) => { const indent = element.type === "character" ? 3600 : element.type === "dialogue" ? 2160 : element.type === "parenthetical" ? 2880 : 1080; const align = element.type === "transition" ? "\\qr" : "\\ql"; const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined; const text = exportText(context, element); return `{\\pard${align}\\li${indent}\\f0\\fs24 ${rtfEscape(number ? `${number}  ${text}  ${number}` : text)}\\par}`; }).join("\n");
  return result("rtf", "rtf", "application/rtf", `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Courier New;}}${context.options.includeTitlePage ? `{\\pard\\qc\\b\\fs36 ${rtfEscape(context.project.manifest.title)}\\par\\b0\\fs24 ${rtfEscape(context.project.manifest.author)}\\page}` : ""}${body}}`);
} };

function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function le(value: number, bytes: number) { const output = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) output[i] = (value >>> (i * 8)) & 255; return output; }
function concat(parts: Uint8Array[]) { const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function zip(files: Record<string, string>) {
  const local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) { const n = encoder.encode(name), d = encoder.encode(content), crc = crc32(d); const header = concat([le(0x04034b50,4),le(20,2),le(0,2),le(0,2),le(0,2),le(0,2),le(crc,4),le(d.length,4),le(d.length,4),le(n.length,2),le(0,2),n]); local.push(header,d); central.push(concat([le(0x02014b50,4),le(20,2),le(20,2),le(0,2),le(0,2),le(0,2),le(0,2),le(crc,4),le(d.length,4),le(d.length,4),le(n.length,2),le(0,2),le(0,2),le(0,2),le(0,2),le(0,4),le(offset,4),n])); offset += header.length + d.length; }
  const centralBytes = concat(central); return concat([...local, centralBytes, le(0x06054b50,4),le(0,2),le(0,2),le(central.length,2),le(central.length,2),le(centralBytes.length,4),le(offset,4),le(0,2)]);
}
const docxExporter: Exporter = { format: "docx", extension: "docx", async export(context) {
  const paragraphs = visibleElements(context).map((element) => { const left = element.type === "character" ? 4320 : element.type === "dialogue" ? 2160 : element.type === "parenthetical" ? 2880 : 0; const align = element.type === "transition" ? '<w:jc w:val="right"/>' : ""; const pageBreak = element.type === "page-break" ? '<w:r><w:br w:type="page"/></w:r>' : ""; const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined; const text = exportText(context, element); return `<w:p><w:pPr><w:ind w:left="${left}"/>${align}</w:pPr>${pageBreak}<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(number ? `${number}  ${text}  ${number}` : text)}</w:t></w:r></w:p>`; }).join("");
  const title = context.options.includeTitlePage ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${escapeXml(context.project.manifest.title)}</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${escapeXml(context.project.manifest.author)}</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p>` : "";
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${title}${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  return result("docx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip({ "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', "_rels/.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', "word/document.xml": documentXml }));
} };

function pdfEscape(value: string) { return cleanFormatting(value).replace(/[^\x20-\x7e]/gu, "?").replace(/([\\()])/g, "\\$1"); }
const pdfExporter: Exporter = { format: "pdf", extension: "pdf", async export(context) {
  const pages: string[][] = [[]]; let line = 0; const add = (command: string, height = 1) => { if (line + height > 52) { pages.push([]); line = 0; } pages.at(-1)!.push(command); line += height; };
  if (context.options.includeTitlePage) { const fields = titleFields(context); pages[0].push(`BT /F1 20 Tf 180 500 Td (${pdfEscape(context.project.manifest.title)}) Tj ET`, `BT /F1 12 Tf 220 450 Td (${pdfEscape(fields.author ?? context.project.manifest.author)}) Tj ET`); pages.push([]); }
  for (const element of visibleElements(context)) { if (element.type === "page-break") { pages.push([]); line = 0; continue; } const x = element.type === "character" ? 260 : element.type === "dialogue" ? 170 : element.type === "parenthetical" ? 210 : element.type === "transition" ? 390 : 72; const y = 770 - line * 14; const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined; if (number) { const position = context.projectData.screenplaySettings.sceneNumbers.position; if (position !== "right") pages.at(-1)!.push(`BT /F1 10 Tf 38 ${y} Td (${pdfEscape(number)}) Tj ET`); if (position !== "left") pages.at(-1)!.push(`BT /F1 10 Tf 535 ${y} Td (${pdfEscape(number)}) Tj ET`); } add(`BT /F1 11 Tf ${x} ${y} Td (${pdfEscape(exportText(context, element))}) Tj ET`, element.type === "scene-heading" ? 2 : 1); }
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"]; const kids: string[] = [];
  const pageSettings = context.projectData.screenplaySettings.pageNumbers, titleOffset = context.options.includeTitlePage ? 1 : 0;
  const startPage = pageSettings.startOnPage === "custom" ? pageSettings.customStartPage : pageSettings.startOnPage;
  pages.forEach((commands, index) => { const pageNo = 4 + index * 2, contentNo = pageNo + 1, scriptPage = index - titleOffset + 1; kids.push(`${pageNo} 0 R`); if (context.options.includePageNumbers && pageSettings.enabled && scriptPage >= startPage && !(pageSettings.hideOnFirstPage && scriptPage === 1)) { const position = pageSettings.position; const x = position === "top-centre" ? 292 : 540, y = position === "bottom-right" ? 35 : 812; const visibleNumber = pageSettings.firstVisibleNumber + scriptPage - startPage; commands.push(`BT /F1 10 Tf ${x} ${y} Td (${visibleNumber}) Tj ET`); } const stream = commands.join("\n"); objects[pageNo - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`; objects[contentNo - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`; }); objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return result("pdf", "pdf", "application/pdf", encoder.encode(pdf));
} };

export const exporters: Record<ExportFormat, Exporter> = { pdf: pdfExporter, fdx: fdxExporter, docx: docxExporter, rtf: rtfExporter, fountain: fountainExporter, txt: txtExporter, md: markdownExporter, html: htmlExporter };
export async function exportScreenplay(format: ExportFormat, context: ExportContext) { return exporters[format].export(context); }
export function downloadExport(fileName: string, exported: ExportResult) { const blob = new Blob([exported.data as BlobPart], { type: exported.mimeType }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${fileName}.${exported.extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
