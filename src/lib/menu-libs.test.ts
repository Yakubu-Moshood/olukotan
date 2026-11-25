import { describe, expect, it } from "vitest";
import { findAll, nextMatch, replaceAll } from "./find";
import { checkFormat } from "./format-assistant";
import { compareScripts } from "./compare";
import { applyPatch, diffElements, sessionCode } from "./collab";
import { searchNames, NAMES } from "./names-db";
import { speechLines, NARRATOR } from "./speech";
import { STATIONERY } from "./stationery";
import { backupArchive, backupFileName } from "./backup";
import { createElement, parseFountain } from "./screenplay-elements";
import { lookUpWord } from "./thesaurus";
import { defaultProjectData } from "../types";

const script = () => parseFountain("INT. ROOM - DAY\n\nAda **waits** by the door.\n\nADA\nWhere is Bayo? Bayo!\n\nEXT. ROAD - NIGHT\n\nBayo runs.\n").elements;

describe("find and replace", () => {
  it("finds visible text across elements, case and whole-word aware", () => {
    const elements = script();
    expect(findAll(elements, { query: "bayo", matchCase: false, wholeWord: true }).length).toBe(3);
    expect(findAll(elements, { query: "bayo", matchCase: true, wholeWord: false }).length).toBe(0);
    expect(findAll(elements, { query: "waits", matchCase: false, wholeWord: false })[0]).toMatchObject({ index: 1, start: 4, end: 9 });
    const matches = findAll(elements, { query: "Bayo", matchCase: true, wholeWord: true });
    expect(nextMatch(matches, { index: 3, offset: 10 })).toMatchObject({ index: 3, start: 15 });
    expect(nextMatch(matches, { index: 99, offset: 0 })).toBe(matches[0]);
  });
  it("replaces all without breaking formatting", () => {
    const { elements, count } = replaceAll(script(), { query: "waits", matchCase: false, wholeWord: true }, "stands");
    expect(count).toBe(1); expect(elements[1].text).toBe("Ada **stands** by the door.");
  });
});

describe("format assistant", () => {
  it("flags orphan cues, missing times of day and stray dialogue, with fixes", () => {
    const elements = [createElement("scene-heading", "INT. ROOM"), createElement("character", "ADA"), createElement("action", "x"), createElement("dialogue", "Hi."), createElement("action", "")];
    const messages = checkFormat([...elements, createElement("action", "End.")]).map((issue) => issue.message);
    expect(messages.some((m) => m.includes("no time of day"))).toBe(true);
    expect(messages.some((m) => m.includes("no dialogue"))).toBe(true);
    expect(messages.some((m) => m.includes("Dialogue without a character"))).toBe(true);
    const empty = checkFormat([...elements, createElement("action", "End.")]).find((issue) => issue.message === "Empty paragraph.")!;
    expect(empty.fix!([...elements, createElement("action", "End.")]).length).toBe(5);
  });
});

describe("script compare", () => {
  it("reports added, removed and changed paragraphs", () => {
    const a = script(); const b = script();
    b[1] = { ...b[1], text: "Ada sits." }; b.splice(4, 1); b.push(createElement("action", "Old ending."));
    const diff = compareScripts(a, b);
    expect(diff.map((entry) => entry.kind)).toEqual(["changed", "added", "removed"]);
  });
});

describe("co-writing patches", () => {
  it("round-trips edits, inserts, deletes and reorders between two copies", () => {
    const original = script();
    const edited = [...original]; edited[1] = { ...edited[1], text: "Changed." }; edited.splice(2, 0, createElement("action", "New line.")); edited.pop();
    const patch = diffElements(original, edited)!;
    expect(applyPatch(original, patch).map((e) => e.text)).toEqual(edited.map((e) => e.text));
    const reordered = [edited[4], ...edited.slice(0, 4), ...edited.slice(5)];
    expect(applyPatch(edited, diffElements(edited, reordered)!).map((e) => e.id)).toEqual(reordered.map((e) => e.id));
    expect(diffElements(original, original)).toBeNull();
    expect(sessionCode()).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u);
  });
});

describe("names, speech, stationery, backup, thesaurus", () => {
  it("searches the names database", () => {
    expect(NAMES.length).toBeGreaterThan(500);
    expect(searchNames("ade", "Yoruba", "female").map((n) => n.name)).toContain("Adenike");
  });
  it("speaks dialogue as the character and action as the narrator", () => {
    const lines = speechLines(script());
    expect(lines.map((line) => line.speaker)).toEqual([NARRATOR, NARRATOR, "ADA", NARRATOR, NARRATOR]);
    expect(lines[0].text).toBe("Interior, ROOM, DAY");
  });
  it("every template parses into a usable script", () => {
    for (const template of STATIONERY) expect(parseFountain(template.fountain).elements.length).toBeGreaterThan(0);
  });
  it("backs up into a ZIP", () => {
    const zip = backupArchive({ title: "T" } as never, "INT. A - DAY\n", defaultProjectData());
    expect([zip[0], zip[1]]).toEqual([80, 75]);
    expect(backupFileName("A/B", new Date(2026, 10, 25, 5, 4))).toBe("AB backup 2026-11-25 0504.zip");
  });
  it("looks up synonyms and explains failures", async () => {
    const fake = (async (url: string) => ({ ok: true, json: async () => url.includes("rel_syn") ? [{ word: "glad" }] : url.includes("ml=") ? [{ word: "glad" }, { word: "cheerful" }] : [{ word: "sad" }] })) as unknown as typeof fetch;
    expect(await lookUpWord("happy", fake)).toEqual({ synonyms: ["glad"], related: ["cheerful"], antonyms: ["sad"] });
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(lookUpWord("happy", offline)).rejects.toThrow(/internet/u);
  });
});
