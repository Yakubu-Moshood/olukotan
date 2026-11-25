import type { ExportFormat, ProjectData, ProjectPayload } from "../types";
import { serializeFountain, type ScreenplayDocument, type ScreenplayElement } from "./screenplay-elements";
import { renderedCharacterCue } from "./screenplay-production";
import { layoutTitlePage, paginate, parseTitlePage, type Layout } from "./pagination";
import type { FontLoader } from "./pdf-render";
import { charsOf, visibleText } from "./rich-text";
import { revisionHeader, revisionMarkFor } from "./revisions";
import { writeFdx } from "./fdx";

export interface ExportOptions {
  includeTitlePage: boolean; includeSceneNumbers: boolean; includePageNumbers: boolean;
  includeScriptNotes: boolean; includeRevisionMarks: boolean; includeOmittedScenes: boolean;
}
export interface ExportContext { project: ProjectPayload; document: ScreenplayDocument; projectData: ProjectData; options: ExportOptions; fontLoader?: FontLoader }
export interface ExportResult { format: ExportFormat; extension: string; mimeType: string; data: string | Uint8Array }
export interface Exporter { format: ExportFormat; extension: string; export(context: ExportContext): Promise<ExportResult> }

const encoder = new TextEncoder();
const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cleanFormatting = (value: string) => visibleText(value);
/** Styled runs of an element's text (bold / italic / underline). */
function runsOf(value: string) {
  const runs: { text: string; bold: boolean; italic: boolean; underline: boolean }[] = [];
  for (const c of charsOf(value)) { const last = runs.at(-1); if (last && last.bold === c.bold && last.italic === c.italic && last.underline === c.underline) last.text += c.ch; else runs.push({ text: c.ch, bold: c.bold, italic: c.italic, underline: c.underline }); }
  return runs;
}
const htmlRuns = (value: string) => runsOf(value).map((run) => { let out = escapeXml(run.text); if (run.underline) out = `<u>${out}</u>`; if (run.italic) out = `<em>${out}</em>`; if (run.bold) out = `<strong>${out}</strong>`; return out; }).join("");
const rtfRuns = (value: string) => runsOf(value).map((run) => { const on = `${run.bold ? "\\b " : ""}${run.italic ? "\\i " : ""}${run.underline ? "\\ul " : ""}`; return on ? `{${on}${rtfEscape(run.text)}}` : rtfEscape(run.text); }).join("");
const docxRuns = (value: string) => runsOf(value).map((run) => `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>${run.bold ? "<w:b/>" : ""}${run.italic ? "<w:i/>" : ""}${run.underline ? '<w:u w:val="single"/>' : ""}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`).join("");
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
    return `<div class="${element.type}">${number ? `<span class="scene-number left">${escapeXml(number)}</span>` : ""}${htmlRuns(exportText(context, element))}${number ? `<span class="scene-number right">${escapeXml(number)}</span>` : ""}</div>`;
  }).join("\n");
  const css = "body{max-width:720px;margin:48px auto;font:12pt/1.3 Courier New,monospace}.scene-heading{font-weight:bold;margin:1.4em 0 1em;position:relative}.action{margin:0 0 1em}.character{margin:1em 0 0 38%}.dialogue{width:54%;margin-left:23%}.parenthetical{width:40%;margin-left:30%}.transition{text-align:right}.scene-number.left{position:absolute;right:102%}.scene-number.right{position:absolute;left:102%}.page-break{break-after:page;border:0}";
  return result("html", "html", "text/html;charset=utf-8", `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(context.project.manifest.title)}</title><style>${css}</style></head><body>${context.options.includeTitlePage ? `<header><h1>${escapeXml(context.project.manifest.title)}</h1><p>${escapeXml(context.project.manifest.author)}</p></header>` : ""}${body}</body></html>`);
} };

const fdxExporter: Exporter = { format: "fdx", extension: "fdx", async export(context) {
  const fields = parseTitlePage(context.document.preamble);
  // Character cues are written as typed: Final Draft computes its own automatic (CONT'D).
  const xml = writeFdx(context.document, context.projectData, {
    includeSceneNumbers: context.options.includeSceneNumbers, includeNotes: context.options.includeScriptNotes, includeTitlePage: context.options.includeTitlePage,
    titlePage: { ...fields, title: fields.title ?? context.project.manifest.title, author: fields.author ?? context.project.manifest.author },
    template: context.projectData.importSource?.fdxTemplate,
  });
  return result("fdx", "fdx", "application/xml;charset=utf-8", xml);
} };

const rtfEscape = (value: string) => [...value].map((character) => { const code = character.charCodeAt(0); if (character === "\\" || character === "{" || character === "}") return `\\${character}`; return code > 127 ? `\\u${code > 32767 ? code - 65536 : code}?` : character; }).join("");
const rtfExporter: Exporter = { format: "rtf", extension: "rtf", async export(context) {
  const body = visibleElements(context).map((element) => { const indent = element.type === "character" ? 3600 : element.type === "dialogue" ? 2160 : element.type === "parenthetical" ? 2880 : 1080; const align = element.type === "transition" ? "\\qr" : "\\ql"; const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined; const text = exportText(context, element); return `{\\pard${align}\\li${indent}\\f0\\fs24 ${number ? `${rtfEscape(number)}  ` : ""}${rtfRuns(text)}${number ? `  ${rtfEscape(number)}` : ""}\\par}`; }).join("\n");
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
  const paragraphs = visibleElements(context).map((element) => { const left = element.type === "character" ? 4320 : element.type === "dialogue" ? 2160 : element.type === "parenthetical" ? 2880 : 0; const align = element.type === "transition" ? '<w:jc w:val="right"/>' : ""; const pageBreak = element.type === "page-break" ? '<w:r><w:br w:type="page"/></w:r>' : ""; const number = context.options.includeSceneNumbers && element.type === "scene-heading" ? sceneNumber(element, context.projectData) : undefined; const text = exportText(context, element); return `<w:p><w:pPr><w:ind w:left="${left}"/>${align}</w:pPr>${pageBreak}${docxRuns(number ? `${number}  ${text}  ${number}` : text)}</w:p>`; }).join("");
  const title = context.options.includeTitlePage ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${escapeXml(context.project.manifest.title)}</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${escapeXml(context.project.manifest.author)}</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p>` : "";
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${title}${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  return result("docx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip({ "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', "_rels/.rels": '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', "word/document.xml": documentXml }));
} };

export function layoutForExport(context: ExportContext): Layout {
  const layout = paginate(context.document, context.projectData, {
    lockedPages: context.projectData.pageLock.locked ? context.projectData.pageLock.pageStarts : undefined,
    includeNotes: context.options.includeScriptNotes, includeOmitted: context.options.includeOmittedScenes,
    sceneNumber: (element) => sceneNumber(element, context.projectData),
    revisionMark: (element) => revisionMarkFor(element, context.projectData),
  });
  if (context.options.includeTitlePage) {
    const fields = parseTitlePage(context.document.preamble);
    layout.titlePage = layoutTitlePage({ ...fields, title: fields.title ?? context.project.manifest.title, author: fields.author ?? context.project.manifest.author }, layout.geometry);
  }
  return layout;
}

const pdfExporter: Exporter = { format: "pdf", extension: "pdf", async export(context) {
  const layout = layoutForExport(context);
  // pdf-lib and the font engine are large; load them only when a PDF is exported.
  const { renderPdf } = await import("./pdf-render");
  const bytes = await renderPdf(layout, {
    settings: context.projectData.screenplaySettings, includePageNumbers: context.options.includePageNumbers,
    includeSceneNumbers: context.options.includeSceneNumbers, includeRevisionMarks: context.options.includeRevisionMarks,
    header: context.options.includeRevisionMarks ? revisionHeader(context.projectData) : undefined,
    title: context.project.manifest.title, author: context.project.manifest.author, fontLoader: context.fontLoader,
  });
  return result("pdf", "pdf", "application/pdf", bytes);
} };

export const exporters: Record<ExportFormat, Exporter> = { pdf: pdfExporter, fdx: fdxExporter, docx: docxExporter, rtf: rtfExporter, fountain: fountainExporter, txt: txtExporter, md: markdownExporter, html: htmlExporter };
export async function exportScreenplay(format: ExportFormat, context: ExportContext) { return exporters[format].export(context); }
export function downloadExport(fileName: string, exported: ExportResult) { const blob = new Blob([exported.data as BlobPart], { type: exported.mimeType }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${fileName}.${exported.extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
