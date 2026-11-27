import { linesToDocument, type LayoutImportResult, type SourceLine } from "./layout-import";

/**
 * PDF screenplay import: reads the text layer and its positions, rebuilds
 * lines, then classifies them by indentation. Works for any script exported
 * as PDF from a screenwriting app or word processor. Scanned pages (images)
 * have no text layer and need OCR, which is reported instead of guessed.
 */

interface TextItem { str: string; transform: number[]; width: number; hasEOL?: boolean }
// The legacy build carries polyfills, so older WebView2/Safari versions can read PDFs too.
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let loader: Promise<PdfJs> | undefined;
async function pdfjs(): Promise<PdfJs> {
  if (!loader) loader = (async () => {
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      lib.GlobalWorkerOptions.workerSrc = worker.default;
    }
    return lib;
  })();
  return loader;
}

export interface PositionedLine { page: number; y: number; x: number; right: number; text: string }

/** Groups positioned text items into lines (pure; exported for tests). */
export function itemsToLines(items: TextItem[], pageHeight: number, page: number): PositionedLine[] {
  const pieces = items.filter((item) => item.str.length).map((item) => ({ str: item.str, x: item.transform[4], y: pageHeight - item.transform[5], w: item.width }));
  pieces.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: (typeof pieces)[] = [];
  for (const piece of pieces) {
    // Same baseline within 4 pt (diacritics raised over capitals sit slightly higher).
    const row = rows.find((candidate) => Math.abs(candidate[0].y - piece.y) <= 4);
    if (row) row.push(piece); else rows.push([piece]);
  }
  const lines: PositionedLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    // Split a row into separate segments where there's a big horizontal gap (e.g. margin scene numbers).
    let segment: typeof row = [];
    const flush = () => {
      const words = segment.filter((piece) => piece.str.trim());
      if (!words.length) { segment = []; return; }
      let text = "", end = words[0].x;
      for (const piece of segment) {
        if (!piece.str.trim()) continue;
        const gap = piece.x - end;
        if (text && gap > 2.5 && !/\p{M}/u.test(piece.str[0])) text += " ".repeat(Math.max(1, Math.round(gap / 7.2)));
        text += piece.str; end = Math.max(end, piece.x + piece.w);
      }
      lines.push({ page, y: words[0].y / 72, x: words[0].x / 72, right: end / 72, text: text.normalize("NFC").replace(/\s{2,}/gu, " ").trim() });
      segment = [];
    };
    let last: (typeof row)[number] | undefined;
    for (const piece of row) {
      const gap = last ? piece.x - (last.x + last.w) : 0;
      // Margin scene numbers ("12", "12A") stand apart from the heading by a few character widths.
      const afterSceneNumber = last && /^\d+[A-Z]{0,2}\.?$/u.test(segment.map((p) => p.str).join("").trim()) && gap > 10;
      if (last && piece.str.trim() && (gap > 72 * 0.9 || afterSceneNumber)) flush();
      segment.push(piece); if (piece.str.trim()) last = piece;
    }
    flush();
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

export async function parsePdf(bytes: Uint8Array): Promise<LayoutImportResult & { titlePage?: string[] }> {
  const lib = await pdfjs();
  let document;
  try { document = await lib.getDocument({ data: bytes, useSystemFonts: false }).promise; }
  catch (reason) {
    const message = String(reason);
    if (/password/iu.test(message)) throw new Error("This PDF is password-protected. Remove the password and try again. Nothing was imported.");
    throw new Error("This PDF could not be read. It may be damaged. Nothing was imported.");
  }
  const all: PositionedLine[] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    all.push(...itemsToLines(content.items as TextItem[], viewport.height, number));
  }
  if (!all.length) throw new Error("This PDF has no text layer — it looks like scanned images. Olukotan can't read scanned pages yet (that needs OCR). Nothing was imported.");
  // A title page: the first page with no scene heading and only a few, mostly centred lines.
  const firstPage = all.filter((line) => line.page === 1);
  const hasHeading = firstPage.some((line) => /^\s*(?:\d+[A-Z]?\s+)?(?:INT|EXT|I\/E|EST)[./\s]/iu.test(line.text));
  const titlePage = !hasHeading && document.numPages > 1 && firstPage.length <= 25 ? firstPage.map((line) => line.text) : undefined;
  const body = titlePage ? all.filter((line) => line.page !== 1) : all;
  // Drop margin scene numbers that stand alone on a heading's row.
  const lines: SourceLine[] = body.filter((line) => !(/^\d+[A-Z]{0,2}\.?$/u.test(line.text) && body.some((other) => other !== line && other.page === line.page && Math.abs(other.y - line.y) < 0.05 && /^(?:\d+[A-Z]{0,2}\.?\s+)?(?:INT|EXT|I\/E|EST)/iu.test(other.text))))
    .map((line) => ({ text: line.text.replace(/([*_\\])/gu, "\\$1"), x: line.x, right: line.right, y: line.y, page: line.page }));
  const gaps = lines.slice(1).map((line, i) => line.page === lines[i].page ? (line.y ?? 0) - (lines[i].y ?? 0) : 0).filter((gap) => gap > 0.05).sort((a, b) => a - b);
  const lineHeight = gaps[Math.floor(gaps.length * 0.25)] ?? 1 / 6;
  const result = linesToDocument(lines, { mergeWrappedLines: true, lineHeight });
  return { ...result, titlePage, warnings: [...result.warnings, "Bold, italic and underline aren't read from PDFs; check emphasis after importing."] };
}
