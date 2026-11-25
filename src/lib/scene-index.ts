import type { ProjectData } from "../types";
import type { Layout } from "./pagination";
import { parseCharacter, type ScreenplayDocument, type ScreenplayElement } from "./screenplay-elements";
import { sceneHeadingParts } from "./screenplay-production";

export interface SceneRow {
  sceneId: string;
  /** Index of the scene-heading element in the document. */
  elementIndex: number;
  /** Index of the first element after this scene (exclusive end). */
  endIndex: number;
  ordinal: number;
  number?: string;
  heading: string;
  intExt?: string;
  location?: string;
  timeOfDay?: string;
  page?: string;
  /** Length in printed lines, and as industry eighths of a page (e.g. "1 3/8"). */
  lines: number;
  eighths: number;
  length: string;
  summary?: string;
  colour?: string;
  omitted: boolean;
  characters: string[];
  words: number;
}

/** Formats eighths of a page the way production boards do: 3/8, 1, 1 2/8. */
export function formatEighths(eighths: number): string {
  if (eighths <= 0) return "0";
  const whole = Math.floor(eighths / 8), rest = eighths % 8;
  return [whole ? String(whole) : "", rest ? `${rest}/8` : ""].filter(Boolean).join(" ");
}

export function sceneIndex(document: ScreenplayDocument, projectData: ProjectData, layout?: Layout): SceneRow[] {
  const elements = document.elements;
  const lineCount = new Map<string, number>();
  if (layout) for (const page of layout.pages) for (const line of page.lines) if (line.elementId) lineCount.set(line.elementId, (lineCount.get(line.elementId) ?? 0) + 1);
  const linesPerPage = layout?.geometry.linesPerPage ?? 54;
  const rows: SceneRow[] = [];
  const headings = elements.map((element, index) => ({ element, index })).filter(({ element }) => element.type === "scene-heading" && element.text.trim());
  headings.forEach(({ element, index }, ordinal) => {
    const endIndex = headings[ordinal + 1]?.index ?? elements.length;
    const body = elements.slice(index, endIndex);
    const sceneId = element.metadata?.sceneId ?? element.id;
    const meta = projectData.scenes.find((scene) => scene.sceneId === sceneId);
    const lines = body.reduce((sum, item) => sum + (lineCount.get(item.id) ?? 0) + (lineCount.has(item.id) && item.type !== "dialogue" && item.type !== "parenthetical" ? 1 : 0), 0);
    const eighths = layout ? Math.max(1, Math.ceil((lines / linesPerPage) * 8)) : 0;
    const parts = sceneHeadingParts(element.text);
    rows.push({
      sceneId, elementIndex: index, endIndex, ordinal: ordinal + 1, number: meta?.number, heading: element.text,
      intExt: parts.intExt, location: parts.location, timeOfDay: parts.timeOfDay,
      page: layout ? pageLabelFor(layout, element) : undefined, lines, eighths, length: formatEighths(eighths),
      summary: meta?.summary, colour: meta?.colour, omitted: Boolean(meta?.omitted || element.metadata?.omitted),
      characters: [...new Set(body.filter((item) => item.type === "character").map((item) => parseCharacter(item.text).name).filter(Boolean))],
      words: body.reduce((sum, item) => sum + (item.text.trim() ? item.text.trim().split(/\s+/u).length : 0), 0),
    });
  });
  return rows;
}

function pageLabelFor(layout: Layout, element: ScreenplayElement) {
  const page = layout.elementPage.get(element.id);
  return page ? layout.pages[page - 1]?.label ?? String(page) : undefined;
}

/**
 * Moves a whole scene (heading through to the next heading) so it lands before
 * the scene at `beforeSceneId`, or at the end when `beforeSceneId` is null.
 */
export function moveScene(document: ScreenplayDocument, sceneId: string, beforeSceneId: string | null): ScreenplayDocument {
  const elements = document.elements;
  const start = elements.findIndex((element) => element.type === "scene-heading" && element.metadata?.sceneId === sceneId);
  if (start < 0 || sceneId === beforeSceneId) return document;
  let end = start + 1; while (end < elements.length && elements[end].type !== "scene-heading") end++;
  const block = elements.slice(start, end);
  const rest = [...elements.slice(0, start), ...elements.slice(end)];
  const target = beforeSceneId ? rest.findIndex((element) => element.type === "scene-heading" && element.metadata?.sceneId === beforeSceneId) : rest.length;
  if (target < 0) return document;
  return { ...document, elements: [...rest.slice(0, target), ...block, ...rest.slice(target)] };
}

export const SCENE_COLOURS = ["#e57373", "#ffb74d", "#fff176", "#81c784", "#4fc3f7", "#7986cb", "#ba68c8", "#a1887f", "#90a4ae"];
