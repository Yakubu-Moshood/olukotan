import type NSpell from "nspell";
import { visibleText } from "./rich-text";
import type { ScreenplayElement } from "./screenplay-elements";

/** Tools → Spelling: British English (en-GB) Hunspell dictionary, loaded on first use. */
let checker: Promise<NSpell> | undefined;

export function loadSpellChecker(loadFiles?: () => Promise<{ aff: string; dic: string }>): Promise<NSpell> {
  if (!checker) checker = (async () => {
    const { default: nspell } = await import("nspell");
    const files = loadFiles ? await loadFiles() : await (async () => {
      // Bundled with the app (public/dict), so spelling works offline.
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";
      const [aff, dic] = await Promise.all([fetch(`${base}dict/en-GB.aff`).then((r) => r.text()), fetch(`${base}dict/en-GB.dic`).then((r) => r.text())]);
      return { aff, dic };
    })();
    return nspell(files.aff, files.dic);
  })();
  return checker;
}

export interface Misspelling { index: number; start: number; end: number; word: string }

const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;

/** Every misspelt word, skipping words in the custom dictionary, character names and words with non-English letters. */
export function findMisspellings(spell: NSpell, elements: ScreenplayElement[], custom: Set<string>): Misspelling[] {
  const out: Misspelling[] = [];
  elements.forEach((element, index) => {
    if (element.type === "page-break") return;
    const text = visibleText(element.text);
    for (const match of text.matchAll(WORD)) {
      const word = match[0].replace(/['’-]+$/u, "");
      if (word.length < 2 || custom.has(word.toLocaleLowerCase("en-GB"))) continue;
      // Yoruba and other words with letters outside basic Latin aren't judged by an English dictionary.
      if (/[^\p{Script=Latin}'’-]|[ẹọṣẸỌṢ̀-ͯ]/u.test(word.normalize("NFD")) && /[̀-ͯẹọṣẸỌṢ]/u.test(word.normalize("NFD"))) continue;
      const plain = word.replace(/’/gu, "'");
      if (spell.correct(plain) || spell.correct(plain.toLocaleLowerCase("en-GB"))) continue;
      out.push({ index, start: match.index!, end: match.index! + word.length, word });
    }
  });
  return out;
}
