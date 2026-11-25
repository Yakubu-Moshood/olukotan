// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { importScreenplayFile, importedFountain } from "./importers";
import { parseFountain } from "./screenplay-elements";

const fdx = readFileSync(`${process.cwd()}/src/lib/__fixtures__/sample.fdx`, "utf8");

describe("import previews", () => {
  it("builds a project from FDX with manual scene numbers kept", () => {
    const preview = importScreenplayFile("abike.fdx", fdx, "2026-11-25T00:00:00Z");
    expect(preview).toMatchObject({ format: "fdx", title: "ÀBÍKẸ́", author: "Yakubu Moshood" });
    expect(preview.projectData.scenes.map((scene) => scene.number)).toEqual(["1", "2A"]);
    expect(preview.projectData.screenplaySettings.sceneNumbers).toMatchObject({ enabled: true, mode: "manual" });
    expect(preview.projectData.importSource?.fdxTemplate).toContain("<SmartType>");
  });
  it("survives the Fountain storage round trip without losing structure", () => {
    const preview = importScreenplayFile("abike.fdx", fdx);
    const reparsed = parseFountain(importedFountain(preview));
    const kinds = (elements: { type: string }[]) => elements.map((element) => element.type);
    expect(kinds(reparsed.elements)).toEqual(kinds(preview.document.elements));
    expect(reparsed.preamble).toContain("Title: ÀBÍKẸ́");
  });
  it("imports Fountain and rejects unsupported formats without changes", () => {
    expect(importScreenplayFile("x.fountain", "Title: Night\n\nINT. A - DAY\n\nHello.\n").stats.scenes).toBe(1);
    expect(() => importScreenplayFile("x.docx", "PK")).toThrow(/was not changed/u);
  });
});

describe("Fountain storage keeps FDX-only structure", () => {
  it("preserves dual dialogue and revision marks through save and reopen", () => {
    const preview = importScreenplayFile("abike.fdx", fdx);
    const fountain = importedFountain(preview);
    expect(fountain).toContain("TOLU ^");
    const reparsed = parseFountain(fountain);
    const meta = (elements: { type: string; metadata?: { dualDialogueGroupId?: string; revisionSet?: string } }[]) =>
      elements.map((element) => [element.type, Boolean(element.metadata?.dualDialogueGroupId), element.metadata?.revisionSet ?? ""]);
    expect(meta(reparsed.elements)).toEqual(meta(preview.document.elements));
  });
  it("reads standard Fountain dual dialogue from other apps", () => {
    const parsed = parseFountain("ADA\nWe leave at dawn.\n\nBAYO ^\nWe leave at dawn.\n");
    expect(parsed.elements.filter((element) => element.metadata?.dualDialogueGroupId)).toHaveLength(4);
    expect(parsed.elements[2].text).toBe("BAYO");
  });
});
