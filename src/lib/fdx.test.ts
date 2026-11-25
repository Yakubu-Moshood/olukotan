// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultProjectData } from "../types";
import { parseFdx, writeFdx } from "./fdx";
import { paginate, runsText } from "./pagination";

const sample = readFileSync(`${process.cwd()}/src/lib/__fixtures__/sample.fdx`, "utf8");

function importToProject(xml: string) {
  const imported = parseFdx(xml);
  const data = defaultProjectData();
  data.scenes = imported.scenes; data.revisionSets = imported.revisionSets;
  data.screenplaySettings.revisions = { enabled: !!imported.activeRevisionSetId, activeSetId: imported.activeRevisionSetId, showMarks: true };
  data.importSource = { format: "fdx", fileName: "sample.fdx", importedAt: "2026-11-25", fdxTemplate: imported.template };
  return { imported, data };
}
const shape = (elements: { type: string; text: string; metadata?: { sceneNumber?: string; dualDialogueGroupId?: string; revisionSet?: string } }[]) =>
  elements.map((e) => [e.type, e.text, e.metadata?.sceneNumber ?? "", e.metadata?.dualDialogueGroupId ? "dual" : "", e.metadata?.revisionSet ?? ""]);

describe("FDX import", () => {
  const { imported } = importToProject(sample);
  const types = imported.document.elements.map((e) => e.type);

  it("maps every paragraph type", () => {
    expect(types).toEqual(["transition", "scene-heading", "action", "character", "parenthetical", "dialogue", "note",
      "character", "dialogue", "character", "dialogue", "general", "page-break", "scene-heading", "shot"]);
  });
  it("converts text styles to Fountain emphasis and escapes literal asterisks", () => {
    expect(imported.document.elements[2].text).toBe("Rain hammers the tin roofs. **TOLU (30s)** clutches a _wrapped bundle_. 5 \\* 3 stalls are shut.");
    expect(imported.document.elements[10].text).toBe("*Never.*");
  });
  it("keeps scene numbers, summaries and colours", () => {
    expect(imported.scenes).toHaveLength(2);
    expect(imported.scenes[0]).toMatchObject({ number: "1", summary: "Tolu searches the night market for her mother.", colour: "#ff0000", tags: ["Market"] });
    expect(imported.scenes[1].number).toBe("2A");
  });
  it("groups dual dialogue, keeps notes, revisions and Yoruba diacritics", () => {
    const dual = imported.document.elements.filter((e) => e.metadata?.dualDialogueGroupId);
    expect(dual).toHaveLength(4); expect(new Set(dual.map((e) => e.metadata!.dualDialogueGroupId)).size).toBe(1);
    expect(imported.document.elements[6]).toMatchObject({ type: "note", text: "Check pronunciation with cast." });
    expect(imported.document.elements[5].metadata?.revisionSet).toBe("fdx-revision-2");
    expect(imported.revisionSets.map((set) => set.name)).toEqual(["First", "Blue"]);
    expect(imported.activeRevisionSetId).toBe("fdx-revision-2");
    expect(imported.document.elements[1].text).toBe("EXT. ỌJÀ MARKET - NIGHT");
  });
  it("reads the title page into structured fields", () => {
    expect(imported.titlePage).toEqual({ title: "ÀBÍKẸ́", credit: "Written by", author: "Yakubu Moshood", contact: "Before Light Media\nLagos", draftDate: "Blue Draft 2026" });
  });
  it("warns about paragraph types it does not model", () => {
    expect(imported.warnings).toEqual(["1 “New Act” paragraph imported as General Text."]);
    expect(imported.stats).toMatchObject({ scenes: 2, characters: 2, dualDialogue: 1 });
  });
  it("rejects malformed or non-Final Draft XML without partial import", () => {
    expect(() => parseFdx("<FinalDraft><Content><Paragraph>")).toThrow(/not valid Final Draft XML/u);
    expect(() => parseFdx("<?xml version='1.0'?><html/>")).toThrow(/not a Final Draft document/u);
  });
  it("paginates imported dual dialogue side by side", () => {
    const { data } = importToProject(sample);
    const layout = paginate(imported.document, data);
    const cues = layout.pages[0].lines.filter((line) => line.type === "character" && /IYÁ|TOLU$/u.test(runsText(line.runs)));
    expect(cues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("FDX round trip", () => {
  it("re-imports its own export with identical structure, styles, numbers and revisions", () => {
    const { imported, data } = importToProject(sample);
    const xml = writeFdx(imported.document, data, { includeSceneNumbers: true, includeNotes: true, includeTitlePage: true, titlePage: imported.titlePage, template: data.importSource!.fdxTemplate });
    const again = parseFdx(xml);
    const strip = (rows: string[][]) => rows.map((row) => [...row.slice(0, 4), row[4] ? "rev" : ""]);
    expect(strip(shape(again.document.elements))).toEqual(strip(shape(imported.document.elements)));
    expect(again.scenes.map((s) => [s.number, s.summary, s.colour])).toEqual(imported.scenes.map((s) => [s.number, s.summary, s.colour]));
    expect(again.titlePage).toEqual(imported.titlePage);
    expect(again.revisionSets.map((s) => s.name)).toEqual(["First", "Blue"]);
  });
  it("writes back the Final Draft sections Olukotan does not model", () => {
    const { imported, data } = importToProject(sample);
    const xml = writeFdx(imported.document, data, { includeSceneNumbers: true, includeNotes: false, includeTitlePage: true, titlePage: imported.titlePage, template: data.importSource!.fdxTemplate });
    expect(xml).toContain('<ElementSettings Type="Action">');
    expect(xml).toContain("<SmartType>");
    expect(xml.match(/<Content>/gu)).toHaveLength(2); // script + title page
    expect(xml).not.toContain("OLUKOTAN:");
  });
  it("produces valid standalone FDX for projects that were never imported", () => {
    const { imported } = importToProject(sample);
    const xml = writeFdx(imported.document, defaultProjectData(), { includeSceneNumbers: false, includeNotes: false, includeTitlePage: false, titlePage: {} });
    expect(() => parseFdx(xml)).not.toThrow();
    expect(xml.startsWith("<?xml")).toBe(true);
  });
});
