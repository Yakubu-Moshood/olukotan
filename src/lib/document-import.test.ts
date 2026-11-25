// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { defaultProjectData } from "../types";
import { exportScreenplay } from "./exporters";
import { importScreenplayBytes } from "./importers";
import { paginate, layoutTitlePage, parseTitlePage } from "./pagination";
import { renderPdf, type FontLoader } from "./pdf-render";
import { parseFountain, type ScreenplayElement } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";
import { visibleText } from "./rich-text";

const fixture = (name: string) => new Uint8Array(readFileSync(`${process.cwd()}/src/lib/__fixtures__/${name}`));
const fontLoader: FontLoader = async (name) => new Uint8Array(await readFile(`${process.cwd()}/public/fonts/${name}.ttf`));
const shape = (elements: ScreenplayElement[]) => elements.filter((e) => e.text.trim()).map((e) => [e.type, visibleText(e.text)]);

describe("Word import", () => {
  it("reads paragraph styles from screenwriting-app exports, with formatting", async () => {
    const preview = await importScreenplayBytes("market.docx", fixture("styled.docx"));
    expect(preview.format).toBe("docx");
    expect(shape(preview.document.elements)).toEqual([
      ["scene-heading", "EXT. ỌJÀ MARKET - NIGHT"], ["action", "Rain hammers the roofs. TOLU runs fast."], ["character", "TOLU"],
      ["parenthetical", "(whispering)"], ["dialogue", "Màmá? Are you here?"], ["transition", "CUT TO:"], ["scene-heading", "INT. ROOM - DAY"], ["action", "Silence."]]);
    expect(preview.document.elements[1].text).toBe("Rain hammers the roofs. **TOLU** runs *fast*.");
    expect(preview.document.elements[4].text).toBe("Màmá? Are you _here_?");
  });
  it("reads hand-formatted scripts from their indentation", async () => {
    const preview = await importScreenplayBytes("room.docx", fixture("indented.docx"));
    expect(shape(preview.document.elements).map(([type]) => type)).toEqual(["scene-heading", "action", "character", "parenthetical", "dialogue", "character", "dialogue", "transition", "scene-heading", "action"]);
  });
  it("falls back to reading the text when there is no layout", async () => {
    const preview = await importScreenplayBytes("plain.docx", fixture("plain.docx"));
    expect(shape(preview.document.elements).map(([type]) => type)).toEqual(["scene-heading", "action", "character", "dialogue", "character", "parenthetical", "dialogue", "scene-heading", "action"]);
    expect(preview.warnings.join(" ")).toMatch(/no screenplay layout/u);
  });
  it("round-trips Olukotan's own Word export", async () => {
    const source = synchroniseSceneMetadata(parseFountain("INT. A - DAY\n\nShe waits.\n\nADA\n(low)\nNot yet.\n\nCUT TO:\n\nEXT. B - NIGHT\n\nRain.\n"), defaultProjectData());
    const exported = await exportScreenplay("docx", { project: { manifest: { title: "T", author: "A" } } as never, document: source.document, projectData: source.projectData,
      options: { includeTitlePage: false, includeSceneNumbers: false, includePageNumbers: false, includeScriptNotes: false, includeRevisionMarks: false, includeOmittedScenes: false } });
    const preview = await importScreenplayBytes("t.docx", exported.data as Uint8Array);
    expect(shape(preview.document.elements)).toEqual(shape(source.document.elements));
  });
  it("rejects files that aren't Word documents", async () => {
    await expect(importScreenplayBytes("bad.docx", new TextEncoder().encode("not a zip"))).rejects.toThrow(/not a valid Word document/u);
  });
});

describe("PDF import", () => {
  it("rebuilds a paginated script, joining wrapped lines and dropping page furniture", async () => {
    const speech = "I told you before. The river does not forgive. It takes what it is owed and it always collects. Listen to me carefully tonight.";
    const scenes = Array.from({ length: 8 }, (_, i) => `INT. ỌJÀ STALL ${i + 1} - NIGHT\n\nRain hammers the tin roofs while Tolu counts the doors under her breath and a generator coughs.\n\nTOLU\n(quietly)\n${speech} ${speech}\n\nIYÁ ÀGBÀ (O.S.)\n${speech}\n\nCUT TO:\n\n`).join("");
    const data = defaultProjectData(); data.screenplaySettings.pagination.pageSize = "US Letter"; data.screenplaySettings.sceneNumbers.enabled = true;
    const source = synchroniseSceneMetadata(parseFountain(`Title: ÀBÍKẸ́\nCredit: written by\nAuthor: Yakubu Moshood\n\n${scenes}`), data);
    const layout = paginate(source.document, source.projectData, { sceneNumber: (e) => source.projectData.scenes.find((s) => s.sceneId === e.metadata?.sceneId)?.number });
    layout.titlePage = layoutTitlePage(parseTitlePage(source.document.preamble), layout.geometry);
    expect(layout.pages.length).toBeGreaterThan(3);
    const bytes = await renderPdf(layout, { settings: source.projectData.screenplaySettings, includePageNumbers: true, includeSceneNumbers: true, includeRevisionMarks: false, fontLoader });
    const preview = await importScreenplayBytes("abike.pdf", bytes);
    expect(preview.title).toBe("ÀBÍKẸ́");
    expect(preview.author).toBe("Yakubu Moshood");
    expect(shape(preview.document.elements)).toEqual(shape(source.document.elements));
  }, 30000);
  it("explains scanned or unreadable PDFs instead of guessing", async () => {
    await expect(importScreenplayBytes("broken.pdf", new TextEncoder().encode("%PDF-1.4 garbage"))).rejects.toThrow(/could not be read|no text layer/u);
  });
});
