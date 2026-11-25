import type { LockedPageStart, ProjectData, ScreenplaySettings } from "../types";
import { parseCharacter, type ScreenplayDocument, type ScreenplayElement, type ScreenplayElementType } from "./screenplay-elements";
import { renderedCharacterCue } from "./screenplay-production";

/**
 * Industry-standard screenplay pagination.
 *
 * Geometry follows the conventional Courier 12 pt layout used by Final Draft
 * and the major studios: 10 characters per inch, 6 lines per inch, 1.5" left
 * margin, 1" right/top/bottom margins. Every renderer (editor page view, PDF,
 * reports, locked pages) consumes the same layout so page counts agree.
 */

export interface TextRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean }

export type LineKind = "body" | "more" | "contd-cue" | "scene-continued-bottom" | "scene-continued-top" | "title";

export interface LayoutLine {
  row: number;
  /** Left edge in inches from the page's left edge (for right-aligned lines: the right edge). */
  x: number;
  align: "left" | "right" | "center";
  runs: TextRun[];
  type: ScreenplayElementType | "title-page";
  kind: LineKind;
  elementId?: string;
  /** Scene number printed in the margins of a scene heading line. */
  sceneNumber?: string;
  /** Revision mark (e.g. "*") printed in the right margin. */
  revisionMark?: string;
}

export interface PageLayout {
  /** 1-based physical page index within the script body. */
  index: number;
  /** Printed label, e.g. "12" or "12A" when pages are locked. */
  label: string;
  lines: LayoutLine[];
  /** Ids of every element with at least one line on this page. */
  elementIds: string[];
}

export interface PageGeometry {
  widthIn: number;
  heightIn: number;
  topIn: number;
  linesPerPage: number;
  /** Font size in points (Courier: 0.6 em per character, one line = font size). */
  fontSize: number;
  /** Rightmost printable column edge for body text. */
  rightIn: number;
}

export interface Layout {
  geometry: PageGeometry;
  titlePage?: PageLayout;
  pages: PageLayout[];
  /** Page index (1-based) where each element first appears. */
  elementPage: Map<string, number>;
}

interface ElementSpec { left: number; right: number; before: number; align: "left" | "right" | "center" }

/** Final Draft–compatible default element indents (inches from page edge). */
export const ELEMENT_SPECS: Record<ScreenplayElementType, ElementSpec> = {
  "scene-heading": { left: 1.5, right: 7.5, before: 2, align: "left" },
  action: { left: 1.5, right: 7.5, before: 1, align: "left" },
  character: { left: 3.5, right: 7.25, before: 1, align: "left" },
  parenthetical: { left: 3.0, right: 5.5, before: 0, align: "left" },
  dialogue: { left: 2.5, right: 6.0, before: 0, align: "left" },
  transition: { left: 5.5, right: 7.1, before: 1, align: "right" },
  shot: { left: 1.5, right: 7.5, before: 1, align: "left" },
  general: { left: 1.5, right: 7.5, before: 1, align: "left" },
  section: { left: 1.5, right: 7.5, before: 1, align: "left" },
  synopsis: { left: 1.5, right: 7.5, before: 1, align: "left" },
  note: { left: 1.5, right: 7.5, before: 1, align: "left" },
  "page-break": { left: 1.5, right: 7.5, before: 0, align: "left" },
};

export function pageGeometry(pageSize: "A4" | "US Letter", layout?: ProjectData["pageLayout"], fontSize = 12): PageGeometry {
  const letter = pageSize === "US Letter";
  const widthIn = letter ? 8.5 : 210 / 25.4, heightIn = letter ? 11 : 297 / 25.4;
  const top = layout?.top ?? 1, bottom = layout?.bottom ?? 1;
  return { widthIn, heightIn, topIn: top, fontSize, linesPerPage: Math.max(10, Math.floor(((heightIn - top - bottom) * 72) / fontSize) + (layout?.linesAdjust ?? 0)), rightIn: 7.5 };
}

/** Element specs with the project's Format → Elements overrides applied. */
export function elementSpecs(projectData?: ProjectData): Record<ScreenplayElementType, ElementSpec & { spacing: number; caps: boolean; style: Partial<TextRun> }> {
  const out = {} as Record<ScreenplayElementType, ElementSpec & { spacing: number; caps: boolean; style: Partial<TextRun> }>;
  for (const [type, base] of Object.entries(ELEMENT_SPECS) as [ScreenplayElementType, ElementSpec][]) {
    const custom = projectData?.elementStyles?.[type] ?? {};
    const sceneBefore = type === "scene-heading" ? projectData?.screenplaySettings.pagination.sceneHeadingSpacing ?? base.before : base.before;
    out[type] = {
      left: custom.left ?? base.left, right: custom.right ?? base.right, before: custom.spaceBefore ?? sceneBefore,
      align: (custom.align === "center" ? "center" : custom.align ?? base.align) as ElementSpec["align"],
      spacing: custom.spacing ?? 1, caps: custom.caps ?? false,
      style: { ...(custom.bold ? { bold: true } : {}), ...(custom.italic ? { italic: true } : {}), ...(custom.underline ? { underline: true } : {}) },
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline formatting and wrapping
// ---------------------------------------------------------------------------

export interface StyledChar { ch: string; bold: boolean; italic: boolean; underline: boolean }

/** Parses Fountain emphasis (***bold italic***, **bold**, *italic*, _underline_) into styled characters. */
export function styledChars(text: string): StyledChar[] {
  const out: StyledChar[] = [];
  let bold = false, italic = false, underline = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) { out.push({ ch: text[++i], bold, italic, underline }); continue; }
    if (ch === "*") {
      let count = 1; while (text[i + count] === "*") count++;
      const rest = text.slice(i + count);
      const opening = !bold && !italic;
      // Only treat as a marker if a matching closer exists (when opening) to avoid eating literal asterisks.
      if (count >= 3 && (bold || italic || rest.includes("***"))) { bold = !bold; italic = !italic; i += 2; continue; }
      if (count === 2 && (bold || rest.includes("**"))) { bold = !bold; i += 1; continue; }
      if (count === 1 && (italic || (rest.includes("*") && opening) || (rest.includes("*") && bold))) { italic = !italic; continue; }
      out.push({ ch, bold, italic, underline }); continue;
    }
    if (ch === "_" && (underline || text.slice(i + 1).includes("_"))) { underline = !underline; continue; }
    out.push({ ch, bold, italic, underline });
  }
  return out;
}

const isMark = (ch: string) => /\p{M}/u.test(ch);

/** Printable width in columns (combining marks occupy no column). */
export function columnWidth(text: string): number {
  let width = 0; for (const ch of text) if (!isMark(ch)) width++; return width;
}

function toRuns(chars: StyledChar[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const c of chars) {
    const last = runs.at(-1);
    if (last && !!last.bold === c.bold && !!last.italic === c.italic && !!last.underline === c.underline) last.text += c.ch;
    else runs.push({ text: c.ch, ...(c.bold ? { bold: true } : {}), ...(c.italic ? { italic: true } : {}), ...(c.underline ? { underline: true } : {}) });
  }
  return runs;
}

/** Word-wraps styled text to a fixed column width. Returns one run-list per printed line. */
export function wrapText(text: string, columns: number): TextRun[][] {
  const chars = styledChars(text);
  if (!chars.length) return [[]];
  const lines: StyledChar[][] = [];
  let line: StyledChar[] = [], width = 0, lastSpace = -1;
  for (const c of chars) {
    if (isMark(c.ch)) { line.push(c); continue; }
    if (width >= columns) {
      if (c.ch === " ") { lines.push(line); line = []; width = 0; lastSpace = -1; continue; }
      if (lastSpace > 0) {
        const head = line.slice(0, lastSpace), tail = line.slice(lastSpace + 1);
        lines.push(head); line = tail; width = tail.filter((t) => !isMark(t.ch)).length;
      } else { lines.push(line); line = []; width = 0; }
      lastSpace = -1;
    }
    if (c.ch === " ") lastSpace = line.length;
    line.push(c); width++;
  }
  lines.push(line);
  return lines.map((l) => toRuns(trimTrailing(l)));
}

function trimTrailing(line: StyledChar[]) { let end = line.length; while (end > 0 && line[end - 1].ch === " ") end--; return line.slice(0, end); }

export const runsText = (runs: TextRun[]) => runs.map((run) => run.text).join("");
const endsSentence = (runs: TextRun[]) => /[.!?…]["'”’)]*$|--$|—$/u.test(runsText(runs).trimEnd());

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

interface BlockLine { element: ScreenplayElement; lineIndex: number; runs: TextRun[]; type: ScreenplayElementType; x: number; align: "left" | "right" | "center"; kind: LineKind; sceneNumber?: string; revisionMark?: string }
type Specs = ReturnType<typeof elementSpecs>;

interface Block {
  kind: "single" | "dialogue" | "dual" | "page-break";
  type: ScreenplayElementType;
  before: number;
  /** Line items. A `null` entry is a blank spacer line inside the block. */
  lines: (BlockLine | null)[];
  /** Dual dialogue columns (left / right). */
  columns?: [(BlockLine | null)[], (BlockLine | null)[]];
  sceneId?: string;
  characterName?: string;
  /** Print (MORE) after this block (the head of a speech split at a locked page). */
  moreAfter?: boolean;
}

export interface PaginationOptions {
  /** Locked page starts: pages begin exactly here; overflow becomes A-pages. */
  lockedPages?: LockedPageStart[];
  includeNotes?: boolean;
  includeOmitted?: boolean;
  sceneNumber?(element: ScreenplayElement): string | undefined;
  revisionMark?(element: ScreenplayElement): string | undefined;
}

function elementLines(element: ScreenplayElement, text: string, options: PaginationOptions, type: ScreenplayElementType = element.type, specs: Specs = elementSpecs(), fontSize = 12): (BlockLine | null)[] {
  const spec = specs[type];
  const format = element.metadata?.format;
  const align = format?.align ?? spec.align;
  const spacing = format?.spacing ?? spec.spacing;
  const columns = Math.max(4, Math.round(((spec.right - spec.left) * 72) / (0.6 * fontSize)));
  const wrapped = wrapText(spec.caps ? text.toLocaleUpperCase("en-GB") : text, columns).map((runs) => runs.map((run) => ({ ...spec.style, ...run })));
  const sceneNumber = type === "scene-heading" ? options.sceneNumber?.(element) : undefined;
  const revisionMark = options.revisionMark?.(element);
  const x = align === "right" ? spec.right : align === "center" ? (spec.left + spec.right) / 2 : spec.left;
  const out: (BlockLine | null)[] = [];
  wrapped.forEach((runs, index) => {
    if (index && (spacing === 2 || (spacing === 1.5 && index % 2 === 0))) out.push(null);
    out.push({ element, lineIndex: index, runs, type, x, align, kind: "body" as const,
      ...(index === 0 && sceneNumber ? { sceneNumber } : {}), ...(revisionMark ? { revisionMark } : {}) });
  });
  return out;
}

function shiftDual(lines: BlockLine[], side: 0 | 1): BlockLine[] {
  // Dual dialogue: each column is roughly half width. Left column begins at the
  // action margin; right column at the page centre.
  const offset = side === 0 ? -1.0 : 1.75;
  return lines.map((line) => ({ ...line, x: line.x + offset }));
}

function buildBlocks(document: ScreenplayDocument, projectData: ProjectData, options: PaginationOptions, specs: Specs, fontSize: number): Block[] {
  const settings = projectData.screenplaySettings;
  const sceneHeadingBefore = specs["scene-heading"].before;
  const omittedScene = (element: ScreenplayElement) => element.metadata?.sceneId ? projectData.scenes.find((scene) => scene.sceneId === element.metadata!.sceneId)?.omitted : false;
  const elements = document.elements;
  const blocks: Block[] = [];
  let currentSceneId: string | undefined;
  let skippingOmitted = false;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.type === "scene-heading") {
      currentSceneId = element.metadata?.sceneId;
      skippingOmitted = !options.includeOmitted && !!(element.metadata?.omitted || omittedScene(element));
      if (skippingOmitted) {
        // Omitted scenes keep their number and print as OMITTED (Final Draft behaviour).
        blocks.push({ kind: "single", type: "scene-heading", before: sceneHeadingBefore, sceneId: currentSceneId,
          lines: elementLines(element, "OMITTED", options, "scene-heading", specs, fontSize) });
        continue;
      }
    } else if (skippingOmitted) continue;
    if (element.type === "page-break") { blocks.push({ kind: "page-break", type: "page-break", before: 0, lines: [] }); continue; }
    if (["section", "synopsis"].includes(element.type)) continue;
    if (element.type === "note" && !options.includeNotes) continue;
    if (!element.text.trim()) continue;
    if (element.type === "character") {
      const group: (BlockLine | null)[] = [...elementLines(element, renderedCharacterCue(elements, i, settings, projectData.moresContinueds?.contd), options, "character", specs, fontSize)];
      const characterName = parseCharacter(element.text).name;
      let j = i + 1;
      for (; j < elements.length && ["parenthetical", "dialogue"].includes(elements[j].type); j++) {
        if (!elements[j].text.trim()) continue;
        group.push(...elementLines(elements[j], elements[j].text, options, elements[j].type, specs, fontSize));
      }
      const dualId = element.metadata?.dualDialogueGroupId;
      const previous = blocks.at(-1);
      if (dualId && previous?.kind === "dialogue" && previous.lines[0] && (previous.lines[0] as BlockLine).element.metadata?.dualDialogueGroupId === dualId) {
        const left = shiftDual(previous.lines.filter(Boolean) as BlockLine[], 0);
        const right = shiftDual(group.filter(Boolean) as BlockLine[], 1);
        blocks[blocks.length - 1] = { kind: "dual", type: "character", before: previous.before, columns: [left, right], lines: [], sceneId: currentSceneId };
      } else {
        blocks.push({ kind: "dialogue", type: "character", before: element.metadata?.format?.spaceBefore ?? specs.character.before, lines: group, sceneId: currentSceneId, characterName });
      }
      i = j - 1; continue;
    }
    const before = element.metadata?.format?.spaceBefore ?? (element.type === "scene-heading" ? sceneHeadingBefore : specs[element.type].before);
    const text = element.type === "note" ? `[[${element.text}]]` : element.text;
    blocks.push({ kind: "single", type: element.type, before, lines: elementLines(element, text, options, element.type, specs, fontSize), sceneId: currentSceneId });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Paginator
// ---------------------------------------------------------------------------

export function paginate(document: ScreenplayDocument, projectData: ProjectData, options: PaginationOptions = {}): Layout {
  const settings: ScreenplaySettings = projectData.screenplaySettings;
  const fontSize = projectData.font?.size ?? 12;
  const geometry = pageGeometry(settings.pagination.pageSize, projectData.pageLayout, fontSize);
  const specs = elementSpecs(projectData);
  const texts = { more: "(MORE)", contd: "(CONT'D)", sceneBottom: "(CONTINUED)", sceneTop: "CONTINUED:", ...projectData.moresContinueds };
  const sceneContinued = settings.continueds.sceneContinued;
  const capacity = geometry.linesPerPage - (sceneContinued !== "off" ? 1 : 0);
  const pages: PageLayout[] = [];
  const elementPage = new Map<string, number>();
  const continuedCount = new Map<string, number>();
  const locks = new Map((options.lockedPages ?? []).map((lock) => [`${lock.elementId}:${lock.line}`, lock.label]));
  let lockBase: string | undefined, lockSuffix = 0;
  let page: PageLayout = newPage(1);
  let row = 0;
  let activeScene: string | undefined;

  function newPage(index: number): PageLayout {
    const label = lockBase === undefined ? String(index) : `${lockBase}${suffixLetters(++lockSuffix)}`;
    return { index, label, lines: [], elementIds: [] };
  }
  /** Starts the page a locked start belongs to, labelling it with its locked number. */
  function lockedBreak(label: string, midScene: boolean, more?: BlockLine) {
    if (row > 0 || page.lines.length) {
      if (more) { row = Math.min(row, capacity - 1); place({ ...more, runs: [{ text: texts.more }], kind: "more", type: "character", x: specs.character.left, align: "left" }); }
      breakPage(midScene);
    }
    page.label = label; lockBase = label; lockSuffix = 0;
  }

  function place(line: BlockLine | null) {
    if (line) {
      page.lines.push({ row, x: line.x, align: line.align, runs: line.runs, type: line.type, kind: line.kind, elementId: line.element.id,
        ...(line.sceneNumber ? { sceneNumber: line.sceneNumber } : {}), ...(line.revisionMark ? { revisionMark: line.revisionMark } : {}) });
      if (!page.elementIds.includes(line.element.id)) page.elementIds.push(line.element.id);
      if (!elementPage.has(line.element.id)) elementPage.set(line.element.id, page.index);
    }
    row++;
  }

  function breakPage(midScene: boolean) {
    if (midScene && sceneContinued !== "off" && activeScene) {
      page.lines.push({ row: geometry.linesPerPage - 1, x: specs.transition.right, align: "right", runs: [{ text: texts.sceneBottom }], type: "transition", kind: "scene-continued-bottom" });
    }
    pages.push(page);
    page = newPage(pages.length + 1);
    row = 0;
    if (midScene && sceneContinued === "top-and-bottom" && activeScene) {
      const count = (continuedCount.get(activeScene) ?? 1) + 1; continuedCount.set(activeScene, count);
      page.lines.push({ row: 0, x: specs.action.left, align: "left", runs: [{ text: count > 2 ? `${texts.sceneTop} (${count - 1})` : texts.sceneTop }], type: "action", kind: "scene-continued-top" });
      row = 2;
    }
  }

  const blocks = buildBlocks(document, projectData, options, specs, fontSize);
  const remaining = () => capacity - row;

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    if (block.kind === "page-break") { if (row > 0) breakPage(false); continue; }
    if (locks.size) {
      const at = block.kind === "dual" ? -1 : block.lines.findIndex((line) => line && locks.has(`${line.element.id}:${line.lineIndex}`));
      if (at > 0) {
        // A locked page begins inside this block: split it there.
        const head: Block = { ...block, lines: block.lines.slice(0, at), moreAfter: block.kind === "dialogue" };
        const cue = block.lines[0] as BlockLine;
        const tailLines = block.lines.slice(at);
        const tail: Block = { ...block, before: 0, lines: block.kind === "dialogue" ? [{ ...cue, runs: [{ text: continuedCue(runsText(cue.runs), texts.contd) }], kind: "contd-cue", lineIndex: -1 }, ...tailLines] : tailLines };
        blocks.splice(b, 1, head, tail); b--; continue;
      }
      const first = (block.kind === "dual" ? block.columns![0][0] : block.lines.find((line) => line && line.kind !== "contd-cue")) as BlockLine | undefined;
      const label = first && first.lineIndex >= 0 ? locks.get(`${first.element.id}:${first.lineIndex}`) : undefined;
      // Always (re)arm the lock here — even on page 1, where the page already carries this label —
      // so pages overflowing from it become A-pages.
      if (label !== undefined && (label !== page.label || page.lines.length || lockBase !== label)) {
        const previous = blocks[b - 1];
        lockedBreak(label, block.type !== "scene-heading", previous?.moreAfter ? previous.lines[0] as BlockLine : undefined);
      }
    }
    if (block.type === "scene-heading") { activeScene = block.sceneId ?? `scene-${b}`; }
    const before = row === 0 || (sceneContinued === "top-and-bottom" && row === 2 && page.lines.some((l) => l.kind === "scene-continued-top")) ? 0 : block.before;

    if (block.kind === "dual") {
      const [left, right] = block.columns!;
      const height = Math.max(left.length, right.length);
      if (row > 0 && before + height > remaining()) breakPage(true);
      const effectiveBefore = row === 0 ? 0 : before;
      row += effectiveBefore;
      const startRow = row;
      for (const [columnLines] of [[left], [right]] as const) {
        columnLines.forEach((line, offset) => { row = startRow + offset; place(line); });
      }
      row = startRow + height;
      continue;
    }

    const lines = block.lines;
    const need = before + lines.length;

    // Keep-with-next: a scene heading or shot needs at least two lines of what follows.
    let keep = 0;
    if (["scene-heading", "shot"].includes(block.type) && blocks[b + 1] && blocks[b + 1].kind !== "page-break") {
      const next = blocks[b + 1];
      const nextLines = next.kind === "dual" ? Math.max(next.columns![0].length, next.columns![1].length) : next.lines.length;
      keep = next.before + Math.min(next.kind === "dialogue" ? 3 : 2, nextLines);
    }

    if (need + keep <= remaining() || (block.moreAfter && need + 1 <= remaining())) {
      row += before; lines.forEach(place);
      if (block.moreAfter) place({ ...(lines[0] as BlockLine), runs: [{ text: texts.more }], kind: "more", type: "character", x: specs.character.left, align: "left" });
      continue;
    }

    // Splittable blocks: action/general paragraphs and dialogue.
    const available = remaining() - before;
    if (block.kind === "dialogue" && settings.continueds.dialogueMore !== false) {
      const split = dialogueSplit(lines, available);
      if (split !== undefined) {
        row += before;
        lines.slice(0, split).forEach(place);
        const cue = lines[0] as BlockLine;
        place({ ...cue, runs: [{ text: texts.more }], kind: "more", type: "character", x: specs.character.left, align: "left" });
        breakPage(true);
        const contdText = settings.continueds.dialogueContinued !== false ? continuedCue(runsText(cue.runs), texts.contd) : runsText(cue.runs);
        const rest = lines.slice(split);
        blocks.splice(b + 1, 0, { ...block, before: 0, lines: [{ ...cue, runs: [{ text: contdText }], kind: "contd-cue" }, ...rest] });
        continue;
      }
    } else if (block.kind === "single" && ["action", "general"].includes(block.type)) {
      const split = paragraphSplit(lines, available, lines.length > capacity);
      if (split !== undefined) {
        row += before;
        lines.slice(0, split).forEach(place);
        breakPage(true);
        blocks.splice(b + 1, 0, { ...block, before: 0, lines: lines.slice(split) });
        continue;
      }
    }

    // Move the whole block to the next page. A block taller than a page is hard-split.
    if (row > 0) breakPage(block.type !== "scene-heading");
    if (lines.length > capacity) {
      lines.slice(0, capacity).forEach(place);
      breakPage(true);
      blocks.splice(b + 1, 0, { ...block, before: 0, lines: lines.slice(capacity) });
      continue;
    }
    lines.forEach(place);
  }
  if (page.lines.length || !pages.length) pages.push(page);
  if (options.lockedPages?.length) combineMissingLockedLabels(pages, options.lockedPages);
  return { geometry, pages, elementPage };
}

/** A, B, … Z, AA, AB … */
export function suffixLetters(n: number): string {
  let out = ""; while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); } return out;
}

/** When locked pages lose all their material, the previous page carries a range label such as "12-13". */
function combineMissingLockedLabels(pages: PageLayout[], locked: LockedPageStart[]) {
  const present = new Set(pages.map((page) => page.label));
  const order = locked.map((lock) => lock.label);
  for (let i = 0; i < order.length; i++) {
    if (present.has(order[i])) continue;
    let j = i; while (j + 1 < order.length && !present.has(order[j + 1])) j++;
    const previous = pages.find((page) => page.label === order[i - 1]) ?? pages.find((page) => page.label.startsWith(`${order[i - 1]}`));
    if (previous && i > 0) { previous.label = `${order[i - 1]}-${order[j]}`; present.add(previous.label); }
    i = j;
  }
}

/** Captures the current page starts so later edits create A-pages instead of reflowing. */
export function lockPages(layout: Layout): LockedPageStart[] {
  const starts: LockedPageStart[] = [];
  const lineCounters = new Map<string, number>();
  for (const page of layout.pages) {
    let start: LockedPageStart | undefined;
    for (const line of page.lines) {
      if (!line.elementId || line.kind !== "body") continue;
      const index = lineCounters.get(line.elementId) ?? 0; lineCounters.set(line.elementId, index + 1);
      if (!start) start = { elementId: line.elementId, line: index, label: page.label };
    }
    if (start) starts.push(start);
  }
  return starts;
}

/** Appends (CONT'D) to a character cue unless it already carries one. */
export function continuedCue(cue: string, contd = "(CONT'D)") {
  return /\(CONT['’]D\)/iu.test(cue) || cue.includes(contd) ? cue : `${cue} ${contd}`;
}

/**
 * Finds how many lines of a dialogue block stay on the current page.
 * Rules: the cue plus at least two dialogue lines remain; at least two lines
 * carry over; never end the page on a parenthetical; prefer sentence ends.
 * Room is reserved for the (MORE) line.
 */
function dialogueSplit(lines: (BlockLine | null)[], available: number): number | undefined {
  const maxKeep = Math.min(available - 1, lines.length - 2);
  let fallback: number | undefined;
  for (let keep = maxKeep; keep >= 3; keep--) {
    const last = lines[keep - 1], next = lines[keep];
    if (!last || last.type === "parenthetical" || last.type === "character") continue;
    if (next && next.type === "dialogue" && next.element.id === last.element.id) {
      // Mid-speech break: only at a sentence boundary.
      if (endsSentence(last.runs)) return keep;
      continue;
    }
    // Break between a dialogue element and the next item of the speech.
    if (fallback === undefined) fallback = keep;
    return keep;
  }
  return fallback;
}

function paragraphSplit(lines: (BlockLine | null)[], available: number, mustSplit: boolean): number | undefined {
  const maxKeep = Math.min(available, lines.length - 2);
  for (let keep = maxKeep; keep >= 2; keep--) { const line = lines[keep - 1]; if (line && endsSentence(line.runs)) return keep; }
  if (mustSplit && maxKeep >= 2) return maxKeep;
  return undefined;
}

// ---------------------------------------------------------------------------
// Title page
// ---------------------------------------------------------------------------

export interface TitlePageFields { title?: string; credit?: string; author?: string; source?: string; draftDate?: string; contact?: string; notes?: string; copyright?: string }

export function parseTitlePage(preamble: string): TitlePageFields {
  const fields: Record<string, string[]> = {};
  let current: string | undefined;
  for (const raw of preamble.split("\n")) {
    const match = raw.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/u);
    if (match && !/^\s/u.test(raw)) { current = match[1].trim().toLowerCase(); fields[current] = match[2] ? [match[2].trim()] : []; }
    else if (current && raw.trim()) fields[current].push(raw.trim());
  }
  const get = (...keys: string[]) => { for (const key of keys) if (fields[key]?.length) return fields[key].join("\n"); return undefined; };
  return {
    title: get("title"), credit: get("credit"), author: get("author", "authors"), source: get("source"),
    draftDate: get("draft date", "date"), contact: get("contact"), notes: get("notes"), copyright: get("copyright"),
  };
}

export function serializeTitlePage(fields: TitlePageFields, otherPreamble = ""): string {
  const entry = (key: string, value?: string) => {
    if (!value?.trim()) return "";
    const lines = value.trim().split("\n");
    return lines.length === 1 ? `${key}: ${lines[0]}` : `${key}:\n${lines.map((line) => `    ${line}`).join("\n")}`;
  };
  const known = /^(title|credit|author|authors|source|draft date|date|contact|notes|copyright)\s*:/iu;
  const others: string[] = []; let skipping = false;
  for (const line of otherPreamble.split("\n")) {
    if (/^\S/u.test(line)) skipping = known.test(line);
    if (!skipping && line.trim()) others.push(line);
  }
  return [entry("Title", fields.title), entry("Credit", fields.credit), entry("Author", fields.author), entry("Source", fields.source),
    entry("Draft date", fields.draftDate), entry("Contact", fields.contact), entry("Notes", fields.notes), entry("Copyright", fields.copyright), ...others]
    .filter(Boolean).join("\n");
}

export function layoutTitlePage(fields: TitlePageFields, geometry: PageGeometry): PageLayout {
  const lines: LayoutLine[] = [];
  const centre = geometry.widthIn / 2;
  const line = (row: number, text: string, align: LayoutLine["align"], x: number, style: Partial<TextRun> = {}) =>
    lines.push({ row, x, align, runs: [{ text, ...style }], type: "title-page", kind: "title" });
  let row = Math.floor(geometry.linesPerPage * 0.38);
  for (const titleLine of (fields.title ?? "Untitled").split("\n")) line(row++, stripMarkers(titleLine).toLocaleUpperCase("en-GB"), "center", centre, { underline: false, bold: /\*\*/u.test(titleLine) });
  row += 1;
  line(row, fields.credit ?? "written by", "center", centre); row += 2;
  for (const author of (fields.author ?? "").split("\n").filter(Boolean)) line(row++, author, "center", centre);
  if (fields.source) { row += 1; for (const source of fields.source.split("\n")) line(row++, source, "center", centre); }
  const bottom = geometry.linesPerPage - 1;
  const contact = (fields.contact ?? "").split("\n").filter(Boolean);
  contact.forEach((text, index) => line(bottom - contact.length + 1 + index, text, "left", 1.5));
  const right = [fields.draftDate, fields.copyright].filter(Boolean).join("\n").split("\n").filter(Boolean);
  right.forEach((text, index) => line(bottom - right.length + 1 + index, text, "right", geometry.rightIn));
  if (fields.notes) fields.notes.split("\n").forEach((text, index) => line(bottom - contact.length - 2 - index, text, "left", 1.5));
  return { index: 0, label: "", lines, elementIds: [] };
}

const stripMarkers = (text: string) => runsText(toRuns(styledChars(text)));

/** Page-number label printed in the header, honouring the page-number settings. Returns undefined when hidden. */
export function pageNumberLabel(page: PageLayout, settings: ScreenplaySettings): string | undefined {
  const config = settings.pageNumbers;
  if (!config.enabled) return undefined;
  const startPage = config.startOnPage === "custom" ? config.customStartPage : config.startOnPage;
  if (page.index < startPage || (config.hideOnFirstPage && page.index === 1)) return undefined;
  const numeric = Number(page.label);
  if (Number.isFinite(numeric)) return `${config.firstVisibleNumber + numeric - 1}.`;
  return `${page.label}.`;
}
