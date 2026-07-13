export type ScreenplayElementType =
  | "scene-heading" | "action" | "character" | "parenthetical" | "dialogue"
  | "transition" | "shot" | "general" | "section" | "synopsis" | "note" | "page-break";

export interface ScreenplayElement {
  id: string;
  type: ScreenplayElementType;
  text: string;
  metadata?: {
    sceneId?: string;
    sceneNumber?: string;
    characterName?: string;
    characterExtension?: string;
    revisionSet?: string;
    omitted?: boolean;
    dualDialogueGroupId?: string;
  };
}

export interface ScreenplayDocument {
  preamble: string;
  elements: ScreenplayElement[];
}

export interface TransitionContext {
  currentType: ScreenplayElementType;
  currentText: string;
  previousType?: ScreenplayElementType;
  previousText?: string;
  nextType?: ScreenplayElementType;
  knownCharacters: string[];
  cursorPosition: number;
  isElementEmpty: boolean;
}

export interface EditResult {
  elements: ScreenplayElement[];
  activeIndex: number;
  cursorPosition: number;
}

export const ELEMENT_LABELS: Record<ScreenplayElementType, string> = {
  "scene-heading": "Scene Heading", action: "Action", character: "Character",
  parenthetical: "Parenthetical", dialogue: "Dialogue", transition: "Transition",
  shot: "Shot", general: "General Text", section: "Section", synopsis: "Synopsis",
  note: "Note", "page-break": "Page Break",
};

export const ELEMENT_CYCLE: ScreenplayElementType[] = ["action", "character", "scene-heading", "transition", "shot"];
export const SCENE_PREFIXES = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E.", "EST."];
export const TIMES_OF_DAY = ["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", "DAWN", "DUSK", "CONTINUOUS", "LATER", "MOMENTS LATER", "SAME"];
export const COMMON_TRANSITIONS = ["CUT TO:", "SMASH CUT TO:", "MATCH CUT TO:", "DISSOLVE TO:", "FADE IN:", "FADE OUT.", "FADE TO BLACK.", "INTERCUT:", "BACK TO:"];
export const COMMON_SHOTS = ["CLOSE ON:", "ANGLE ON", "INSERT:", "POV:", "WIDE SHOT:", "ESTABLISHING SHOT:"];

const SCENE_PATTERN = /^(?:INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.|I\/E\.|EST\.)\s*/iu;
const CHARACTER_PATTERN = /^([^()]{1,40}?)(?:\s+\(([^)]+)\))?$/u;
const STRUCTURAL_MARKER = /^\/\*\s*OLUKOTAN:([a-z-]+)\s*\*\/$/i;
const SCENE_ID_MARKER = /^\/\*\s*OLUKOTAN:SCENE-ID:([^*]+)\*\/$/i;

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `element-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createElement(type: ScreenplayElementType, text = "", metadata?: ScreenplayElement["metadata"]): ScreenplayElement {
  return { id: id(), type, text: normalizeElementText(type, text), ...(metadata ? { metadata } : {}) };
}

export function normalizeElementText(type: ScreenplayElementType, text: string): string {
  const clean = text.replace(/\r?\n/g, " ");
  if (["scene-heading", "character", "transition", "shot"].includes(type)) return clean.toLocaleUpperCase("en-GB");
  if (type === "parenthetical") {
    if (!clean) return "";
    const inner = clean.replace(/^\(/, "").replace(/\)$/, "");
    return `(${inner})`;
  }
  return clean;
}

export function normalizedCursorPosition(type: ScreenplayElementType, rawText: string, cursor: number): number {
  if (["scene-heading", "character", "transition", "shot"].includes(type)) {
    return rawText.slice(0, cursor).toLocaleUpperCase("en-GB").length;
  }
  if (type === "parenthetical") return Math.max(1, Math.min(normalizeElementText(type, rawText).length - 1, cursor + (rawText.startsWith("(") ? 0 : 1)));
  return cursor;
}

export function parseCharacter(text: string) {
  const match = normalizeElementText("character", text).match(CHARACTER_PATTERN);
  if (!match) return { name: normalizeElementText("character", text), extension: undefined };
  return { name: match[1].trim(), extension: match[2]?.trim() };
}

export function isSceneHeading(text: string) { return SCENE_PATTERN.test(text.trim()); }
export function isTransition(text: string) { return COMMON_TRANSITIONS.includes(text.trim().toLocaleUpperCase("en-GB")); }
export function isShot(text: string) {
  const upper = text.trim().toLocaleUpperCase("en-GB");
  return COMMON_SHOTS.some((shot) => upper === shot || upper.startsWith(`${shot} `));
}

export function isLikelyCharacter(text: string, knownCharacters: string[] = [], explicit = false): boolean {
  const upper = text.trim().toLocaleUpperCase("en-GB");
  if (!upper || upper.length > 42 || /[.!?:]$/.test(upper)) return false;
  const parsed = parseCharacter(upper);
  if (knownCharacters.some((name) => name === parsed.name)) return true;
  if (explicit) return /^[\p{L}\p{M}' -]{1,32}(?:\s+\([^)]+\))?$/u.test(upper);
  return text === upper && upper.split(/\s+/u).length <= 3 && /^[\p{Lu}\p{M}' -]+(?:\s+\([^)]+\))?$/u.test(upper);
}

export function detectElementType(text: string, options: { knownCharacters?: string[]; afterAction?: boolean; explicitCharacter?: boolean } = {}): ScreenplayElementType {
  const trimmed = text.trim();
  if (isSceneHeading(trimmed)) return "scene-heading";
  if (isTransition(trimmed)) return "transition";
  if (/^\(.*\)$/u.test(trimmed)) return "parenthetical";
  if (isShot(trimmed)) return "shot";
  if (options.afterAction && isLikelyCharacter(trimmed, options.knownCharacters, options.explicitCharacter)) return "character";
  return "action";
}

export function getNextElementType(context: TransitionContext): ScreenplayElementType {
  if (context.isElementEmpty) {
    if (context.currentType === "action") return "character";
    if (["character", "dialogue", "scene-heading"].includes(context.currentType)) return "action";
    if (context.currentType === "parenthetical") return "dialogue";
  }
  switch (context.currentType) {
    case "scene-heading": return "action";
    case "character": return "dialogue";
    case "parenthetical": return "dialogue";
    case "dialogue": return "action";
    case "transition": return "scene-heading";
    case "shot": return "action";
    default: return "action";
  }
}

export function getTabElementType(current: ScreenplayElement, previous?: ScreenplayElement, shift = false): ScreenplayElementType {
  if (!current.text && current.type === "dialogue") return previous?.type === "character" ? "parenthetical" : "action";
  if (current.type === "character" && current.text && !shift) return "parenthetical";
  const cycleIndex = ELEMENT_CYCLE.indexOf(current.type);
  const index = cycleIndex < 0 ? 0 : (cycleIndex + (shift ? -1 : 1) + ELEMENT_CYCLE.length) % ELEMENT_CYCLE.length;
  return ELEMENT_CYCLE[index];
}

export function collectKnownCharacters(elements: ScreenplayElement[]): string[] {
  return [...new Set(elements.filter((element) => element.type === "character").map((element) => parseCharacter(element.text).name).filter(Boolean))];
}

export function collectSceneLocations(elements: ScreenplayElement[]): string[] {
  return [...new Set(elements.filter((element) => element.type === "scene-heading").map((element) => element.text.replace(SCENE_PATTERN, "").split(/\s+-\s+/u)[0]?.trim()).filter(Boolean))];
}

export function updateElementText(elements: ScreenplayElement[], index: number, rawText: string, explicitCharacter = false): EditResult {
  const knownCharacters = collectKnownCharacters(elements);
  const current = elements[index];
  let type = current.type;
  if (type === "action") {
    const detected = detectElementType(rawText, { knownCharacters, afterAction: true, explicitCharacter });
    const knownName = knownCharacters.includes(parseCharacter(rawText).name);
    type = detected === "character" && !knownName && !explicitCharacter ? "action" : detected;
  } else if (type === "dialogue" && rawText.trimStart().startsWith("(")) type = "parenthetical";
  const text = normalizeElementText(type, rawText);
  const metadata = type === "character" ? (() => { const value = parseCharacter(text); return { ...current.metadata, characterName: value.name, characterExtension: value.extension }; })() : current.metadata;
  const next = elements.map((element, position) => position === index ? { ...element, type, text, metadata } : element);
  return { elements: next, activeIndex: index, cursorPosition: normalizedCursorPosition(type, rawText, rawText.length) };
}

export function applyEnter(elements: ScreenplayElement[], index: number, cursorPosition: number): EditResult {
  const current = elements[index];
  const knownCharacters = collectKnownCharacters(elements);
  if (current.type === "action" && current.text && isLikelyCharacter(current.text, knownCharacters, false)) {
    const character = { ...current, type: "character" as const, text: normalizeElementText("character", current.text), metadata: { ...current.metadata, characterName: parseCharacter(current.text).name, characterExtension: parseCharacter(current.text).extension } };
    const dialogue = createElement("dialogue");
    const next = [...elements]; next.splice(index, 1, character, dialogue);
    return { elements: next, activeIndex: index + 1, cursorPosition: 0 };
  }
  const before = current.text.slice(0, cursorPosition);
  const after = current.text.slice(cursorPosition);
  const semanticallyEmpty = current.type === "parenthetical" ? !current.text.replace(/[()]/g, "").trim() : !current.text.trim();
  const nextType = getNextElementType({ currentType: current.type, currentText: current.text,
    previousType: elements[index - 1]?.type, previousText: elements[index - 1]?.text,
    nextType: elements[index + 1]?.type, knownCharacters, cursorPosition, isElementEmpty: semanticallyEmpty });
  if (semanticallyEmpty) {
    const replacement = { ...current, type: nextType, text: "", metadata: undefined };
    const next = [...elements]; next[index] = replacement;
    return { elements: next, activeIndex: index, cursorPosition: 0 };
  }
  const next = [...elements];
  next[index] = { ...current, text: before };
  next.splice(index + 1, 0, createElement(after ? current.type : nextType, after));
  return { elements: next, activeIndex: index + 1, cursorPosition: 0 };
}

export function applyTab(elements: ScreenplayElement[], index: number, shift = false): EditResult {
  const current = elements[index];
  const type = getTabElementType(current, elements[index - 1], shift);
  if (current.type === "character" && current.text && !shift) {
    const next = [...elements]; next.splice(index + 1, 0, createElement("parenthetical", "()"));
    return { elements: next, activeIndex: index + 1, cursorPosition: 1 };
  }
  const next = [...elements]; next[index] = { ...current, type, text: normalizeElementText(type, current.text) };
  return { elements: next, activeIndex: index, cursorPosition: type === "parenthetical" ? 1 : next[index].text.length };
}

function elementFromLine(type: ScreenplayElementType, text: string): ScreenplayElement {
  const sceneNumber = type === "scene-heading" ? text.match(/\s+#([^#]+)#\s*$/u)?.[1] : undefined;
  const cleanText = sceneNumber ? text.replace(/\s+#[^#]+#\s*$/u, "") : text;
  const element = createElement(type, cleanText);
  if (type === "character") {
    const parsed = parseCharacter(element.text);
    element.metadata = { characterName: parsed.name, characterExtension: parsed.extension };
  }
  if (type === "scene-heading") {
    if (sceneNumber) element.metadata = { sceneNumber };
  }
  return element;
}

export function parseFountain(source: string): ScreenplayDocument {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const preamble: string[] = [];
  while (lines.length && (/^[A-Za-z][A-Za-z ]+:/u.test(lines[0]) || (!lines[0].trim() && preamble.length))) {
    preamble.push(lines.shift()!);
    if (preamble.length && !lines[0]?.trim() && preamble.at(-1) === "") { lines.shift(); break; }
  }
  const elements: ScreenplayElement[] = [];
  let marker: ScreenplayElementType | undefined;
  let pendingSceneId: string | undefined;
  let expectingDialogue = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]; const line = raw.trim();
    if (!line) { expectingDialogue = false; continue; }
    const sceneIdMarker = line.match(SCENE_ID_MARKER);
    if (sceneIdMarker) { pendingSceneId = sceneIdMarker[1].trim(); continue; }
    const marked = line.match(STRUCTURAL_MARKER);
    if (marked) { marker = marked[1] as ScreenplayElementType; continue; }
    if (marker) { elements.push(elementFromLine(marker, line.replace(/^!/u, ""))); marker = undefined; expectingDialogue = false; continue; }
    if (line === "===") { elements.push(createElement("page-break")); expectingDialogue = false; continue; }
    if (line.startsWith("[[") && line.endsWith("]]")) { elements.push(createElement("note", line.slice(2, -2))); continue; }
    if (line.startsWith("#")) { elements.push(createElement("section", line.replace(/^#+\s*/u, ""))); continue; }
    if (line.startsWith("=")) { elements.push(createElement("synopsis", line.replace(/^=\s*/u, ""))); continue; }
    if (line.startsWith("!")) { elements.push(createElement("action", line.slice(1))); expectingDialogue = false; continue; }
    if (isSceneHeading(line.replace(/^\./u, ""))) {
      const scene = elementFromLine("scene-heading", line.replace(/^\./u, ""));
      scene.metadata = { ...scene.metadata, sceneId: pendingSceneId }; pendingSceneId = undefined;
      elements.push(scene); expectingDialogue = false; continue;
    }
    if (line.startsWith(">") || isTransition(line)) { elements.push(createElement("transition", line.replace(/^>\s*/u, ""))); expectingDialogue = false; continue; }
    if (expectingDialogue) {
      if (/^\(.*\)$/u.test(line)) elements.push(createElement("parenthetical", line));
      else elements.push(createElement("dialogue", line));
      continue;
    }
    const next = lines[i + 1]?.trim();
    if (isLikelyCharacter(line, [], false) && next && !isSceneHeading(line) && !isTransition(line)) {
      elements.push(elementFromLine("character", line.replace(/^@/u, ""))); expectingDialogue = true; continue;
    }
    elements.push(createElement("action", line));
  }
  if (!elements.length) elements.push(createElement("scene-heading"));
  return { preamble: preamble.join("\n").trimEnd(), elements };
}

function fountainText(element: ScreenplayElement): string {
  switch (element.type) {
    case "scene-heading": return `${element.metadata?.sceneId ? `/* OLUKOTAN:SCENE-ID:${element.metadata.sceneId} */\n` : ""}${normalizeElementText(element.type, element.text)}${element.metadata?.sceneNumber ? ` #${element.metadata.sceneNumber}#` : ""}`;
    case "character": return normalizeElementText(element.type, element.text);
    case "parenthetical": return normalizeElementText(element.type, element.text);
    case "transition": return `>${normalizeElementText(element.type, element.text)}`;
    case "action": return (isSceneHeading(element.text) || isTransition(element.text) || isLikelyCharacter(element.text)) ? `!${element.text}` : element.text;
    case "section": return `# ${element.text}`;
    case "synopsis": return `= ${element.text}`;
    case "note": return `[[${element.text}]]`;
    case "page-break": return "===";
    case "shot": return `/* OLUKOTAN:shot */\n${normalizeElementText(element.type, element.text)}`;
    case "general": return `/* OLUKOTAN:general */\n${element.text}`;
    default: return element.text;
  }
}

export function serializeFountain(document: ScreenplayDocument): string {
  const body = document.elements.filter((element) => element.text || element.type === "page-break").map((element, index, all) => {
    const previous = all[index - 1];
    const closeDialogue = ["parenthetical", "dialogue"].includes(element.type) && previous && ["character", "parenthetical", "dialogue"].includes(previous.type);
    return `${index && !closeDialogue ? "\n" : ""}${fountainText(element)}`;
  }).join("\n");
  return `${document.preamble ? `${document.preamble}\n\n` : ""}${body}${body ? "\n" : ""}`;
}

export function screenplayPasteElements(text: string): ScreenplayElement[] {
  const parsed = parseFountain(text);
  return parsed.elements.length ? parsed.elements : [createElement("action", text)];
}
