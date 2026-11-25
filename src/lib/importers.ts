import { defaultProjectData, type ProjectData } from "../types";
import { parseFdx } from "./fdx";
import { parseTitlePage } from "./pagination";
import { parseCharacter, parseFountain, serializeFountain, type ScreenplayDocument } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";

export interface ImportPreview {
  format: "fdx" | "fountain";
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
