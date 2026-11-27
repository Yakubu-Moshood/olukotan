import { describe, expect, it } from "vitest";
import { defaultProjectData } from "../types";
import { applyRevisionMarks, clearRevisionMarks, nextRevisionSet, revisionHeader, revisionMarkFor } from "./revisions";
import { createElement } from "./screenplay-elements";

describe("revisions", () => {
  it("follows the standard colour order and doubles after a full cycle", () => {
    const sets = [] as ReturnType<typeof nextRevisionSet>[];
    for (let i = 0; i < 13; i++) sets.push(nextRevisionSet(sets, "2026-11-25"));
    expect(sets.slice(0, 4).map((set) => set.name)).toEqual(["White", "Blue", "Pink", "Yellow"]);
    expect(sets[12].name).toBe("Double White");
  });
  it("marks only changed elements and keeps earlier marks", () => {
    const a = createElement("action", "Same."), b = createElement("action", "Old."), c = createElement("action", "Earlier.", { revisionSet: "pink" });
    const next = [a, { ...b, text: "New." }, c, createElement("action", "Added.")];
    const marked = applyRevisionMarks([a, b, c], next, "blue");
    expect(marked.map((element) => element.metadata?.revisionSet)).toEqual([undefined, "blue", "pink", "blue"]);
    expect(clearRevisionMarks(marked, "blue").map((element) => element.metadata?.revisionSet)).toEqual([undefined, undefined, "pink", undefined]);
  });
  it("prints the mark and header for the active set", () => {
    const data = defaultProjectData(); const set = nextRevisionSet([], "2026-11-25");
    data.revisionSets = [{ ...set, name: "Blue" }]; data.screenplaySettings.revisions = { enabled: true, activeSetId: set.id, showMarks: true };
    expect(revisionMarkFor(createElement("action", "x", { revisionSet: set.id }), data)).toBe("*");
    expect(revisionHeader(data)).toBe("Blue Revision - 2026-11-25");
  });
});
