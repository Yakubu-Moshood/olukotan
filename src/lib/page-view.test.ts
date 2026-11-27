// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { defaultProjectData } from "../types";
import { paginate, runsText, type Layout } from "./pagination";
import { pageViewGroups } from "./page-view";
import { renderPdf, type FontLoader } from "./pdf-render";
import { visibleText } from "./rich-text";
import { parseFountain, type ScreenplayDocument } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";

const fontLoader: FontLoader = async (name) => new Uint8Array(await readFile(`${process.cwd()}/public/fonts/${name}.ttf`));

// Original filler text, invented for these tests.
const sentence = (n: number) => `Line ${n} of the harbour story keeps rolling while the tide comes in.`;
const action = (count: number, from = 1) => Array.from({ length: count }, (_, i) => sentence(from + i)).join(" ");
// Each sentence fills most of a dialogue line, so lines end at sentence breaks (where speeches may split).
const speech = (count: number) => Array.from({ length: count }, (_, i) => `We hold quay number ${i + 1} till the dawn.`).join(" ");

function script(): string {
  return [
    "INT. HARBOUR OFFICE - NIGHT", "",
    action(24), "", // fills most of page 1 so the speech below must break
    "ADEOLA", "(steady)", speech(22), "",
    "EXT. QUAYSIDE - DAWN", "",
    action(110, 100), "", // longer than a page: one page is nothing but its continuation
    "INT. WAREHOUSE - DAY", "",
    "TUNDE", speech(70), "",
    "KEMI ^", speech(76), "", // dual dialogue taller than a page
    "Silence settles over the warehouse.",
  ].join("\n");
}

function build(pageSize: "A4" | "US Letter") {
  const data = defaultProjectData();
  data.screenplaySettings.pagination.pageSize = pageSize;
  const source = synchroniseSceneMetadata(parseFountain(script()), data);
  const layout = paginate(source.document, source.projectData);
  return { document: source.document, projectData: source.projectData, layout };
}

const words = (text: string) => text.replace(/\s+/gu, " ").trim().split(" ").filter(Boolean);
/** Words printed on a page for one element (body lines only), in reading order. */
const printed = (layout: Layout, page: number, elementId: string) =>
  words(layout.pages[page - 1].lines.filter((line) => line.elementId === elementId && line.kind === "body").sort((a, b) => a.row - b.row).map((line) => runsText(line.runs)).join(" "));

function editorPages(document: ScreenplayDocument, layout: Layout) {
  return pageViewGroups(document.elements, layout).map((group) => ({
    page: group.page,
    items: group.items.map((item) => item.kind === "decoration"
      ? { decoration: runsText(item.line.runs), kind: item.line.kind }
      : { elementId: document.elements[item.index].id, type: document.elements[item.index].type, text: visibleText(document.elements[item.index].text).slice(item.start, item.end) }),
  }));
}

describe.each(["US Letter", "A4"] as const)("Page View matches the PDF page by page (%s)", (pageSize) => {
  const { document, projectData, layout } = build(pageSize);
  const pages = editorPages(document, layout);

  it("puts every part of a split element on the page the PDF prints it on, losing nothing", () => {
    expect(layout.fragments.size).toBeGreaterThan(0);
    for (const element of document.elements) {
      const parts = pages.flatMap((page) => page.items.filter((item) => "elementId" in item && item.elementId === element.id).map((item) => ({ page: page.page, text: (item as { text: string }).text })));
      expect(parts.map((part) => part.text).join("")).toBe(visibleText(element.text));
      if (element.type === "character") continue; // cues print as rendered (CONT'D added), checked below
      for (const part of parts) if (part.text.trim()) expect(words(part.text)).toEqual(printed(layout, part.page, element.id));
    }
  });

  it("shows a page that holds only a continuation", () => {
    const longAction = document.elements.find((element) => element.text.startsWith("Line 100"))!;
    const fragments = layout.fragments.get(longAction.id)!;
    expect(fragments.length).toBeGreaterThanOrEqual(3);
    const middle = pages.find((page) => page.page === fragments[1].page)!;
    const elementItems = middle.items.filter((item) => "elementId" in item) as { elementId: string; text: string }[];
    expect(elementItems.map((item) => item.elementId)).toEqual([longAction.id]);
    expect(fragments[1].start).toBeGreaterThan(0);
  });

  it("places (MORE) and (CONT'D) at the same breaks as the PDF layout", () => {
    for (const page of layout.pages) {
      const expected = page.lines.filter((line) => line.kind === "more" || line.kind === "contd-cue").map((line) => runsText(line.runs)).sort();
      const shown = (pages.find((p) => p.page === page.index)?.items ?? []).filter((item) => "decoration" in item && (item.kind === "more" || item.kind === "contd-cue")).map((item) => (item as { decoration: string }).decoration).sort();
      expect(shown).toEqual(expected);
    }
    const all = layout.pages.flatMap((page) => page.lines.map((line) => runsText(line.runs)));
    expect(all.filter((text) => text === "(MORE)").length).toBeGreaterThanOrEqual(3); // single speech + both dual columns
    expect(all.some((text) => text === "ADEOLA (CONT'D)")).toBe(true);
    expect(all.some((text) => text === "TUNDE (CONT'D)")).toBe(true);
    expect(all.some((text) => text === "KEMI (CONT'D)")).toBe(true);
  });

  it("continues dual dialogue that is taller than a page without clipping either column", () => {
    for (const page of layout.pages) for (const line of page.lines) expect(line.row).toBeLessThan(layout.geometry.linesPerPage);
    // The two columns sit side by side without overlapping: every left-column line ends before the right column starts.
    const kemi = document.elements.find((element) => element.type === "character" && element.text.startsWith("KEMI"))!;
    const kemiIds = new Set([kemi.id, document.elements[document.elements.indexOf(kemi) + 1].id]);
    for (const page of layout.pages) {
      const right = page.lines.filter((line) => line.elementId && kemiIds.has(line.elementId));
      if (!right.length) continue;
      const rightEdge = Math.min(...right.map((line) => line.x));
      for (const line of page.lines.filter((l) => right.some((r) => r.row === l.row) && !kemiIds.has(l.elementId ?? "") && l.align === "left"))
        expect(line.x + runsText(line.runs).length * 0.1).toBeLessThanOrEqual(rightEdge);
    }
    for (const name of ["TUNDE", "KEMI"]) {
      const cue = document.elements.findIndex((element) => element.type === "character" && element.text.startsWith(name));
      const dialogue = document.elements[cue + 1];
      const printedWords = layout.pages.flatMap((page) => printed(layout, page.index, dialogue.id));
      expect(printedWords).toEqual(words(visibleText(dialogue.text)));
    }
  });

  it("prints the same words on each page of the PDF as Page View shows", async () => {
    const bytes = await renderPdf(layout, { settings: projectData.screenplaySettings, includePageNumbers: true, includeSceneNumbers: false, includeRevisionMarks: false, fontLoader });
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await lib.getDocument({ data: bytes, useSystemFonts: false }).promise;
    expect(pdf.numPages).toBe(layout.pages.length);
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      const pdfWords = words(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      const pageNumber = pdfWords.indexOf(`${layout.pages[number - 1].label}.`);
      if (number > 1 && pageNumber >= 0) pdfWords.splice(pageNumber, 1); // the printed page number
      pdfWords.sort();
      const page = pages.find((p) => p.page === number)!;
      const editorWords = page.items.flatMap((item): string[] => {
        if ("decoration" in item) return words(item.decoration ?? "");
        const element = item as { elementId: string; type: string; text: string };
        // Cues print as rendered (e.g. with CONT'D); headings print in capitals.
        if (element.type === "character") return words(runsText(layout.pages[number - 1].lines.find((line) => line.elementId === element.elementId && line.kind === "body")?.runs ?? []));
        return words(element.type === "scene-heading" ? element.text.toLocaleUpperCase("en-GB") : element.text);
      }).sort();
      expect(pdfWords).toEqual(editorWords);
    }
  }, 30000);
});
