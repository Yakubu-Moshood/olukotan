import type { ProjectData } from "../types";
import type { Layout } from "./pagination";
import { formatEighths, sceneIndex, type SceneRow } from "./scene-index";
import { parseCharacter, type ScreenplayDocument } from "./screenplay-elements";

export interface CharacterReportRow { name: string; speeches: number; words: number; scenes: number; firstPage?: string; sceneNumbers: string[] }
export interface LocationReportRow { location: string; intExt: string[]; timesOfDay: string[]; scenes: number; eighths: number; length: string; sceneNumbers: string[] }

const words = (text: string) => (text.trim() ? text.trim().split(/\s+/u).length : 0);

export function characterReport(document: ScreenplayDocument, projectData: ProjectData, layout?: Layout): CharacterReportRow[] {
  const rows = new Map<string, CharacterReportRow>();
  const scenes = sceneIndex(document, projectData, layout);
  const sceneOf = (index: number) => scenes.find((scene) => index >= scene.elementIndex && index < scene.endIndex);
  const elements = document.elements;
  elements.forEach((element, index) => {
    if (element.type !== "character") return;
    const name = parseCharacter(element.text).name; if (!name) return;
    const row = rows.get(name) ?? { name, speeches: 0, words: 0, scenes: 0, sceneNumbers: [] };
    row.speeches++;
    for (let j = index + 1; j < elements.length && ["dialogue", "parenthetical"].includes(elements[j].type); j++) if (elements[j].type === "dialogue") row.words += words(elements[j].text);
    const scene = sceneOf(index);
    const label = scene ? scene.number ?? String(scene.ordinal) : undefined;
    if (label && !row.sceneNumbers.includes(label)) row.sceneNumbers.push(label);
    if (!row.firstPage && layout) { const page = layout.elementPage.get(element.id); if (page) row.firstPage = layout.pages[page - 1]?.label; }
    rows.set(name, row);
  });
  return [...rows.values()].map((row) => ({ ...row, scenes: row.sceneNumbers.length })).sort((a, b) => b.speeches - a.speeches || a.name.localeCompare(b.name));
}

export function locationReport(document: ScreenplayDocument, projectData: ProjectData, layout?: Layout): LocationReportRow[] {
  const rows = new Map<string, LocationReportRow>();
  for (const scene of sceneIndex(document, projectData, layout)) {
    if (scene.omitted) continue;
    const location = (scene.location ?? scene.heading).trim();
    const row = rows.get(location) ?? { location, intExt: [], timesOfDay: [], scenes: 0, eighths: 0, length: "", sceneNumbers: [] };
    if (scene.intExt && !row.intExt.includes(scene.intExt)) row.intExt.push(scene.intExt);
    if (scene.timeOfDay && !row.timesOfDay.includes(scene.timeOfDay)) row.timesOfDay.push(scene.timeOfDay);
    row.scenes++; row.eighths += scene.eighths; row.sceneNumbers.push(scene.number ?? String(scene.ordinal));
    rows.set(location, row);
  }
  return [...rows.values()].map((row) => ({ ...row, length: formatEighths(row.eighths) })).sort((a, b) => b.scenes - a.scenes || a.location.localeCompare(b.location));
}

export function sceneReport(document: ScreenplayDocument, projectData: ProjectData, layout?: Layout): SceneRow[] {
  return sceneIndex(document, projectData, layout);
}

const csvCell = (value: unknown) => { const text = Array.isArray(value) ? value.join(", ") : String(value ?? ""); return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text; };
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
