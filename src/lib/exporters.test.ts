import { describe, expect, it } from "vitest";
import { defaultProjectData, type ExportFormat, type ProjectPayload } from "../types";
import { createElement } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";
import { exportScreenplay } from "./exporters";

const formats: ExportFormat[] = ["pdf", "fdx", "docx", "rtf", "fountain", "txt", "md", "html"];
const project = { manifest: { title: "Night Market", author: "A. Writer" } } as ProjectPayload;
const prepared = synchroniseSceneMetadata({ preamble: "Title: Night Market\nAuthor: A. Writer", elements: [
  createElement("scene-heading", "EXT. MARKET - NIGHT"), createElement("action", "Rain falls."),
  createElement("character", "DEJI"), createElement("dialogue", "We begin."),
] }, defaultProjectData());
const options = { includeTitlePage: true, includeSceneNumbers: true, includePageNumbers: true, includeScriptNotes: false, includeRevisionMarks: false, includeOmittedScenes: false };

describe("screenplay exporters", () => {
  it.each(formats)("exports a non-empty %s file from the structured document", async (format) => {
    const output = await exportScreenplay(format, { project, document: prepared.document, projectData: prepared.projectData, options });
    expect(output.format).toBe(format);
    expect(output.extension.length).toBeGreaterThan(1);
    expect(typeof output.data === "string" ? output.data.length : output.data.byteLength).toBeGreaterThan(20);
  });

  it("writes recognizable PDF, DOCX, FDX, and semantic HTML structures", async () => {
    const context = { project, document: prepared.document, projectData: prepared.projectData, options };
    const pdf = await exportScreenplay("pdf", context); expect(new TextDecoder().decode(pdf.data as Uint8Array).startsWith("%PDF-1.4")).toBe(true);
    const docx = await exportScreenplay("docx", context); expect([...((docx.data as Uint8Array).slice(0, 2))]).toEqual([80, 75]);
    const fdx = await exportScreenplay("fdx", context); expect(fdx.data).toContain('<Paragraph Type="Scene Heading" Number="1"');
    const html = await exportScreenplay("html", context); expect(html.data).toContain('class="scene-heading"');
  });

  it("keeps extensions and derived CONT'D in one structured export cue", async () => {
    const continuation = synchroniseSceneMetadata({ preamble: "", elements: [
      createElement("character", "DEJI (V.O.)"), createElement("dialogue", "First."),
      createElement("action", "A pause."), createElement("character", "DEJI (V.O.)"),
    ] }, defaultProjectData());
    const context = { project, document: continuation.document, projectData: continuation.projectData, options };
    const fdx = await exportScreenplay("fdx", context);
    expect(fdx.data).toContain('<Paragraph Type="Character"><Text>DEJI (V.O.) (CONT\'D)</Text></Paragraph>');
    const pdf = new TextDecoder().decode((await exportScreenplay("pdf", context)).data as Uint8Array);
    expect(pdf).toContain("DEJI \\(V.O.\\) \\(CONT'D\\)");
    const fountain = await exportScreenplay("fountain", context);
    expect(fountain.data).not.toContain("(CONT'D)");
  });

  it("does not introduce editor-layout line breaks into PDF, FDX, or DOCX character cues", async () => {
    const cue = "UNCLE TUNDE (CONT'D)";
    const document = synchroniseSceneMetadata({ preamble: "", elements: [
      createElement("character", cue), createElement("dialogue", "Stay here."),
    ] }, defaultProjectData());
    const context = { project, document: document.document, projectData: document.projectData, options };
    const fdx = String((await exportScreenplay("fdx", context)).data);
    const pdf = new TextDecoder().decode((await exportScreenplay("pdf", context)).data as Uint8Array);
    const docx = new TextDecoder().decode((await exportScreenplay("docx", context)).data as Uint8Array);
    expect(fdx).toContain(`<Text>${cue}</Text>`);
    expect(pdf).toContain("UNCLE TUNDE \\(CONT'D\\)");
    expect(docx).toContain(`<w:t xml:space="preserve">${cue}</w:t>`);
  });

  it("preserves semantic right-aligned transitions across every structured export", async () => {
    const document = synchroniseSceneMetadata({ preamble: "", elements: [createElement("transition", "CUT TO:")] }, defaultProjectData());
    const transitionOptions = { ...options, includeTitlePage: false, includeSceneNumbers: false, includePageNumbers: false };
    const context = { project, document: document.document, projectData: document.projectData, options: transitionOptions };
    const fountain = String((await exportScreenplay("fountain", context)).data);
    const fdx = String((await exportScreenplay("fdx", context)).data);
    const html = String((await exportScreenplay("html", context)).data);
    const rtf = String((await exportScreenplay("rtf", context)).data);
    const docx = new TextDecoder().decode((await exportScreenplay("docx", context)).data as Uint8Array);
    const pdf = new TextDecoder().decode((await exportScreenplay("pdf", context)).data as Uint8Array);
    expect(fountain).toBe(">CUT TO:\n");
    expect(fdx).toContain('<Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>');
    expect(html).toContain('<div class="transition">CUT TO:</div>');
    expect(html).toContain(".transition{text-align:right}");
    expect(rtf).toContain("\\pard\\qr");
    expect(docx).toContain('<w:jc w:val="right"/>');
    const a4X = Number(pdf.match(/BT \/F1 11 Tf ([\d.]+) [\d.]+ Td \(CUT TO:\) Tj ET/u)?.[1]);
    expect(a4X + "CUT TO:".length * 6.6).toBeCloseTo(523, 5);
    expect(pdf).toContain("/MediaBox [0 0 595 842]");

    const letterData = defaultProjectData(); letterData.screenplaySettings.pagination.pageSize = "US Letter";
    const letter = new TextDecoder().decode((await exportScreenplay("pdf", { ...context, projectData: letterData })).data as Uint8Array);
    const letterX = Number(letter.match(/BT \/F1 11 Tf ([\d.]+) [\d.]+ Td \(CUT TO:\) Tj ET/u)?.[1]);
    expect(letterX + "CUT TO:".length * 6.6).toBeCloseTo(540, 5);
    expect(letter).toContain("/MediaBox [0 0 612 792]");
  });
});
