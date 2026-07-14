import { describe, expect, it } from "vitest";
import { defaultProjectData, migrateProjectData } from "../types";
import { createElement, parseFountain, serializeFountain } from "./screenplay-elements";
import { automaticContinued, autocompleteSuggestions, getAutocompleteContext, removeSceneNumbers, renderedCharacterCue, synchroniseSceneMetadata } from "./screenplay-production";

describe("production scene metadata", () => {
  it("assigns automatic numbers in script order and renumbers after a move", () => {
    const first = synchroniseSceneMetadata({ preamble: "", elements: [
      createElement("scene-heading", "INT. A - DAY"),
      createElement("scene-heading", "INT. B - DAY"),
      createElement("scene-heading", "INT. C - DAY"),
    ] }, defaultProjectData());
    expect(first.projectData.scenes.map((scene) => scene.number)).toEqual(["1", "2", "3"]);

    const [a, b, c] = first.document.elements;
    const moved = synchroniseSceneMetadata({ ...first.document, elements: [a, c, b] }, first.projectData);
    expect(moved.document.elements.map((element) => element.metadata?.sceneNumber)).toEqual(["1", "2", "3"]);
    expect(moved.document.elements.map((element) => element.metadata?.sceneId)).toEqual([
      a.metadata?.sceneId, c.metadata?.sceneId, b.metadata?.sceneId,
    ]);
  });

  it("preserves stable scene IDs through Fountain save and reopen", () => {
    const prepared = synchroniseSceneMetadata({ preamble: "", elements: [createElement("scene-heading", "EXT. ROAD - NIGHT")] }, defaultProjectData());
    const sceneId = prepared.document.elements[0].metadata?.sceneId;
    const reopened = parseFountain(serializeFountain(prepared.document));
    expect(reopened.elements[0].metadata?.sceneId).toBe(sceneId);
    expect(reopened.elements[0].text).toBe("EXT. ROAD - NIGHT");
  });

  it("migrates older projects to complete per-project settings", () => {
    const migrated = migrateProjectData({ screenplaySettings: { sceneNumbers: { enabled: true } } as never });
    expect(migrated.screenplaySettings.sceneNumbers).toMatchObject({ enabled: true, mode: "automatic", position: "both" });
    expect(migrated.screenplaySettings.pageNumbers.position).toBe("top-right");
    expect(migrated.screenplaySettings.continueds.character).toBe("automatic");
  });

  it("preserves locked numbers and gives an inserted scene a suffix", () => {
    const numbered = synchroniseSceneMetadata({ preamble: "", elements: [createElement("scene-heading", "INT. A - DAY"), createElement("scene-heading", "INT. B - DAY")] }, defaultProjectData());
    const lockedData = { ...numbered.projectData, screenplaySettings: { ...numbered.projectData.screenplaySettings, sceneNumbers: { ...numbered.projectData.screenplaySettings.sceneNumbers, mode: "locked" as const } }, scenes: numbered.projectData.scenes.map((scene) => ({ ...scene, locked: true, numberingMode: "locked" as const })) };
    const inserted = synchroniseSceneMetadata({ ...numbered.document, elements: [numbered.document.elements[0], createElement("scene-heading", "INT. INSERT - DAY"), numbered.document.elements[1]] }, lockedData);
    expect(inserted.document.elements.map((element) => element.metadata?.sceneNumber)).toEqual(["1", "1A", "2"]);
  });

  it("removes number metadata without altering scene headings", () => {
    const numbered = synchroniseSceneMetadata({ preamble: "", elements: [createElement("scene-heading", "EXT. ROAD - NIGHT")] }, defaultProjectData());
    const removed = removeSceneNumbers(numbered.document, numbered.projectData);
    expect(removed.document.elements[0]).toMatchObject({ type: "scene-heading", text: "EXT. ROAD - NIGHT" });
    expect(removed.document.elements[0].metadata?.sceneNumber).toBeUndefined();
    expect(removed.projectData.screenplaySettings.sceneNumbers.enabled).toBe(false);
    expect(removed.projectData.productionSnapshots.at(-1)).toMatchObject({ reason: "Before removing scene numbers" });
  });
});

describe("metadata-aware character continueds", () => {
  it("adds CONT'D after action interruption by the same speaker", () => {
    const elements = [
      createElement("character", "DEJI"), createElement("dialogue", "First dialogue."),
      createElement("action", "Kunle ignores the call."), createElement("character", "DEJI"),
    ];
    expect(automaticContinued(elements, 3, defaultProjectData().screenplaySettings)).toBe(true);
    expect(elements[3].text).toBe("DEJI");
  });

  it("does not add CONT'D when another character spoke", () => {
    const elements = [
      createElement("character", "DEJI"), createElement("dialogue", "First dialogue."),
      createElement("character", "KUNLE"), createElement("dialogue", "Response."), createElement("character", "DEJI"),
    ];
    expect(automaticContinued(elements, 4, defaultProjectData().screenplaySettings)).toBe(false);
  });

  it("renders authored extensions and automatic CONT'D as one cue without duplicates", () => {
    const elements = [
      createElement("character", "DEJI (V.O.)"), createElement("dialogue", "First."),
      createElement("action", "A door slams."), createElement("character", "DEJI (V.O.)"),
    ];
    expect(renderedCharacterCue(elements, 3, defaultProjectData().screenplaySettings)).toBe("DEJI (V.O.) (CONT'D)");
    elements[3] = createElement("character", "DEJI (V.O.) (CONT'D)");
    expect(renderedCharacterCue(elements, 3, defaultProjectData().screenplaySettings)).toBe("DEJI (V.O.) (CONT'D)");
  });
});

describe("context-aware autocomplete", () => {
  it.each(["", "D", "Deji", "Deji walks away."])("keeps Action autocomplete closed for %j", (text) => {
    const element = createElement("action", text);
    expect(getAutocompleteContext(element)).toBe("none");
    expect(autocompleteSuggestions(element, ["DEJI"], ["INT.", "EXT."])).toEqual([]);
  });

  it.each(["dialogue", "parenthetical", "general"] as const)("keeps %s autocomplete closed", (type) => {
    expect(getAutocompleteContext(createElement(type, "D"))).toBe("none");
  });

  it("filters known names only in Character mode", () => {
    const result = autocompleteSuggestions(createElement("character", "E"), ["DEJI", "EMEKA", "EMMANUEL", "ESTHER"], ["INT.", "EXT."]);
    expect(result.map((item) => item.value)).toEqual(["EMEKA", "EMMANUEL", "ESTHER"]);
    expect(result.every((item) => item.category === "Characters")).toBe(true);
    expect(autocompleteSuggestions(createElement("character", "EM"), ["EMEKA", "EMMANUEL", "ESTHER"], ["INT."])
      .map((item) => item.value)).toEqual(["EMEKA", "EMMANUEL"]);
  });

  it("offers professional extensions only after an unmatched opening parenthesis", () => {
    expect(getAutocompleteContext(createElement("character", "TOBIAS ("))).toBe("character-extension");
    expect(autocompleteSuggestions(createElement("character", "TOBIAS (V"), [], []).map((item) => item.value)).toEqual(["V.O.", "VOICE OVER"]);
    expect(autocompleteSuggestions(createElement("character", "TOBIAS (O"), [], []).map((item) => item.value)).toEqual(["O.S.", "OFF SCREEN"]);
    expect(getAutocompleteContext(createElement("character", "TOBIAS (V.O.)"))).toBe("character-name");
  });

  it("filters prefixes only in Scene Heading prefix context", () => {
    const element = createElement("scene-heading", "I");
    const result = autocompleteSuggestions(element, ["DEJI"], ["INT.", "INT./EXT.", "I/E.", "EXT."]);
    expect(getAutocompleteContext(element)).toBe("scene-prefix");
    expect(result.map((item) => item.value)).toEqual(["INT.", "INT./EXT.", "I/E."]);
    expect(result.every((item) => item.category === "Scene Headings")).toBe(true);
  });

  it("moves a complete Scene Heading prefix into location context and a dash into time context", () => {
    expect(getAutocompleteContext(createElement("scene-heading", "EXT."))).toBe("scene-location");
    expect(getAutocompleteContext(createElement("scene-heading", "INT. OFFICE -"))).toBe("scene-time");
  });
});
