// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultProjectData } from "../types";
import { parseFdx, writeFdx } from "./fdx";
import { paginate, runsText } from "./pagination";
import { shiftRevisionRuns } from "./revisions";
import { parseFountain, serializeFountain } from "./screenplay-elements";

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

describe("FDX run-level revision marks", () => {
  // Hand-built in Final Draft 12's FDX format (not saved by Final Draft itself): one action
  // paragraph holding an unmarked phrase, a Blue (ID 1) phrase and a Pink (ID 2) phrase.
  const fixture = readFileSync(`${process.cwd()}/src/lib/__fixtures__/run-revisions.fdx`, "utf8");
  const runsOf = (xml: string, paragraphIndex: number) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const content = [...doc.documentElement.children].find((node) => node.nodeName === "Content")!;
    const paragraph = [...content.children].filter((node) => node.nodeName === "Paragraph")[paragraphIndex];
    return [...paragraph.children].filter((node) => node.nodeName === "Text").map((text) => [text.textContent, text.getAttribute("RevisionID") ?? "0", text.getAttribute("Style") ?? ""]);
  };
  const expected = [["The lamp turns slowly. ", "0", ""], ["A stranger climbs the stairs, ", "1", ""], ["soaked to the bone.", "2", "Bold"]];

  it("imports each run's revision set", () => {
    const { imported } = importToProject(fixture);
    const action = imported.document.elements[1];
    expect(action.text).toBe("The lamp turns slowly. A stranger climbs the stairs, **soaked to the bone.**");
    expect(action.metadata?.revisionRuns).toEqual([[23, 53, "fdx-revision-1"], [53, 72, "fdx-revision-2"]]);
    expect(action.metadata?.revisionSet).toBeUndefined();
    const dialogue = imported.document.elements[3];
    expect(dialogue.metadata?.revisionRuns).toEqual([[0, 14, "fdx-revision-2"]]);
    // A paragraph marked from end to end by one set keeps the paragraph-level mark.
    expect(imported.document.elements[4].metadata).toMatchObject({ revisionSet: "fdx-revision-1" });
    expect(imported.document.elements[4].metadata?.revisionRuns).toBeUndefined();
  });

  it("keeps all three runs through save and reopen (Fountain) and FDX export", () => {
    const { imported, data } = importToProject(fixture);
    const reopened = parseFountain(serializeFountain(imported.document));
    expect(reopened.elements.map((element) => element.metadata?.revisionRuns)).toEqual(imported.document.elements.map((element) => element.metadata?.revisionRuns));
    for (const template of [data.importSource!.fdxTemplate, undefined]) {
      const xml = writeFdx(reopened, data, { includeSceneNumbers: true, includeNotes: false, includeTitlePage: false, titlePage: {}, template });
      expect(runsOf(xml, 1)).toEqual(expected);
      expect(runsOf(xml, 3)).toEqual([["Shut the door.", "2", ""], [" The wind will put the light out.", "0", ""]]);
      const again = parseFdx(xml);
      expect(again.document.elements[1].metadata?.revisionRuns).toEqual(imported.document.elements[1].metadata?.revisionRuns);
      expect(again.revisionSets.map((set) => [set.name, set.mark])).toEqual([["Blue", "*"], ["Pink", "+"]]);
    }
  });

  it("moves run marks with the text when the paragraph is edited", () => {
    const runs: [number, number, string][] = [[23, 52, "b"], [52, 71, "p"]];
    const before = "The lamp turns slowly. A stranger climbs the stairs, soaked to the bone.";
    // Insert "very " before "slowly": every run shifts right by five.
    expect(shiftRevisionRuns(runs, before, before.replace("slowly", "very slowly"))).toEqual([[28, 57, "b"], [57, 76, "p"]]);
    // In revision mode the inserted words take the active set.
    expect(shiftRevisionRuns(runs, before, before.replace("climbs", "slowly climbs"), "p")).toEqual([[23, 34, "b"], [34, 41, "p"], [41, 59, "b"], [59, 78, "p"]]);
  });
});
