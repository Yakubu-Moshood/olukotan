import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ScreenplaySettings } from "../types";
import { columnWidth, pageNumberLabel, type Layout, type LayoutLine, type PageLayout, type TextRun } from "./pagination";

/**
 * Renders a paginated layout to a print-accurate PDF.
 *
 * Primary face: Courier Prime (SIL OFL). Characters Courier Prime lacks —
 * Yoruba underdots, combining tone marks, ₦ and so on — fall back to Noto Sans
 * Mono (SIL OFL), which shares Courier's 0.6 em advance, so columns stay true.
 */

export type FontName = "CourierPrime-Regular" | "CourierPrime-Bold" | "CourierPrime-Italic" | "CourierPrime-BoldItalic" | "NotoSansMono-Regular" | "NotoSansMono-Bold";
export type FontLoader = (name: FontName) => Promise<Uint8Array>;

export const browserFontLoader: FontLoader = async (name) => {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";
  const response = await fetch(`${base}fonts/${name}.ttf`);
  if (!response.ok) throw new Error(`The ${name} font could not be loaded for PDF export.`);
  return new Uint8Array(await response.arrayBuffer());
};

const POINT = 72, FONT_SIZE = 12, LINE = 12, CELL = 7.2;

interface Faces { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont; fallback: PDFFont; fallbackBold: PDFFont }

export interface PdfRenderOptions {
  settings: ScreenplaySettings;
  includePageNumbers: boolean;
  includeSceneNumbers: boolean;
  includeRevisionMarks: boolean;
  /** Optional header text (e.g. "Blue Revision — 12/03/2026") printed top-left on every body page. */
  header?: string;
  title?: string;
  author?: string;
  fontLoader?: FontLoader;
}

export async function renderPdf(layout: Layout, options: PdfRenderOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const load = options.fontLoader ?? browserFontLoader;
  const embed = async (name: FontName) => pdf.embedFont(await load(name), { subset: true });
  const faces: Faces = {
    regular: await embed("CourierPrime-Regular"), bold: await embed("CourierPrime-Bold"),
    italic: await embed("CourierPrime-Italic"), boldItalic: await embed("CourierPrime-BoldItalic"),
    fallback: await embed("NotoSansMono-Regular"), fallbackBold: await embed("NotoSansMono-Bold"),
  };
  if (options.title) pdf.setTitle(options.title);
  if (options.author) pdf.setAuthor(options.author);
  pdf.setCreator("Olukotan");
  const { widthIn, heightIn, topIn } = layout.geometry;
  const width = widthIn * POINT, height = heightIn * POINT;

  if (layout.titlePage) {
    const page = pdf.addPage([width, height]);
    layout.titlePage.lines.forEach((line) => drawLine(page, line, faces, height, topIn));
  }
  for (const body of layout.pages) {
    const page = pdf.addPage([width, height]);
    drawPage(page, body, layout, faces, options);
  }
  return pdf.save();
}

function drawPage(page: PDFPage, body: PageLayout, layout: Layout, faces: Faces, options: PdfRenderOptions) {
  const { heightIn, topIn } = layout.geometry;
  const height = heightIn * POINT;
  const headerY = height - 0.5 * POINT - 9;
  if (options.includePageNumbers) {
    const label = pageNumberLabel(body, options.settings);
    if (label) drawRuns(page, [{ text: label }], layout.geometry.rightIn * POINT - columnWidth(label) * CELL, headerY, faces);
  }
  if (options.header) drawRuns(page, [{ text: options.header }], 1.5 * POINT, headerY, faces);
  for (const line of body.lines) {
    drawLine(page, line, faces, height, topIn);
    const y = baseline(line.row, height, topIn);
    if (options.includeSceneNumbers && line.sceneNumber) {
      const position = options.settings.sceneNumbers.position;
      if (position !== "right") drawRuns(page, [{ text: line.sceneNumber }], 1.5 * POINT - (columnWidth(line.sceneNumber) + 3) * CELL, y, faces);
      if (position !== "left") drawRuns(page, [{ text: line.sceneNumber }], 7.5 * POINT + 3 * CELL, y, faces);
    }
    if (options.includeRevisionMarks && line.revisionMark) drawRuns(page, [{ text: line.revisionMark }], 7.5 * POINT + 7 * CELL, y, faces);
  }
}

const baseline = (row: number, pageHeight: number, topIn: number) => pageHeight - topIn * POINT - row * LINE - 9;

function drawLine(page: PDFPage, line: LayoutLine, faces: Faces, pageHeight: number, topIn: number) {
  const columns = line.runs.reduce((sum, run) => sum + columnWidth(run.text), 0);
  const anchor = line.x * POINT;
  const x = line.align === "right" ? anchor - columns * CELL : line.align === "center" ? anchor - (columns * CELL) / 2 : anchor;
  drawRuns(page, line.runs, x, baseline(line.row, pageHeight, topIn), faces);
}

function faceFor(run: TextRun, faces: Faces) {
  if (run.bold && run.italic) return faces.boldItalic;
  if (run.bold) return faces.bold;
  if (run.italic) return faces.italic;
  return faces.regular;
}

/** Draws styled runs cell by cell on a fixed 0.6 em grid, substituting fallback glyphs where needed. */
export function drawRuns(page: PDFPage, runs: TextRun[], startX: number, y: number, faces: Faces) {
  let column = 0;
  for (const run of runs) {
    const primary = faceFor(run, faces);
    const fallback = run.bold ? faces.fallbackBold : faces.fallback;
    const supported = new Set(primary.getCharacterSet());
    const runStart = column;
    let buffer = "", bufferStart = column, previousBase = "";
    const flush = () => { if (buffer) page.drawText(buffer, { x: startX + bufferStart * CELL, y, size: FONT_SIZE, font: primary }); buffer = ""; };
    for (const ch of run.text.normalize("NFC")) {
      const code = ch.codePointAt(0)!;
      if (/\p{M}/u.test(ch)) {
        // Combining mark: centre it over the previous cell.
        flush();
        const width = fallback.widthOfTextAtSize(ch, FONT_SIZE);
        const glyphCentre = markCentre(fallback, ch);
        const cellCentre = startX + (Math.max(column - 1, 0) + 0.5) * CELL;
        // Fonts lift marks over capitals via GPOS, which pdf-lib does not apply; raise them by the cap/x-height gap.
        const lift = /\p{Lu}/u.test(previousBase) ? FONT_SIZE * 0.2 : 0;
        page.drawText(ch, { x: cellCentre - glyphCentre - width / 2 + width / 2, y: y + lift, size: FONT_SIZE, font: fallback });
        bufferStart = column; continue;
      }
      previousBase = ch;
      if (supported.has(code)) { if (!buffer) bufferStart = column; buffer += ch; column++; continue; }
      flush();
      page.drawText(fallback.getCharacterSet().includes(code) ? ch : "?", { x: startX + column * CELL, y, size: FONT_SIZE, font: fallback });
      column++; bufferStart = column;
    }
    flush();
    if (run.underline && column > runStart) page.drawLine({ start: { x: startX + runStart * CELL, y: y - 1.5 }, end: { x: startX + column * CELL, y: y - 1.5 }, thickness: 0.6, color: rgb(0, 0, 0) });
  }
}

const markCache = new Map<string, number>();
function markCentre(font: PDFFont, ch: string) {
  const key = `${font.name}:${ch}`;
  const cached = markCache.get(key); if (cached !== undefined) return cached;
  // pdf-lib exposes the fontkit font on custom embeds; fall back to a centred guess.
  const embedder = (font as unknown as { embedder?: { font?: { glyphForCodePoint(code: number): { bbox: { minX: number; maxX: number } }; unitsPerEm: number } } }).embedder;
  let centre = 0;
  const fk = embedder?.font;
  if (fk) { const bbox = fk.glyphForCodePoint(ch.codePointAt(0)!).bbox; centre = ((bbox.minX + bbox.maxX) / 2 / fk.unitsPerEm) * FONT_SIZE; }
  markCache.set(key, centre); return centre;
}
