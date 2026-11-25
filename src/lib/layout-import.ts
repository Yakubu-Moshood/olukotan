import { createElement, isSceneHeading, isTransition, parseCharacter, parseFountain, type ScreenplayDocument, type ScreenplayElement, type ScreenplayElementType } from "./screenplay-elements";

/**
 * Turns positioned lines (from a PDF) or paragraphs (from a Word document)
 * into screenplay elements, the way a reader recognises a script: by where
 * each line sits on the page, backed up by what it says.
 */

export interface SourceLine {
  /** Text with Fountain emphasis markers where the source had bold/italic/underline. */
  text: string;
  /** Left edge in inches (absolute page position for PDF, indent from margin for DOCX). */
  x: number;
  /** Right edge in inches, when known. */
  right?: number;
  align?: "left" | "center" | "right";
  /** Vertical position in inches from the top of its page (PDF). */
  y?: number;
  page?: number;
  /** Explicit element type, e.g. from a Word paragraph style named "Character". */
  styleType?: ScreenplayElementType;
}

export interface LayoutImportResult { document: ScreenplayDocument; warnings: string[]; confidence: number }

const isUpper = (text: string) => { const letters = text.replace(/\([^)]*\)/gu, "").replace(/[^\p{L}]/gu, ""); return letters.length > 0 && letters === letters.toLocaleUpperCase("en-GB"); };
const stripMarkers = (text: string) => text.replace(/\\([*_\\])/gu, "$1").replace(/[*_]/gu, "");
const PAGE_NUMBER = /^\s*\d+[A-Z]{0,2}\.?\s*$/u;
const NOISE = /^\s*(?:\(MORE\)|\(CONTINUED\)|CONTINUED:?(?:\s*\(\d+\))?|\(CONT['’]D\))\s*$/iu;
const STYLE_TYPES: Record<string, ScreenplayElementType> = {
  "scene heading": "scene-heading", "slugline": "scene-heading", "scene": "scene-heading", action: "action", description: "action",
  character: "character", "character name": "character", parenthetical: "parenthetical", wryly: "parenthetical",
  dialogue: "dialogue", dialog: "dialogue", transition: "transition", shot: "shot", general: "general",
};
export function styleTypeFromName(name?: string): ScreenplayElementType | undefined {
  if (!name) return undefined;
  return STYLE_TYPES[name.trim().toLowerCase().replace(/^(?:fd|screenplay|script)[\s_-]*/u, "").replace(/[_-]+/gu, " ")];
}

/**
 * The action margin. Scene headings always sit on it, so use them when present;
 * otherwise take the leftmost indent that carries a real share of the text.
 */
function actionMargin(lines: SourceLine[]): number {
  const headings = lines.filter((line) => isSceneHeading(stripMarkers(line.text).trim())).map((line) => Math.round(line.x * 10) / 10);
  if (headings.length) {
    const tally = new Map<number, number>(); for (const x of headings) tally.set(x, (tally.get(x) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  const counts = new Map<number, number>(); let total = 0;
  for (const line of lines) { const key = Math.round(line.x * 10) / 10; const n = stripMarkers(line.text).length; counts.set(key, (counts.get(key) ?? 0) + n); total += n; }
  const candidates = [...counts.entries()].filter(([, n]) => n >= total * 0.1).map(([x]) => x).sort((a, b) => a - b);
  return candidates[0] ?? 0;
}

function classify(line: SourceLine, rel: number, previous: ScreenplayElementType | undefined, rightMargin: number): ScreenplayElementType {
  const text = stripMarkers(line.text).trim();
  if (line.styleType) return line.styleType;
  if (isSceneHeading(text)) return "scene-heading";
  const rightAligned = line.align === "right" || (line.right !== undefined && rightMargin - line.right < 0.35 && rel > 2.5);
  if ((rightAligned || rel >= 3.2) && isUpper(text) && (/[:.]$/u.test(text) || isTransition(text))) return "transition";
  if (isTransition(text) && rel < 0.6) return "transition";
  if (text.startsWith("(") && rel >= 0.9 && rel < 2.4) return "parenthetical";
  if (rel >= 1.5 && rel < 3.2 && isUpper(text) && text.length <= 50) return "character";
  if (rel >= 0.6 && rel < 1.9 && previous && ["character", "parenthetical", "dialogue"].includes(previous)) return "dialogue";
  if (rel >= 0.6 && rel < 1.9 && line.align !== "center") return "dialogue";
  if (rel < 0.6 && isUpper(text) && /:$/u.test(text) && text.length < 40) return "shot";
  return "action";
}

export function linesToDocument(input: SourceLine[], options: { mergeWrappedLines: boolean; lineHeight?: number } = { mergeWrappedLines: false }): LayoutImportResult {
  const warnings: string[] = [];
  // Drop page furniture: page numbers, (MORE), CONTINUED markers.
  const lines = input.filter((line) => {
    const text = stripMarkers(line.text).trim();
    if (!text) return false;
    if (NOISE.test(text)) return false;
    if (PAGE_NUMBER.test(text) && (line.y === undefined || line.y < 0.9 || line.y > 10.2 || line.align === "right" || line.x > 6)) return false;
    return true;
  });
  const margin = actionMargin(lines);
  const rightMargin = Math.max(...lines.map((line) => line.right ?? 0), margin + 6);
  const elements: ScreenplayElement[] = [];
  let previousType: ScreenplayElementType | undefined;
  let previousLine: SourceLine | undefined;
  let speaker: string | undefined, speechBrokenByPage = false;
  for (const line of lines) {
    let text = line.text.trim();
    const rel = line.x - margin;
    let type = classify(line, rel, previousType, rightMargin);
    if (type === "scene-heading") text = text.replace(/^\s*\d+[A-Z]{0,2}\.?\s+(?=(?:INT|EXT|I\/E|EST))/iu, "").replace(/\s+\d+[A-Z]{0,2}\.?\s*$/u, "");
    // A "(CONT'D)" cue at the top of a page that continues the same speech is page furniture.
    if (type === "character") {
      const name = parseCharacter(stripMarkers(text)).name;
      const isContinuation = /\(CONT['’]D\)/iu.test(text) && name === speaker && previousLine && line.page !== previousLine.page && speechBrokenByPage;
      if (isContinuation) { previousLine = line; continue; }
      speaker = name;
    }
    const sameParagraph = options.mergeWrappedLines && previousLine && previousType === type && ["action", "dialogue", "parenthetical", "general"].includes(type)
      && Math.abs(line.x - previousLine.x) < 0.25 && (line.page === previousLine.page
        ? (line.y ?? 0) - (previousLine.y ?? 0) <= (options.lineHeight ?? 1 / 6) * 1.45
        : type === "dialogue" || (type === "action" && !/[.!?…]["'”’)]*$/u.test(stripMarkers(elements.at(-1)?.text ?? ""))));
    speechBrokenByPage = !!previousLine && previousLine.page !== line.page;
    if (sameParagraph && elements.length) {
      const last = elements[elements.length - 1];
      last.text = `${last.text}${last.text.endsWith("-") && !last.text.endsWith(" -") ? "" : " "}${text}`;
    } else {
      // Dialogue that resumes after a page break (once the duplicate cue is skipped) continues the same element.
      elements.push(createElement(type, text));
    }
    if (type === "parenthetical" && elements.length) elements[elements.length - 1].text = elements[elements.length - 1].text.replace(/^\(?/u, "(").replace(/\)?$/u, ")");
    if (["scene-heading", "action", "transition", "shot"].includes(type)) speaker = type === "action" ? speaker : undefined;
    previousType = type; previousLine = line;
  }
  // Re-derive character metadata.
  for (const element of elements) if (element.type === "character") { const parsed = parseCharacter(element.text); element.metadata = { characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions }; }
  const typed = elements.filter((element) => element.type !== "action").length;
  const confidence = elements.length ? Math.min(1, (elements.filter((element) => element.type === "scene-heading").length * 4 + typed) / elements.length) : 0;
  if (!elements.some((element) => element.type === "scene-heading")) warnings.push("No scene headings were found. Check that headings start with INT. or EXT.");
  if (!elements.some((element) => element.type === "character")) warnings.push("No character cues were recognised; dialogue may have come in as action. Check the preview.");
  return { document: { preamble: "", elements: elements.length ? elements : [createElement("scene-heading")] }, warnings, confidence };
}

/** Fallback for documents with no usable layout (plain paragraphs): read them like Fountain. */
export function paragraphsToDocument(paragraphs: string[]): LayoutImportResult {
  const out: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    const text = paragraph.trim(); if (!text) return;
    const previous = paragraphs[index - 1]?.trim() ?? "";
    const tight = previous && (isUpper(stripMarkers(previous)) && !isSceneHeading(stripMarkers(previous)) && !isTransition(stripMarkers(previous)) && stripMarkers(previous).length <= 40 || /^\(.*\)$/u.test(previous));
    out.push(`${out.length && !tight ? "\n" : ""}${text}`);
  });
  const document = parseFountain(out.join("\n"));
  document.preamble = "";
  return { document, warnings: ["This document has no screenplay layout, so elements were detected from the text. Check the preview."], confidence: 0.5 };
}
