import { visibleText } from "./rich-text";
import type { ProjectData, RevisionSet } from "../types";
import type { ScreenplayElement } from "./screenplay-elements";

/** Standard WGA / studio revision colour order. */
export const STANDARD_REVISION_COLOURS: { name: string; colour: string }[] = [
  { name: "White", colour: "#ffffff" }, { name: "Blue", colour: "#cfe2ff" }, { name: "Pink", colour: "#ffd6e7" },
  { name: "Yellow", colour: "#fff3b0" }, { name: "Green", colour: "#d3f4d1" }, { name: "Goldenrod", colour: "#f5d58a" },
  { name: "Buff", colour: "#f0e2c4" }, { name: "Salmon", colour: "#ffc9b5" }, { name: "Cherry", colour: "#f4a6b3" },
  { name: "Tan", colour: "#e1cfae" }, { name: "Grey", colour: "#dddddd" }, { name: "Ivory", colour: "#fbf6e6" },
];

export function nextRevisionSet(existing: RevisionSet[], date = new Date().toISOString().slice(0, 10)): RevisionSet {
  const index = existing.length;
  const base = STANDARD_REVISION_COLOURS[index % STANDARD_REVISION_COLOURS.length];
  const round = Math.floor(index / STANDARD_REVISION_COLOURS.length);
  const name = round ? `${["", "Double", "Triple", "Quadruple"][round] ?? `${round + 1}×`} ${base.name}` : base.name;
  return { id: globalThis.crypto?.randomUUID?.() ?? `revision-${Date.now()}-${index}`, name, colour: base.colour, mark: "*", date };
}

export function revisionSetById(projectData: ProjectData, id?: string | null) {
  return id ? projectData.revisionSets.find((set) => set.id === id) : undefined;
}

export function revisionMarkFor(element: ScreenplayElement, projectData: ProjectData): string | undefined {
  if (!projectData.screenplaySettings.revisions.showMarks) return undefined;
  // A paragraph with marked runs shows the mark of its latest revision set.
  const runSets = element.metadata?.revisionRuns?.map((run) => run[2]) ?? [];
  const latest = runSets.length ? [...projectData.revisionSets].reverse().find((set) => runSets.includes(set.id))?.id : undefined;
  const set = revisionSetById(projectData, element.metadata?.revisionSet ?? latest);
  return set && !set.hidden ? set.mark : undefined;
}

type Runs = [number, number, string][];

/** Where an edit happened: [start, oldEnd, newEnd] in visible characters (common prefix / suffix). */
function editSpan(before: string, after: string): [number, number, number] {
  let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let tail = 0; while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return [start, before.length - tail, after.length - tail];
}

function normaliseRuns(runs: Runs): Runs {
  const sorted = runs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Runs = [];
  for (const run of sorted) {
    const last = out.at(-1);
    if (last && last[2] === run[2] && last[1] >= run[0]) last[1] = Math.max(last[1], run[1]);
    else out.push([...run]);
  }
  return out;
}

/** Moves run-level revision marks with the text when a paragraph is edited. */
export function shiftRevisionRuns(runs: Runs, before: string, after: string, insertedSet?: string | null): Runs {
  const [start, oldEnd, newEnd] = editSpan(before, after);
  const delta = newEnd - oldEnd;
  const out: Runs = [];
  for (const [a, b, set] of runs) {
    if (b <= start) out.push([a, b, set]);
    else if (a >= oldEnd) out.push([a + delta, b + delta, set]);
    else {
      // The run overlaps the edited span: keep the parts outside it.
      if (a < start) out.push([a, start, set]);
      if (b > oldEnd) out.push([newEnd, b + delta, set]);
    }
  }
  if (insertedSet && newEnd > start) out.push([start, newEnd, insertedSet]);
  return normaliseRuns(out);
}

/** Keeps every element's run-level marks aligned with its text after any edit. */
export function reconcileRevisionRuns(previous: ScreenplayElement[], next: ScreenplayElement[]): ScreenplayElement[] {
  const before = new Map(previous.map((element) => [element.id, element]));
  return next.map((element) => {
    const old = before.get(element.id);
    const runs = element.metadata?.revisionRuns;
    if (!old || !runs?.length || old.text === element.text || old.metadata?.revisionRuns !== runs) return element;
    const shifted = shiftRevisionRuns(runs, visibleText(old.text), visibleText(element.text));
    const { revisionRuns: _old, ...rest } = element.metadata!;
    return { ...element, metadata: shifted.length ? { ...rest, revisionRuns: shifted } : (Object.keys(rest).length ? rest : undefined) };
  });
}

export function revisionHeader(projectData: ProjectData): string | undefined {
  const set = revisionSetById(projectData, projectData.screenplaySettings.revisions.activeSetId);
  if (!set) return undefined;
  return `${set.name} Revision${set.date ? ` - ${set.date}` : ""}`;
}

/**
 * Marks elements whose text or type changed while revision mode is on.
 * Unchanged elements keep their existing revision marks.
 */
export function applyRevisionMarks(previous: ScreenplayElement[], next: ScreenplayElement[], activeSetId: string | null): ScreenplayElement[] {
  if (!activeSetId) return next;
  const before = new Map(previous.map((element) => [element.id, element]));
  return next.map((element) => {
    const old = before.get(element.id);
    const changed = !old || old.text !== element.text || old.type !== element.type;
    if (!changed || !element.text.trim()) return element;
    // Paragraphs that carry run-level marks get the active set on just the text that changed.
    const runs = element.metadata?.revisionRuns;
    if (old && runs?.length && old.text !== element.text) {
      const shifted = shiftRevisionRuns(old.metadata?.revisionRuns ?? runs, visibleText(old.text), visibleText(element.text), activeSetId);
      return { ...element, metadata: { ...element.metadata, revisionRuns: shifted } };
    }
    if (element.metadata?.revisionSet === activeSetId) return element;
    return { ...element, metadata: { ...element.metadata, revisionSet: activeSetId } };
  });
}

/** Clears marks from one revision set (or all when no id is given). */
export function clearRevisionMarks(elements: ScreenplayElement[], setId?: string): ScreenplayElement[] {
  return elements.map((element) => {
    const metadata = element.metadata; if (!metadata) return element;
    const runs = metadata.revisionRuns?.filter((run) => setId && run[2] !== setId);
    const clearParagraph = !!metadata.revisionSet && (!setId || metadata.revisionSet === setId);
    if (!clearParagraph && runs?.length === metadata.revisionRuns?.length) return element;
    const { revisionSet, revisionRuns: _runs, ...rest } = metadata;
    const next = { ...rest, ...(clearParagraph ? {} : { revisionSet }), ...(runs?.length ? { revisionRuns: runs } : {}) };
    return { ...element, metadata: Object.keys(next).filter((key) => (next as Record<string, unknown>)[key] !== undefined).length ? next : undefined };
  });
}
