import type { Layout, LayoutLine } from "./pagination";
import type { ScreenplayElement } from "./screenplay-elements";

/**
 * What the editor's Page View shows on each sheet, taken from the same layout the PDF prints.
 * An element printed on several pages appears once per page as a fragment (a range of its visible
 * characters), and the paginator's (MORE), "NAME (CONT'D)" and scene CONTINUED lines are placed at
 * the same breaks the PDF uses.
 */
export type PageViewItem =
  | { kind: "element"; index: number; start: number; end?: number }
  | { kind: "decoration"; line: LayoutLine };

export interface PageViewGroup { page: number; items: PageViewItem[] }

/** Character-cue element id each element belongs to (its own id for a cue, the speaker's for dialogue). */
function speechOwners(elements: ScreenplayElement[]): (string | undefined)[] {
  let cue: string | undefined;
  return elements.map((element) => {
    if (element.type === "character") { cue = element.id; return cue; }
    if (element.type === "dialogue" || element.type === "parenthetical") return cue;
    cue = undefined; return undefined;
  });
}

export function pageViewGroups(elements: ScreenplayElement[], layout: Layout, pageView = true): PageViewGroup[] {
  if (!pageView) return [{ page: 1, items: elements.map((_, index) => ({ kind: "element" as const, index, start: 0 })) }];
  const byPage = new Map<number, PageViewItem[]>();
  const add = (page: number, item: PageViewItem) => { const list = byPage.get(page) ?? []; list.push(item); byPage.set(page, list); };
  let lastPage = 1;
  elements.forEach((element, index) => {
    const fragments = layout.fragments.get(element.id);
    if (fragments) {
      fragments.forEach((fragment, k) => add(fragment.page, { kind: "element", index, start: fragment.start, ...(fragments[k + 1] ? { end: fragments[k + 1].start } : {}) }));
      lastPage = fragments.at(-1)!.page;
      return;
    }
    // Elements the paginator doesn't print (empty lines, notes, sections) stay editable where they sit.
    const page = layout.elementPage.get(element.id) ?? lastPage;
    add(page, { kind: "element", index, start: 0 });
    lastPage = page;
  });

  const owners = speechOwners(elements);
  const ownerOf = (item: PageViewItem) => item.kind === "element" ? owners[item.index] : undefined;
  for (const page of layout.pages) {
    const items = byPage.get(page.index); if (!items) continue;
    for (const line of page.lines) {
      if (line.kind === "scene-continued-top") items.unshift({ kind: "decoration", line });
      else if (line.kind === "scene-continued-bottom") items.push({ kind: "decoration", line });
      else if (line.kind === "contd-cue") {
        const at = items.findIndex((item) => ownerOf(item) === line.elementId);
        const top = items[0]?.kind === "decoration" && items[0].line.kind === "scene-continued-top" ? 1 : 0;
        items.splice(at >= 0 ? at : top, 0, { kind: "decoration", line });
      } else if (line.kind === "more") {
        let at = -1; items.forEach((item, position) => { if (ownerOf(item) === line.elementId) at = position; });
        const bottom = items.findIndex((item) => item.kind === "decoration" && item.line.kind === "scene-continued-bottom");
        items.splice(at >= 0 ? at + 1 : bottom >= 0 ? bottom : items.length, 0, { kind: "decoration", line });
      }
    }
  }
  return [...byPage.entries()].sort(([a], [b]) => a - b).map(([page, items]) => ({ page, items }));
}
