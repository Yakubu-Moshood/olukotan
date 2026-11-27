import { describe, expect, it } from "vitest";
import { defaultProjectData } from "../types";
import { paginate } from "./pagination";
import { characterReport, locationReport, toCsv } from "./reports";
import { parseFountain } from "./screenplay-elements";
import { synchroniseSceneMetadata } from "./screenplay-production";

const { document, projectData } = synchroniseSceneMetadata(parseFountain(
  "INT. ỌJÀ MARKET - NIGHT\n\nRain.\n\nTOLU\n(quietly)\nMàmá, are you here?\n\nIYÁ (O.S.)\nCome home.\n\nEXT. ỌJÀ MARKET - DAY\n\nTOLU\nShe is gone.\n\nINT. ROOM - NIGHT\n\nEmpty.\n"), defaultProjectData());
const layout = paginate(document, projectData);

describe("reports", () => {
  it("counts speeches, dialogue words and scenes per character", () => {
    const rows = characterReport(document, projectData, layout);
    expect(rows[0]).toMatchObject({ name: "TOLU", speeches: 2, words: 7, scenes: 2, firstPage: "1", sceneNumbers: ["1", "2"] });
    expect(rows[1]).toMatchObject({ name: "IYÁ", speeches: 1, words: 2 });
  });
  it("groups locations across INT/EXT and times of day", () => {
    const rows = locationReport(document, projectData, layout);
    expect(rows[0]).toMatchObject({ location: "ỌJÀ MARKET", intExt: ["INT.", "EXT."], timesOfDay: ["NIGHT", "DAY"], scenes: 2 });
  });
  it("writes spreadsheet-safe CSV", () => {
    expect(toCsv(["A", "B"], [["x, y", 'say "hi"'], [["1", "2"], 3]])).toBe('A,B\r\n"x, y","say ""hi"""\r\n"1, 2",3\r\n');
  });
});
