import { visibleText } from "./rich-text";
import { isSceneHeading, parseCharacter, type ScreenplayElement } from "./screenplay-elements";

/** Tools → Format Assistant: finds common formatting problems, with an automatic fix where one is safe. */
export interface FormatIssue { index: number; message: string; fix?: (elements: ScreenplayElement[]) => ScreenplayElement[] }

export function checkFormat(elements: ScreenplayElement[]): FormatIssue[] {
  const issues: FormatIssue[] = [];
  const removeAt = (index: number) => (list: ScreenplayElement[]) => list.filter((_, i) => i !== index);
  elements.forEach((element, index) => {
    const text = visibleText(element.text).trim();
    const next = elements[index + 1], previous = elements[index - 1];
    if (element.type === "page-break") return;
    if (!text && index !== elements.length - 1) { issues.push({ index, message: "Empty paragraph.", fix: removeAt(index) }); return; }
    if (element.type === "character") {
      if (!next || !["dialogue", "parenthetical"].includes(next.type)) issues.push({ index, message: `Character “${text}” has no dialogue after it.` });
      if (/[.,:;!?]$/u.test(parseCharacter(text).name)) issues.push({ index, message: `Character name “${text}” ends with punctuation.`, fix: (list) => list.map((e, i) => i === index ? { ...e, text: e.text.replace(/([^)\s])[.,:;!?]+(\s|\(|$)/u, "$1$2").trim() } : e) });
    }
    if (element.type === "parenthetical" && (!previous || !["character", "dialogue", "parenthetical"].includes(previous.type))) issues.push({ index, message: "Parenthetical outside a speech." });
    if (element.type === "parenthetical" && next?.type !== "dialogue" && next?.type !== "parenthetical") issues.push({ index, message: "A speech shouldn't end on a parenthetical." });
    if (element.type === "dialogue" && (!previous || !["character", "dialogue", "parenthetical"].includes(previous.type))) issues.push({ index, message: "Dialogue without a character cue." });
    if (element.type === "scene-heading") {
      if (!isSceneHeading(text)) issues.push({ index, message: `Scene heading “${text}” doesn't start with INT. or EXT.` });
      else if (!/\s-\s+\S/u.test(text)) issues.push({ index, message: `Scene heading “${text}” has no time of day (e.g. - DAY).` });
      if (next?.type === "scene-heading") issues.push({ index, message: "Scene heading with no action or dialogue before the next scene." });
    }
    if (element.type === "transition" && next && next.type !== "scene-heading" && next.type !== "page-break") issues.push({ index, message: `Transition “${text}” isn't followed by a scene heading.` });
    if (element.type === "action" && text.length > 420) issues.push({ index, message: "Very long action paragraph (over about 6 lines). Consider breaking it up." });
    if (element.type === "action" && text === text.toLocaleUpperCase("en-GB") && /^\p{Lu}[\p{Lu}\s'.-]{1,30}$/u.test(text) && next?.type === "action")
      issues.push({ index, message: `“${text}” looks like a character cue typed as Action.`, fix: (list) => list.map((e, i) => i === index ? { ...e, type: "character" } : i === index + 1 ? { ...e, type: "dialogue" } : e) });
  });
  return issues;
}
