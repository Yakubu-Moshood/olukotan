import { defaultProjectData, type ProjectData } from "../types";
import { parseFdx } from "./fdx";
import { parseTitlePage } from "./pagination";
import { parseCharacter, parseFountain, serializeFountain, type ScreenplayDocument } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";

export interface ImportPreview {
  format: "fdx" | "fountain" | "docx" | "pdf";
  fileName: string;
  title: string;
  author: string;
  document: ScreenplayDocument;
  projectData: ProjectData;
  warnings: string[];
  stats: { scenes: number; characters: number; elements: number; dualDialogue: number };
  sceneHeadings: string[];
}

/** Parses a screenplay file into a previewable project. Throws a writer-friendly error; never partially imports. */
export function importScreenplayFile(fileName: string, text: string, now = new Date().toISOString()): ImportPreview {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const base = fileName.replace(/\.[^.]+$/u, "");
  const data = defaultProjectData();
  let document: ScreenplayDocument, warnings: string[] = [], dualDialogue = 0, format: ImportPreview["format"];
  if (extension === "fdx" || /^\s*(?:<\?xml[^>]*>\s*)?<FinalDraft[\s>]/u.test(text)) {
    format = "fdx";
    const result = parseFdx(text);
    document = result.document; warnings = result.warnings; dualDialogue = result.stats.dualDialogue;
    data.scenes = result.scenes; data.revisionSets = result.revisionSets;
    const numbered = result.scenes.some((scene) => scene.number);
    data.screenplaySettings.sceneNumbers = { ...data.screenplaySettings.sceneNumbers, enabled: numbered, mode: "manual" };
    data.screenplaySettings.revisions = { enabled: !!result.activeRevisionSetId, activeSetId: result.activeRevisionSetId, showMarks: true };
    data.importSource = { format: "fdx", fileName, importedAt: now, fdxTemplate: result.template };
  } else if (["fountain", "spmd", "txt", "md"].includes(extension)) {
    format = "fountain";
    document = parseFountain(text.replace(/\r\n/gu, "\n"));
    data.importSource = { format: "fountain", fileName, importedAt: now };
    if (!document.elements.some((element) => element.type === "scene-heading" && element.text)) warnings.push("No scene headings were recognised. Check that headings start with INT. or EXT.");
  } else {
    throw new Error(`Olukotan can import Final Draft (.fdx) and Fountain (.fountain, .txt) files. “${fileName}” was not changed.`);
  }
  const prepared = synchroniseSceneMetadata(document, data);
  const fields = parseTitlePage(prepared.document.preamble);
  const sceneHeadings = prepared.document.elements.filter((element) => element.type === "scene-heading" && element.text).map((element) => element.text);
  const characters = new Set(prepared.document.elements.filter((element) => element.type === "character").map((element) => parseCharacter(element.text).name).filter(Boolean)).size;
  return {
    format, fileName, title: (fields.title ?? base).split("\n")[0].replace(/[*_]/gu, ""), author: (fields.author ?? "").split("\n")[0],
    document: prepared.document, projectData: prepared.projectData, warnings,
    stats: { scenes: sceneHeadings.length, characters, elements: prepared.document.elements.length, dualDialogue }, sceneHeadings,
  };
}

export const importedFountain = (preview: ImportPreview) => serializeFountain(preview.document);

const BINARY_FORMATS = ["docx", "pdf"];
export const IMPORT_ACCEPT = ".fdx,.fountain,.spmd,.txt,.docx,.pdf";

/** Imports any supported file from its bytes: FDX, Fountain/text, Word (.docx) or PDF. */
export async function importScreenplayBytes(fileName: string, bytes: Uint8Array, now = new Date().toISOString()): Promise<ImportPreview> {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (!BINARY_FORMATS.includes(extension)) return importScreenplayFile(fileName, new TextDecoder().decode(bytes), now);
  if (extension === "doc") throw new Error("Old Word .doc files can't be read. Open it in Word and save as .docx, then import again.");
  const base = fileName.replace(/\.[^.]+$/u, "");
  const { parseDocx } = await import("./docx-import");
  const { parsePdf } = await import("./pdf-import");
  const result = extension === "docx" ? await parseDocx(bytes) : await parsePdf(bytes);
  const data = defaultProjectData();
  data.importSource = { format: "fountain", fileName, importedAt: now };
  const titleLines = "titlePage" in result && Array.isArray(result.titlePage) ? (result.titlePage as string[]).filter(Boolean) : [];
  const byIndex = titleLines.findIndex((line) => /\bby\b/iu.test(line));
  const title = (byIndex > 0 ? titleLines.slice(0, byIndex).join(" ") : titleLines[0]) || base;
  const author = byIndex >= 0 ? titleLines[byIndex + 1] ?? "" : "";
  const document = { ...result.document, preamble: [`Title: ${title}`, ...(author ? [`Author: ${author}`] : [])].join("\n") };
  const prepared = synchroniseSceneMetadata(document, data);
  const sceneHeadings = prepared.document.elements.filter((element) => element.type === "scene-heading" && element.text).map((element) => element.text);
  const characters = new Set(prepared.document.elements.filter((element) => element.type === "character").map((element) => parseCharacter(element.text).name).filter(Boolean)).size;
  const warnings = [...result.warnings];
  if (result.confidence < 0.25) warnings.unshift("Few screenplay elements were recognised. This may not be a formatted script; check the preview before importing.");
  return { format: extension as "docx" | "pdf", fileName, title, author, document: prepared.document, projectData: prepared.projectData, warnings,
    stats: { scenes: sceneHeadings.length, characters, elements: prepared.document.elements.length, dualDialogue: 0 }, sceneHeadings };
}
