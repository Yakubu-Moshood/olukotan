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
  const set = revisionSetById(projectData, element.metadata?.revisionSet);
  return set && !set.hidden ? set.mark : undefined;
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
    if (!changed || !element.text.trim() || element.metadata?.revisionSet === activeSetId) return element;
    return { ...element, metadata: { ...element.metadata, revisionSet: activeSetId } };
  });
}

/** Clears marks from one revision set (or all when no id is given). */
export function clearRevisionMarks(elements: ScreenplayElement[], setId?: string): ScreenplayElement[] {
  return elements.map((element) => {
    if (!element.metadata?.revisionSet || (setId && element.metadata.revisionSet !== setId)) return element;
    const { revisionSet: _removed, ...rest } = element.metadata;
    return { ...element, metadata: Object.keys(rest).length ? rest : undefined };
  });
}
