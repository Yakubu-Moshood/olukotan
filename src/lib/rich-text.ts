import { styledChars, type StyledChar } from "./pagination";

/**
 * Formatted text helpers.
 *
 * Element text is stored as Fountain with emphasis markers (**bold**, *italic*,
 * _underline_) so files stay readable in any text editor and every exporter
 * keeps working. The editor shows and edits *visible* text; these helpers
 * translate between the two. All offsets here are visible-text offsets in
 * UTF-16 code units, matching DOM selection offsets.
 */

export type Style = "bold" | "italic" | "underline";
export type StyleSet = { bold: boolean; italic: boolean; underline: boolean };
const PLAIN: StyleSet = { bold: false, italic: false, underline: false };

export const charsOf = (text: string): StyledChar[] => styledChars(text);
export const visibleText = (text: string) => charsOf(text).map((c) => c.ch).join("");
export const visibleLength = (text: string) => charsOf(text).length;

const escape = (value: string) => value.replace(/([*_\\])/gu, "\\$1");

/** Serialises styled characters back to Fountain emphasis markers. */
export function toFountain(chars: StyledChar[]): string {
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const first = chars[i];
    let j = i + 1;
    while (j < chars.length && chars[j].bold === first.bold && chars[j].italic === first.italic && chars[j].underline === first.underline) j++;
    const text = escape(chars.slice(i, j).map((c) => c.ch).join(""));
    const styled = first.bold || first.italic || first.underline;
    const lead = text.match(/^\s*/u)![0], trail = text.slice(lead.length).match(/\s*$/u)![0];
    let core = text.slice(lead.length, text.length - trail.length);
    if (styled && core) {
      if (first.underline) core = `_${core}_`;
      if (first.bold && first.italic) core = `***${core}***`;
      else if (first.bold) core = `**${core}**`;
      else if (first.italic) core = `*${core}*`;
    }
    out += lead + core + trail;
    i = j;
  }
  return out;
}

/** Re-serialises text in canonical form (useful to compare two strings). */
export const canonical = (text: string) => toFountain(charsOf(text));

export function splitFormatted(text: string, offset: number): [string, string] {
  const chars = charsOf(text);
  const at = Math.max(0, Math.min(offset, chars.length));
  return [toFountain(chars.slice(0, at)), toFountain(chars.slice(at))];
}

/** Replaces the visible range [start, end) with `insert`, styled as given (default: style of the preceding character). */
export function replaceRange(text: string, start: number, end: number, insert: string, style?: StyleSet): string {
  const chars = charsOf(text);
  const base = style ?? styleAt(chars, start);
  const added = insert.split("").map((unit) => ({ ch: unit, ...base }));
  return toFountain([...chars.slice(0, start), ...added, ...chars.slice(end)]);
}

function styleAt(chars: StyledChar[], offset: number): StyleSet {
  const c = chars[offset - 1] ?? chars[offset];
  return c ? { bold: c.bold, italic: c.italic, underline: c.underline } : { ...PLAIN };
}

export function stylesInRange(text: string, start: number, end: number): StyleSet {
  const chars = charsOf(text);
  if (start === end) return styleAt(chars, start);
  const slice = chars.slice(start, end);
  return { bold: slice.every((c) => c.bold), italic: slice.every((c) => c.italic), underline: slice.every((c) => c.underline) };
}

/** Toggles a style over a range: removes it if the whole range has it, otherwise applies it. */
export function toggleStyle(text: string, start: number, end: number, style: Style): string {
  const chars = charsOf(text);
  const slice = chars.slice(start, end);
  if (!slice.length) return text;
  const on = !slice.every((c) => c[style]);
  return toFountain(chars.map((c, i) => (i >= start && i < end ? { ...c, [style]: on } : c)));
}

/** Applies a style set to a range (used for typing after Ctrl+B with nothing selected). */
export function applyStyle(text: string, start: number, end: number, style: StyleSet): string {
  const chars = charsOf(text);
  return toFountain(chars.map((c, i) => (i >= start && i < end ? { ...c, ...style } : c)));
}

/**
 * Standard-writing capitalisation, applied as the writer types:
 * the first letter of an element or of a new sentence, and a lone "i".
 * Returns the new text, or the input unchanged.
 */
export function autoCapitalise(previous: string, next: string, cursor: number): string {
  const before = visibleText(previous), after = visibleText(next);
  if (after.length !== before.length + 1 || cursor < 1) return next;
  const typed = after[cursor - 1];
  if (after.slice(0, cursor - 1) !== before.slice(0, cursor - 1)) return next;
  const chars = charsOf(next);
  // Sentence start: beginning of the element, or after . ! ? (optionally closing quote/bracket) and a space.
  if (/\p{Ll}/u.test(typed)) {
    const lead = after.slice(0, cursor - 1);
    if (/^\s*["'“‘(]*$/u.test(lead) || /[.!?…]["'”’)]*\s+["'“‘(]*$/u.test(lead)) {
      chars[cursor - 1] = { ...chars[cursor - 1], ch: typed.toLocaleUpperCase("en-GB") };
      return toFountain(chars);
    }
  }
  // Lone "i" becomes "I" once the word ends (space or punctuation typed after it).
  if (/[\s.,!?;:'’]/u.test(typed) && cursor >= 2 && after[cursor - 2] === "i" && (cursor === 2 || /[\s"“(]/u.test(after[cursor - 3]))) {
    chars[cursor - 2] = { ...chars[cursor - 2], ch: "I" };
    return toFountain(chars);
  }
  return next;
}
