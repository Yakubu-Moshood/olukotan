import { describe, expect, it } from "vitest";
import { defaultProjectData } from "../types";
import { paginate } from "./pagination";
import { formatEighths, moveScene, sceneIndex } from "./scene-index";
import { parseFountain } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";

const script = "INT. A - DAY\n\nOne.\n\nADA\nHi.\n\nEXT. B - NIGHT\n\nTwo.\n\nINT. C - DAY\n\nThree.\n";
const prepared = () => synchroniseSceneMetadata(parseFountain(script), defaultProjectData());

describe("scene index", () => {
  it("formats eighths like a production board", () => {
    expect([1, 3, 8, 11, 16].map(formatEighths)).toEqual(["1/8", "3/8", "1", "1 3/8", "2"]);
  });
  it("lists scenes with numbers, pages, lengths and characters", () => {
    const { document, projectData } = prepared();
    const rows = sceneIndex(document, projectData, paginate(document, projectData));
    expect(rows.map((row) => [row.number, row.location, row.page, row.characters])).toEqual([["1", "A", "1", ["ADA"]], ["2", "B", "1", []], ["3", "C", "1", []]]);
    expect(rows.every((row) => row.eighths >= 1)).toBe(true);
  });
  it("moves whole scenes and renumbers them", () => {
    const { document, projectData } = prepared();
    const [a, , c] = sceneIndex(document, projectData);
    const moved = synchroniseSceneMetadata(moveScene(document, c.sceneId, a.sceneId), projectData);
    expect(moved.document.elements.filter((e) => e.type === "scene-heading").map((e) => e.text)).toEqual(["INT. C - DAY", "INT. A - DAY", "EXT. B - NIGHT"]);
    expect(moved.document.elements[1].text).toBe("Three.");
    const toEnd = moveScene(document, a.sceneId, null);
    expect(toEnd.elements.slice(-4).map((e) => e.text)).toEqual(["INT. A - DAY", "One.", "ADA", "Hi."]);
  });
});
