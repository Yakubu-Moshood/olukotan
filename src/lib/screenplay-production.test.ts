import { describe, expect, it } from "vitest";
import { defaultProjectData, migrateProjectData } from "../types";
import { createElement, parseFountain, serializeFountain } from "./screenplay-elements";
import { automaticContinued, autocompleteSuggestions, getAutocompleteContext, synchroniseSceneMetadata } from "./screenplay-production";

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
