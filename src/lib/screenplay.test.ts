import { describe, expect, it } from "vitest";
import { approximatePageCount, projectFolderName, scenesFromFountain, wordCount } from "./screenplay";

describe("screenplay utilities", () => {
  it("detects Fountain scene headings and preserves Unicode", () => {
    const scenes = scenesFromFountain("Title: Àdùnní\n\nINT. ÒṢUN HOUSE - NIGHT\nAction\n\nEXT. ROAD - DAY");
    expect(scenes.map((scene) => scene.heading)).toEqual(["INT. ÒṢUN HOUSE - NIGHT", "EXT. ROAD - DAY"]);
  });
  it("counts words and pages without returning zero", () => {
    expect(wordCount("Ọ̀ṣun speaks softly.")).toBe(3);
    expect(approximatePageCount("")).toBe(1);
  });
  it("creates Windows-safe folder names", () => {
    expect(projectFolderName("  My: Film?  ")).toBe("My Film");
  });
});

