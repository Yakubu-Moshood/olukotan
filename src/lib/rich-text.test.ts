import { describe, expect, it } from "vitest";
import { applyStyle, autoCapitalise, canonical, replaceRange, splitFormatted, stylesInRange, toggleStyle, visibleLength, visibleText } from "./rich-text";

describe("rich text model", () => {
  it("round-trips formatting and escapes literal markers", () => {
    for (const text of ["plain", "a **bold** b", "*it* and _under_", "***both***", "5 \\* 3 and snake\\_case", "ÀBÍKẸ́ **ọ̀rẹ́**"]) expect(canonical(text)).toBe(text);
    expect(visibleText("a **bold** _u_")).toBe("a bold u");
    expect(visibleLength("**ab**")).toBe(2);
  });
  it("toggles bold over a selection and off again", () => {
    const on = toggleStyle("make this bold", 10, 14, "bold");
    expect(on).toBe("make this **bold**");
    expect(toggleStyle(on, 10, 14, "bold")).toBe("make this bold");
    expect(toggleStyle(on, 5, 14, "italic")).toBe("make *this* ***bold***");
    expect(stylesInRange(on, 10, 14)).toEqual({ bold: true, italic: false, underline: false });
  });
  it("splits formatted text at a visible offset without breaking markers", () => {
    expect(splitFormatted("say **hello there** now", 9)).toEqual(["say **hello**", " **there** now"]);
  });
  it("inserts text inheriting or overriding style", () => {
    expect(replaceRange("**bold**", 4, 4, "er")).toBe("**bolder**");
    expect(replaceRange("**bold**", 4, 4, " x", { bold: false, italic: false, underline: false })).toBe("**bold** x");
    expect(applyStyle("abc", 1, 2, { bold: false, italic: true, underline: false })).toBe("a*b*c");
  });
  it("capitalises sentence starts and a lone i as you type", () => {
    expect(autoCapitalise("", "t", 1)).toBe("T");
    expect(autoCapitalise("She runs. ", "She runs. h", 11)).toBe("She runs. H");
    expect(autoCapitalise("Wait? \"", "Wait? \"o", 8)).toBe("Wait? \"O");
    expect(autoCapitalise("and i", "and i ", 6)).toBe("and I ");
    expect(autoCapitalise("She runs", "She runsa", 9)).toBe("She runsa");
    expect(autoCapitalise("e.g", "e.g.", 4)).toBe("e.g.");
    expect(autoCapitalise("**Bold.** ", "**Bold.** n", 7)).toBe("**Bold.** N");
  });
});
