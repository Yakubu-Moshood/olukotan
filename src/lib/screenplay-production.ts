import type { ProjectData, SceneMetadata, ScreenplaySettings } from "../types";
import { migrateProjectData } from "../types";
import { parseCharacter, type ScreenplayDocument, type ScreenplayElement } from "./screenplay-elements";

function stableId() {
  return globalThis.crypto?.randomUUID?.() ?? `scene-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function sceneHeadingParts(heading: string) {
  const match = heading.trim().match(/^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|I\/E\.|EST\.)\s*(.*?)(?:\s+-\s+([^-]+))?$/iu);
  return { intExt: match?.[1]?.toLocaleUpperCase("en-GB"), location: match?.[2]?.trim(), timeOfDay: match?.[3]?.trim() };
}

export function synchroniseSceneMetadata(document: ScreenplayDocument, input?: Partial<ProjectData>) {
  const projectData = migrateProjectData(input);
  const existing = new Map(projectData.scenes.map((scene) => [scene.sceneId, scene]));
  const scenes: SceneMetadata[] = [];
  const elements = document.elements.map((element) => {
    if (element.type !== "scene-heading") return element;
    const sceneId = element.metadata?.sceneId || stableId();
    const prior = existing.get(sceneId);
    const parts = sceneHeadingParts(element.text);
    const scene: SceneMetadata = {
      ...prior,
      sceneId,
      numberingMode: projectData.screenplaySettings.sceneNumbers.mode,
      intExt: parts.intExt,
      location: parts.location,
      timeOfDay: parts.timeOfDay,
    };
    scenes.push(scene);
    return { ...element, metadata: { ...element.metadata, sceneId } };
  });

  if (projectData.screenplaySettings.sceneNumbers.mode === "automatic") {
    scenes.forEach((scene, index) => { scene.number = String(index + 1); scene.locked = false; });
  }
  const numberedElements = elements.map((element) => {
    if (element.type !== "scene-heading") return element;
    const scene = scenes.find((value) => value.sceneId === element.metadata?.sceneId);
    return { ...element, metadata: { ...element.metadata, sceneNumber: scene?.number } };
  });
  return { document: { ...document, elements: numberedElements }, projectData: { ...projectData, scenes } };
}

export function displaySceneNumber(element: ScreenplayElement, projectData: ProjectData) {
  if (element.type !== "scene-heading" || !projectData.screenplaySettings.sceneNumbers.enabled) return undefined;
  return projectData.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId)?.number;
}

export function automaticContinued(elements: ScreenplayElement[], index: number, settings: ScreenplaySettings): boolean {
  if (settings.continueds.character !== "automatic" || elements[index]?.type !== "character") return false;
  const name = parseCharacter(elements[index].text).name;
  let sawInterruption = false;
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const element = elements[cursor];
    if (element.type === "scene-heading") return false;
    if (element.type === "action" || element.type === "shot" || element.type === "general") sawInterruption = true;
    if (element.type === "character") return sawInterruption && parseCharacter(element.text).name === name;
  }
  return false;
}

export function autocompleteSuggestions(
  element: ScreenplayElement | undefined,
  knownCharacters: string[],
  scenePrefixes: string[],
) {
  if (!element || !["action", "character", "scene-heading"].includes(element.type)) return [];
  const query = element.text.trim().toLocaleUpperCase("en-GB");
  if (element.type === "character") return knownCharacters
    .filter((name) => name.startsWith(parseCharacter(query).name) && name !== parseCharacter(query).name)
    .map((value) => ({ value, type: "character" as const, category: "Characters" }));
  if (element.type === "scene-heading") return scenePrefixes
    .filter((prefix) => prefix.startsWith(query))
    .map((value) => ({ value, type: "scene-heading" as const, category: "Scene Headings" }));

  const characters = knownCharacters.filter((name) => !query || name.startsWith(query))
    .map((value) => ({ value, type: "character" as const, category: "Characters" }));
  const prefixes = scenePrefixes.filter((prefix) => !query || prefix.startsWith(query))
    .map((value) => ({ value, type: "scene-heading" as const, category: "Scene Headings" }));
  return [...characters, ...prefixes].slice(0, 8);
}
