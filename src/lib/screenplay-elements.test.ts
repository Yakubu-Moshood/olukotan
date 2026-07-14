
import { describe, expect, it } from "vitest";
import {
  applyEnter, applyTab, collectKnownCharacters, createElement, detectElementType,
  getNextElementType, isLikelyCharacter, normalizeElementText, parseCharacter,
  parseFountain, serializeFountain, updateElementText,
  type ScreenplayElementType,
} from "./screenplay-elements";

describe("screenplay transition engine", () => {
  const next = (currentType: ScreenplayElementType, currentText = "") => getNextElementType({
    currentType, currentText, knownCharacters: [], cursorPosition: currentText.length, isElementEmpty: !currentText,
  });

  it.each([
    ["scene-heading", "INT. OFFICE - DAY", "action"],
    ["character", "DANIEL", "dialogue"],
    ["parenthetical", "(quietly)", "dialogue"],
    ["transition", "CUT TO:", "scene-heading"],
    ["shot", "CLOSE ON:", "action"],
    ["action", "", "character"],
    ["character", "", "action"],
    ["dialogue", "", "action"],
  ] as const)("%s plus Enter becomes %s", (type, text, expected) => expect(next(type, text)).toBe(expected));

  it("uses the deliberate Action â†’ Character â†’ Scene Heading â†’ Transition â†’ Shot cycle", () => {
    let elements = [createElement("action")];
    for (const expected of ["character", "scene-heading", "transition", "shot", "action"] as const) {
      const result = applyTab(elements, 0); elements = result.elements; expect(elements[0].type).toBe(expected);
    }
    expect(applyTab(elements, 0, true).elements[0].type).toBe("shot");
  });
});

describe("screenplay content detection", () => {
  it.each([
    ["int. office - day", "scene-heading"],
    ["EXT. ROAD - NIGHT", "scene-heading"],
    ["CUT TO:", "transition"],
    ["The BBC report continues.", "action"],
    ["He sees the RED FILE.", "action"],
  ] as const)("detects %s as %s", (text, expected) => expect(detectElementType(text, { afterAction: true })).toBe(expected));

  it("recognises known characters and extensions without treating action as character", () => {
    expect(detectElementType("DANIEL", { afterAction: true, knownCharacters: ["DANIEL"] })).toBe("character");
    expect(parseCharacter("DANIEL (V.O.)")).toEqual({ name: "DANIEL", extension: "V.O." });
    expect(isLikelyCharacter("A sign reads NO ENTRY.", ["DANIEL"])).toBe(false);
  });
});

describe("element-aware casing", () => {
  it.each([
    ["character", "daniel", "DANIEL"],
    ["scene-heading", "int. office - day", "INT. OFFICE - DAY"],
    ["parenthetical", "quietly", "(quietly)"],
    ["dialogue", "Not tonight.", "Not tonight."],
  ] as const)("normalises %s", (type, input, expected) => expect(normalizeElementText(type, input)).toBe(expected));

  it("preserves Yoruba diacritics while uppercasing underlying text", () => {
    expect(normalizeElementText("character", "á¹¢áº¹Ìgun")).toBe("á¹¢áº¸ÌGUN");
    expect(normalizeElementText("character", "Ã€dÃ¹nnÃ¬")).toBe("Ã€DÃ™NNÃŒ");
    expect(normalizeElementText("character", "OlÃºwatÃ³bilá»Ìba")).toBe("OLÃšWATÃ“BILá»ŒÌBA");
  });
});

describe("required keyboard writing flows", () => {
  it("opens a scene and moves naturally into action", () => {
    let elements = [createElement("scene-heading")];
    elements = updateElementText(elements, 0, "int. reception centre - night").elements;
    expect(elements[0].text).toBe("INT. RECEPTION CENTRE - NIGHT");
    const entered = applyEnter(elements, 0, elements[0].text.length);
    expect(entered.elements[1].type).toBe("action");
  });

  it("moves from action to dialogue without a mouse", () => {
    let elements = [createElement("action", "Daniel stands over the locked drawer.")];
    let result = applyEnter(elements, 0, elements[0].text.length); elements = result.elements;
    expect(elements[1].type).toBe("action");
    result = applyTab(elements, 1); elements = result.elements;
    elements = updateElementText(elements, 1, "daniel", true).elements;
    expect(elements[1]).toMatchObject({ type: "character", text: "DANIEL" });
    result = applyEnter(elements, 1, elements[1].text.length);
    expect(result.elements[2].type).toBe("dialogue");
  });

  it("converts an opening parenthesis under a character and returns to dialogue", () => {
    let elements = [createElement("character", "DANIEL"), createElement("dialogue")];
    elements = updateElementText(elements, 1, "(").elements;
    expect(elements[1]).toMatchObject({ type: "parenthetical", text: "()" });
    elements = updateElementText(elements, 1, "(quietly)").elements;
    const result = applyEnter(elements, 1, elements[1].text.length);
    expect(result.elements[2].type).toBe("dialogue");
    const unused = applyEnter([createElement("character", "DANIEL"), createElement("parenthetical", "()")], 1, 1);
    expect(unused.elements[1].type).toBe("dialogue");
  });

  it("supports rapid alternating speakers and consecutive action paragraphs", () => {
    let elements = [createElement("character", "DANIEL"), createElement("dialogue", "Not tonight.")];
    let result = applyEnter(elements, 1, elements[1].text.length); elements = result.elements;
    expect(elements[2].type).toBe("action");
    elements = applyTab(elements, 2).elements;
    elements = updateElementText(elements, 2, "oliver", true).elements;
    expect(elements[2]).toMatchObject({ type: "character", text: "OLIVER" });
    expect(applyEnter(elements, 2, elements[2].text.length).elements[3].type).toBe("dialogue");

    elements = [createElement("action", "One action paragraph.")];
    result = applyEnter(elements, 0, elements[0].text.length); elements = result.elements;
    elements = updateElementText(elements, 1, "Another normal sentence.").elements;
    expect(elements[1].type).toBe("action");
  });

  it("collects character names for autocomplete", () => {
    const characters = collectKnownCharacters([createElement("character", "DANIEL"), createElement("character", "OLIVER")]);
    expect(characters.filter((name) => name.startsWith("DAN"))).toEqual(["DANIEL"]);
  });
});

describe("Action typing and character commit points", () => {
  it.each(["I", "IN", "INT", "E", "EX", "EXT"])('keeps partial scene prefix "%s" as Action', (text) => {
    expect(updateElementText([createElement("action")], 0, text).elements[0]).toMatchObject({ type: "action", text });
  });

  it.each(["int.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E.", "EST."])("converts committed scene prefix %s immediately", (text) => {
    expect(updateElementText([createElement("action")], 0, text).elements[0]).toMatchObject({ type: "scene-heading", text: text.toUpperCase() });
  });

  it("converts a pasted full heading but not ordinary action", () => {
    expect(updateElementText([createElement("action")], 0, "ext. market - night").elements[0]).toMatchObject({ type: "scene-heading", text: "EXT. MARKET - NIGHT" });
    expect(updateElementText([createElement("action")], 0, "Inside the market, traders shout.").elements[0].type).toBe("action");
  });

  it("keeps every partial known-character match as Action while typing", () => {
    let elements = [createElement("character", "DEJI"), createElement("dialogue", "I am leaving."), createElement("action")];
    for (const text of ["D", "De", "Dej", "Deji"]) {
      elements = updateElementText(elements, 2, text).elements;
      expect(elements[2]).toMatchObject({ type: "action", text });
    }
  });

  it("keeps a complete sentence beginning with the previous speaker as Action", () => {
    let elements = [createElement("character", "DEJI"), createElement("dialogue", "I am leaving."), createElement("action")];
    for (const text of ["Deji", "Deji ", "Deji walks", "Deji walks away."]) {
      elements = updateElementText(elements, 2, text).elements;
      expect(elements[2]).toMatchObject({ type: "action", text });
    }
  });

  it("converts an exact known name only when Enter commits the Action line", () => {
    const elements = [createElement("character", "DEJI"), createElement("dialogue", "I am leaving."), createElement("action", "Deji")];
    expect(elements[2].type).toBe("action");
    const committed = applyEnter(elements, 2, elements[2].text.length);
    expect(committed.elements[2]).toMatchObject({ type: "character", text: "DEJI" });
    expect(committed.elements[3].type).toBe("dialogue");
  });

  it("does not infer an unknown uppercase Action as a character cue on Enter", () => {
    const elements = [createElement("action", "A STRANGE SIGN")];
    const committed = applyEnter(elements, 0, elements[0].text.length);
    expect(committed.elements[0]).toMatchObject({ type: "action", text: "A STRANGE SIGN" });
    expect(committed.elements[1].type).toBe("action");
  });
});

describe("structured Fountain round trip", () => {
  it("preserves element types and text across save and reopen", () => {
    const original = {
      preamble: "Title: Ã€dÃ¹nnÃ¬\nAuthor: á¹¢áº¹Ìgun",
      elements: [
        createElement("scene-heading", "int. reception centre - night", { sceneNumber: "12" }),
        createElement("action", "Daniel stands over the locked drawer."),
        createElement("character", "daniel (v.o.)"),
        createElement("parenthetical", "quietly"),
        createElement("dialogue", "Not tonight."),
        createElement("transition", "cut to:"),
        createElement("shot", "close on:"),
        createElement("general", "A private production note."),
      ],
    };
    const reopened = parseFountain(serializeFountain(original));
    expect(reopened.preamble).toBe(original.preamble);
    expect(reopened.elements.map(({ type, text }) => ({ type, text }))).toEqual(original.elements.map(({ type, text }) => ({ type, text })));
  });

  it("forces uppercase action lines to remain action", () => {
    const fountain = serializeFountain({ preamble: "", elements: [createElement("action", "NO ENTRY")] });
    expect(fountain).toContain("!NO ENTRY");
    expect(parseFountain(fountain).elements[0]).toMatchObject({ type: "action", text: "NO ENTRY" });
  });
});

