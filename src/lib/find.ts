import { replaceRange, visibleText } from "./rich-text";
import type { ScreenplayElement, ScreenplayElementType } from "./screenplay-elements";

/** Find and replace across the script, on visible text (formatting markers are never matched or broken). */
export interface FindOptions { query: string; matchCase: boolean; wholeWord: boolean; types?: ScreenplayElementType[] }
export interface Match { index: number; start: number; end: number }

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export function findAll(elements: ScreenplayElement[], options: FindOptions): Match[] {
  if (!options.query) return [];
  const source = escapeRegExp(options.query);
  const pattern = new RegExp(options.wholeWord ? `(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])` : source, `gu${options.matchCase ? "" : "i"}`);
  const matches: Match[] = [];
  elements.forEach((element, index) => {
    if (element.type === "page-break" || (options.types?.length && !options.types.includes(element.type))) return;
    for (const match of visibleText(element.text).matchAll(pattern)) matches.push({ index, start: match.index!, end: match.index! + match[0].length });
  });
  return matches;
}

/** The next match after (or before) a caret position, wrapping around. */
export function nextMatch(matches: Match[], from: { index: number; offset: number }, backwards = false): Match | undefined {
  if (!matches.length) return undefined;
  if (backwards) return [...matches].reverse().find((m) => m.index < from.index || (m.index === from.index && m.start < from.offset)) ?? matches[matches.length - 1];
  return matches.find((m) => m.index > from.index || (m.index === from.index && m.start >= from.offset)) ?? matches[0];
}

export function replaceMatch(elements: ScreenplayElement[], match: Match, replacement: string): ScreenplayElement[] {
  return elements.map((element, index) => index === match.index ? { ...element, text: replaceRange(element.text, match.start, match.end, replacement) } : element);
}

export function replaceAll(elements: ScreenplayElement[], options: FindOptions, replacement: string): { elements: ScreenplayElement[]; count: number } {
  const matches = findAll(elements, options);
  let next = elements;
  // Replace from the end so earlier offsets stay valid.
  for (const match of [...matches].reverse()) next = replaceMatch(next, match, replacement);
  return { elements: next, count: matches.length };
}
