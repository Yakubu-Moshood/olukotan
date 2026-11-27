import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { defaultProjectData, type ProjectData } from "../types";
import { columnWidth, layoutTitlePage, titleCreditBlock, paginate, pageGeometry, pageNumberLabel, parseTitlePage, runsText, serializeTitlePage, styledChars, wrapText } from "./pagination";
import { renderPdf, type FontLoader } from "./pdf-render";
import { createElement, parseFountain, type ScreenplayDocument } from "./screenplay-elements";

const fontLoader: FontLoader = async (name) => new Uint8Array(await readFile(new URL(`../../public/fonts/${name}.ttf`, import.meta.url)));
const letter = (): ProjectData => { const data = defaultProjectData(); data.screenplaySettings.pagination.pageSize = "US Letter"; return data; };
const lineTexts = (page: { lines: { runs: { text: string }[] }[] }) => page.lines.map((line) => runsText(line.runs));

describe("geometry", () => {
  it("uses 54 body lines on US Letter and 58 on A4", () => {
    expect(pageGeometry("US Letter").linesPerPage).toBe(54);
    expect(pageGeometry("A4").linesPerPage).toBe(58);
  });
});

describe("wrapping", () => {
  it("wraps action at 60 columns on word boundaries", () => {
    const lines = wrapText("word ".repeat(30).trim(), 60);
    expect(lines.length).toBe(3);
    lines.forEach((line) => expect(columnWidth(runsText(line))).toBeLessThanOrEqual(60));
  });
  it("parses emphasis without consuming literal asterisks", () => {
    expect(styledChars("a **bold** b").filter((c) => c.bold).map((c) => c.ch).join("")).toBe("bold");
    expect(styledChars("5 * 3").map((c) => c.ch).join("")).toBe("5 * 3");
    expect(styledChars("_under_").every((c) => c.underline)).toBe(true);
  });
  it("counts combining marks as zero width", () => {
    expect(columnWidth("ÀBÍKẸ́".normalize("NFD"))).toBe(5);
  });
});

function longSpeech(sentences: number) { return Array.from({ length: sentences }, (_, i) => `This is sentence number ${i + 1} of the speech.`).join(" "); }

describe("pagination", () => {
  it("breaks long dialogue with (MORE) and a (CONT'D) cue", () => {
    const filler = Array.from({ length: 40 }, (_, i) => createElement("action", `Line ${i}.`));
    const document: ScreenplayDocument = { preamble: "", elements: [createElement("scene-heading", "INT. HOUSE - DAY"), ...filler.slice(0, 20),
      createElement("character", "ADA"), createElement("dialogue", longSpeech(20))] };
    const layout = paginate(document, letter());
    expect(layout.pages.length).toBe(2);
    expect(lineTexts(layout.pages[0])).toContain("(MORE)");
    expect(lineTexts(layout.pages[1])[0]).toBe("ADA (CONT'D)");
    // The page that ends in (MORE) never ends on a parenthetical or cue.
    const last = layout.pages[0].lines.at(-1)!; expect(last.kind).toBe("more");
  });

  it("keeps a scene heading with at least two lines of what follows", () => {
    const filler = Array.from({ length: 25 }, (_, i) => createElement("action", `Beat ${i}.`));
    const elements = [createElement("scene-heading", "INT. A - DAY"), ...filler, createElement("scene-heading", "EXT. B - NIGHT"), createElement("action", longSpeech(4))];
    const layout = paginate({ preamble: "", elements }, letter());
    const firstPageTexts = lineTexts(layout.pages[0]);
    expect(firstPageTexts.at(-1)).not.toBe("EXT. B - NIGHT");
    expect(lineTexts(layout.pages[1])[0]).toBe("EXT. B - NIGHT");
  });

  it("splits action only at sentence ends", () => {
    const elements = [createElement("action", "x."), ...Array.from({ length: 24 }, () => createElement("action", "Filler.")), createElement("action", longSpeech(12))];
    const layout = paginate({ preamble: "", elements }, letter());
    const lastOnFirst = lineTexts(layout.pages[0]).at(-1)!;
    expect(lastOnFirst.trimEnd()).toMatch(/\.$/u);
  });

  it("honours forced page breaks and records element pages", () => {
    const a = createElement("action", "Page one."), b = createElement("action", "Page two.");
    const layout = paginate({ preamble: "", elements: [a, createElement("page-break"), b] }, letter());
    expect(layout.pages.length).toBe(2);
    expect(layout.elementPage.get(b.id)).toBe(2);
  });

  it("prints scene CONTINUED markers when enabled", () => {
    const data = letter(); data.screenplaySettings.continueds.sceneContinued = "top-and-bottom";
    const elements = [createElement("scene-heading", "INT. A - DAY"), ...Array.from({ length: 40 }, (_, i) => createElement("action", `Beat ${i}.`))];
    const layout = paginate({ preamble: "", elements }, data);
    expect(lineTexts(layout.pages[0])).toContain("(CONTINUED)");
    expect(lineTexts(layout.pages[1])[0]).toBe("CONTINUED:");
  });

  it("lays out dual dialogue side by side", () => {
    const group = "dual-1";
    const elements = [createElement("character", "ADA", { dualDialogueGroupId: group }), createElement("dialogue", "Yes."),
      createElement("character", "BAYO", { dualDialogueGroupId: group }), createElement("dialogue", "No.")];
    const layout = paginate({ preamble: "", elements }, letter());
    const rows = layout.pages[0].lines.filter((line) => line.type === "character").map((line) => line.row);
    expect(rows[0]).toBe(rows[1]);
  });

  it("prints omitted scenes as OMITTED", () => {
    const data = letter();
    const heading = createElement("scene-heading", "INT. GONE - DAY", { sceneId: "s1" });
    data.scenes = [{ sceneId: "s1", omitted: true }];
    const layout = paginate({ preamble: "", elements: [heading, createElement("action", "Hidden.")] }, data);
    expect(lineTexts(layout.pages[0])).toEqual(["OMITTED"]);
  });

  it("paginates a 120-page script quickly", () => {
    const scene = "INT. ROOM - DAY\n\nAction line that describes what happens in reasonable detail for the reader.\n\nADA\nDialogue that runs a little while to fill some space.\n\n";
    const document = parseFountain(scene.repeat(700));
    const started = performance.now();
    const layout = paginate(document, letter());
    expect(layout.pages.length).toBeGreaterThan(100);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("title page", () => {
  it("spaces stacked credits so Story by and Written by read as separate blocks", () => {
    const block = titleCreditBlock({ credit: "Story by", author: "Jade Osiberu\nWritten by\nYakubu Moshood" });
    expect(block).toEqual(["Story by", "", "Jade Osiberu", "", "", "Written by", "", "Yakubu Moshood"]);
    expect(titleCreditBlock({ author: "Yaks" })).toEqual(["written by", "", "Yaks"]);
  });
  it("parses and re-serialises Fountain title fields", () => {
    const fields = parseTitlePage("Title: ÀBÍKẸ́\nCredit: written by\nAuthor: Yakubu Moshood\nContact:\n    Before Light Media\n    Lagos");
    expect(fields.title).toBe("ÀBÍKẸ́");
    expect(fields.contact).toBe("Before Light Media\nLagos");
    expect(parseTitlePage(serializeTitlePage(fields))).toEqual(fields);
  });
  it("centres the title and puts contact bottom-left", () => {
    const page = layoutTitlePage({ title: "Mortal Sin", author: "Yaks", contact: "a@b.c" }, pageGeometry("US Letter"));
    const title = page.lines.find((line) => runsText(line.runs) === "MORTAL SIN")!;
    expect(title.align).toBe("center");
    expect(page.lines.find((line) => runsText(line.runs) === "a@b.c")!.row).toBe(53);
  });
});

describe("page numbers", () => {
  it("hides page 1 and labels later pages with a trailing period", () => {
    const settings = defaultProjectData().screenplaySettings;
    expect(pageNumberLabel({ index: 1, label: "1", lines: [], elementIds: [] }, settings)).toBeUndefined();
    expect(pageNumberLabel({ index: 2, label: "2", lines: [], elementIds: [] }, settings)).toBe("2.");
    expect(pageNumberLabel({ index: 3, label: "2A", lines: [], elementIds: [] }, settings)).toBe("2A.");
  });
});

describe("pdf", () => {
  it("renders a valid PDF with Yoruba diacritics and the right page count", async () => {
    const document = parseFountain("INT. ÀBÍKẸ́'S ROOM - NIGHT\n\nỌLỌ́RUN ṣe é. Price: ₦5,000.\n");
    const layout = paginate(document, letter());
    layout.titlePage = layoutTitlePage({ title: "ÀBÍKẸ́", author: "Yaks" }, layout.geometry);
    const bytes = await renderPdf(layout, { settings: letter().screenplaySettings, includePageNumbers: true, includeSceneNumbers: true, includeRevisionMarks: false, fontLoader });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});

describe("fountain title page parsing", () => {
  it("ends the title page at the first blank line and keeps indented contact lines", () => {
    const parsed = parseFountain("Title: X\nContact:\n    Before Light Media\n    Lagos\n\nFADE IN:\n\nINT. A - DAY\n");
    expect(parsed.preamble).toBe("Title: X\nContact:\n    Before Light Media\n    Lagos");
    expect(parsed.elements[0]).toMatchObject({ type: "transition", text: "FADE IN:" });
  });
});

describe("locked pages", () => {
  const scene = (n: number) => `INT. ROOM ${n} - DAY\n\n${Array.from({ length: 6 }, (_, i) => `Action beat ${n}.${i} happens here and fills a line or two of the page.`).join("\n\n")}\n\nADA\n${longSpeech(6)}\n\n`;
  const build = () => parseFountain(Array.from({ length: 12 }, (_, i) => scene(i + 1)).join(""));

  it("reproduces the same pages and labels when nothing changed", async () => {
    const { lockPages } = await import("./pagination");
    const document = build(); const data = letter();
    const before = paginate(document, data);
    const locked = paginate(document, data, { lockedPages: lockPages(before) });
    expect(locked.pages.map((page) => page.label)).toEqual(before.pages.map((page) => page.label));
    expect(locked.pages.map((page) => page.lines.length)).toEqual(before.pages.map((page) => page.lines.length));
  });

  it("creates A-pages for added material without moving later pages", async () => {
    const { lockPages } = await import("./pagination");
    const document = build(); const data = letter();
    const before = paginate(document, data); const lockedPages = lockPages(before);
    // Insert a lot of new material on page 2.
    const anchor = before.pages[1].elementIds[1];
    const at = document.elements.findIndex((element) => element.id === anchor);
    const inserted = Array.from({ length: 30 }, (_, i) => createElement("action", `New material ${i}.`));
    const edited = { ...document, elements: [...document.elements.slice(0, at + 1), ...inserted, ...document.elements.slice(at + 1)] };
    const after = paginate(edited, data, { lockedPages });
    const labels = after.pages.map((page) => page.label);
    expect(labels.slice(0, 3)).toEqual(["1", "2", "2A"]);
    expect(labels).toContain("3");
    // Page 3 starts exactly where it did before.
    const three = after.pages.find((page) => page.label === "3")!;
    expect(three.elementIds[0]).toBe(before.pages[2].elementIds[0]);
  });

  it("labels the surviving page with a range when locked pages are emptied", async () => {
    const { lockPages } = await import("./pagination");
    const document = build(); const data = letter();
    const before = paginate(document, data); const lockedPages = lockPages(before);
    const remove = new Set([...before.pages[2].elementIds, ...before.pages[3].elementIds].filter((id) => !before.pages[1].elementIds.includes(id) && !before.pages[4].elementIds.includes(id)));
    const edited = { ...document, elements: document.elements.filter((element) => !remove.has(element.id)) };
    const labels = paginate(edited, data, { lockedPages }).pages.map((page) => page.label);
    expect(labels).toContain("2-4");
    expect(labels).toContain("5");
  });

  it("creates A-pages when material is added on page 1", async () => {
    const { lockPages } = await import("./pagination");
    const document = build(); const data = letter();
    const lockedPages = lockPages(paginate(document, data));
    const inserted = Array.from({ length: 30 }, (_, i) => createElement("action", `New material ${i}.`));
    const edited = { ...document, elements: [document.elements[0], document.elements[1], ...inserted, ...document.elements.slice(2)] };
    const labels = paginate(edited, data, { lockedPages }).pages.map((page) => page.label);
    expect(labels.slice(0, 2)).toEqual(["1", "1A"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("locks a page that begins in the middle of a speech without looping", async () => {
    const { lockPages } = await import("./pagination");
    const filler = Array.from({ length: 40 }, (_, i) => createElement("action", `Line ${i}.`));
    const document = { preamble: "", elements: [createElement("scene-heading", "INT. HALL - DAY"), ...filler, createElement("character", "ADA"), createElement("dialogue", longSpeech(30))] };
    const data = letter();
    const before = paginate(document, data);
    const starts = lockPages(before);
    expect(starts.some((start) => start.line > 0)).toBe(true); // page 2 starts mid-speech
    const locked = paginate(document, data, { lockedPages: starts });
    expect(locked.pages.map((page) => page.label)).toEqual(before.pages.map((page) => page.label));
    expect(locked.pages.map((page) => lineTexts(page))).toEqual(before.pages.map((page) => lineTexts(page)));
  });

  it("re-locks from the selected page, keeping earlier pages (and their A-page) as issued", async () => {
    const { lockPages, relockFromPage } = await import("./pagination");
    const document = build(); const data = letter();
    const lockedPages = lockPages(paginate(document, data));
    const insertAfter = (elements: typeof document.elements, anchorId: string, count: number, tag: string) => {
      const at = elements.findIndex((element) => element.id === anchorId);
      return [...elements.slice(0, at + 1), ...Array.from({ length: count }, (_, i) => createElement("action", `${tag} added line ${i}.`)), ...elements.slice(at + 1)];
    };
    const original = paginate(document, data, { lockedPages });
    // New material on page 3 (creates 3A) and on page 5 (creates 5A).
    let elements = insertAfter(document.elements, original.pages[2].elementIds[1], 15, "Early");
    elements = insertAfter(elements, original.pages[4].elementIds[1], 15, "Later");
    const edited = { ...document, elements };
    const before = paginate(edited, data, { lockedPages });
    const labelsBefore = before.pages.map((page) => page.label);
    const firstLine = (page: { lines: { elementId?: string; kind: string }[] }) => page.lines.find((line) => line.kind === "body")?.elementId;
    expect(labelsBefore.slice(0, 6)).toEqual(["1", "2", "3", "3A", "4", "5"]);
    expect(labelsBefore).toContain("5A");

    const from = labelsBefore.indexOf("5") + 1; // cursor on page 5
    const relocked = relockFromPage(edited, data, { lockedPages }, from);
    const after = paginate(edited, data, { lockedPages: relocked });
    const labelsAfter = after.pages.map((page) => page.label);
    console.log(`Re-lock from page 5\n  before: ${labelsBefore.join(" ")}\n  after:  ${labelsAfter.join(" ")}`);
    console.log(`  page starts before: ${before.pages.slice(0, 6).map((page) => `${page.label}@${firstLine(page)?.slice(0, 8)}`).join(" ")}`);
    console.log(`  page starts after:  ${after.pages.slice(0, 6).map((page) => `${page.label}@${firstLine(page)?.slice(0, 8)}`).join(" ")}`);

    // Everything before the selected page is exactly as issued: same labels, same first line, same content.
    for (let i = 0; i < from - 1; i++) {
      expect(after.pages[i].label).toBe(before.pages[i].label);
      expect(firstLine(after.pages[i])).toBe(firstLine(before.pages[i]));
      expect(after.pages[i].lines.length).toBe(before.pages[i].lines.length);
    }
    // From the selected page on: renumbered in sequence, no A-pages, starting where page 5 started.
    expect(firstLine(after.pages[from - 1])).toBe(firstLine(before.pages[from - 1]));
    const rest = labelsAfter.slice(from - 1);
    expect(rest).toEqual(rest.map((_, i) => String(5 + i)));
    // The earlier A-page survives (the old behaviour re-flowed the whole script and dropped it).
    expect(labelsAfter).toContain("3A");
    // Locking again with the result reproduces it.
    expect(paginate(edited, data, { lockedPages: relocked }).pages.map((page) => page.label)).toEqual(labelsAfter);
  });

  it("generates A, B … Z, AA suffixes", async () => {
    const { suffixLetters } = await import("./pagination");
    expect([1, 2, 26, 27].map(suffixLetters)).toEqual(["A", "B", "Z", "AA"]);
  });
});

describe("leading and page layout", () => {
  it("fits fewer lines per page when looser and more when tighter", () => {
    const document = parseFountain(Array.from({ length: 110 }, (_, i) => `Action paragraph number ${i} fills exactly one line.\n\n`).join(""));
    const count = (linesAdjust: number) => { const data = letter(); data.pageLayout = { top: 1, bottom: 1, headerFromTop: 0.5, footerFromBottom: 0.5, linesAdjust }; return { pages: paginate(document, data).pages.length, perPage: pageGeometry("US Letter", data.pageLayout).linesPerPage }; };
    expect(count(-2).perPage).toBe(52); expect(count(2).perPage).toBe(56);
    expect(count(-2).pages).toBeGreaterThan(count(2).pages);
  });
});
