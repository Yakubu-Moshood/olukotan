import { visibleText } from "./rich-text";
import type { ScreenplayElement } from "./screenplay-elements";

/** Tools → ScriptCompare: element-level diff between the open script and another draft. */
export type DiffKind = "added" | "removed" | "changed";
export interface DiffEntry { kind: DiffKind; currentIndex?: number; otherIndex?: number; type: string; current?: string; other?: string }

const key = (element: ScreenplayElement) => `${element.type}\u0000${visibleText(element.text).trim()}`;

export function compareScripts(current: ScreenplayElement[], other: ScreenplayElement[]): DiffEntry[] {
  const a = current.filter((e) => e.type !== "page-break" && e.text.trim()), b = other.filter((e) => e.type !== "page-break" && e.text.trim());
  const indexA = a.map((e) => current.indexOf(e)), indexB = b.map((e) => other.indexOf(e));
  const n = a.length, m = b.length;
  // LCS table (scripts are a few thousand elements; Uint16 rows keep memory reasonable).
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = key(a[i]) === key(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const raw: DiffEntry[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && key(a[i]) === key(b[j])) { i++; j++; continue; }
    if (j < m && (i >= n || table[i][j + 1] >= table[i + 1][j])) { raw.push({ kind: "removed", otherIndex: indexB[j], type: b[j].type, other: visibleText(b[j].text) }); j++; }
    else { raw.push({ kind: "added", currentIndex: indexA[i], type: a[i].type, current: visibleText(a[i].text) }); i++; }
  }
  // A removal next to an addition of the same element type is a change.
  const merged: DiffEntry[] = [];
  for (let k = 0; k < raw.length; k++) {
    const entry = raw[k], following = raw[k + 1];
    if (following && entry.type === following.type && ((entry.kind === "removed" && following.kind === "added") || (entry.kind === "added" && following.kind === "removed"))) {
      const added = entry.kind === "added" ? entry : following, removed = entry.kind === "removed" ? entry : following;
      merged.push({ kind: "changed", currentIndex: added.currentIndex, otherIndex: removed.otherIndex, type: entry.type, current: added.current, other: removed.other }); k++;
    } else merged.push(entry);
  }
  return merged;
}
