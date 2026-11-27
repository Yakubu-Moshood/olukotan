// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import type { ProjectPayload } from "../types";

const project: ProjectPayload = {
  manifest: {
    schemaVersion: 1, application: "Olukotan", projectId: "test-project", title: "Editor Test",
    projectType: "feature-film", author: "Writer", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    primaryDocument: "screenplay.fountain", storageMode: "local", language: "en-GB", pageSize: "A4",
    screenplayStandard: "industry-standard", revisionMode: false, currentRevisionSet: null, importHistory: [], exportHistory: [],
  },
  screenplay: "Title: Editor Test\nAuthor: Writer\n\n", projectPath: "browser://test/editor-test", readOnly: false, modifiedAt: 1,
};

afterEach(cleanup);

/** Script lines are rich-text fields: read their visible text. */
const text = (element: Element) => (element.textContent ?? "").replace(/\u00a0/gu, " ");
/** Simulates typing: sets the line's text, places the caret, and fires the input event. */
function type(element: Element, value: string, cursor = value.length) {
  element.textContent = value;
  const node = element.firstChild;
  const range = document.createRange();
  if (node) range.setStart(node, Math.min(cursor, value.length)); else range.setStart(element, 0);
  range.collapse(true);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  fireEvent.input(element);
}
function cursorOf(element: Element) {
  const selection = window.getSelection()!; if (!selection.rangeCount) return -1;
  const range = document.createRange(); range.setStart(element, 0);
  const end = selection.getRangeAt(0); range.setEnd(end.startContainer, end.startOffset);
  return range.toString().length;
}

function setup() {
  const onChange = vi.fn();
  render(<Editor project={project} content={project.screenplay} dirty={false} saving={false} message=""
    onChange={onChange} onProjectDataChange={vi.fn()} onSave={vi.fn()} onHome={vi.fn()} onReveal={vi.fn()} onExported={vi.fn()}/>);
  return { onChange };
}

describe("structured screenplay editor integration", () => {
  it("completes scene → action → character → dialogue using Enter and Tab", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "int. reception centre - night", 29);
    expect(text(scene)).toBe("INT. RECEPTION CENTRE - NIGHT");
    fireEvent.keyDown(scene, { key: "Enter" });

    const action = screen.getByLabelText("Action element 2") as HTMLElement;
    type(action, "Daniel stands over the locked drawer.", 37);
    fireEvent.keyDown(action, { key: "Enter" });
    const blankAction = screen.getByLabelText("Action element 3") as HTMLElement;
    fireEvent.keyDown(blankAction, { key: "Tab" });

    const character = screen.getByLabelText("Character element 3") as HTMLElement;
    type(character, "daniel", 6);
    expect(text(character)).toBe("DANIEL");
    fireEvent.keyDown(character, { key: "Enter" });
    expect(screen.getByLabelText("Dialogue element 4")).toBeInTheDocument();
  });

  it("converts an opening parenthesis into a parenthetical", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLElement; fireEvent.keyDown(action, { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLElement;
    type(character, "daniel", 6); fireEvent.keyDown(character, { key: "Enter" });
    const dialogue = screen.getByLabelText("Dialogue element 3") as HTMLElement;
    type(dialogue, "(", 1);
    expect(text(screen.getByLabelText("Parenthetical element 3"))).toBe("()");
  });

  it("selects a known character from autocomplete and continues into dialogue", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15);
    fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLElement;
    fireEvent.keyDown(action, { key: "Tab" });
    const firstCharacter = screen.getByLabelText("Character element 2") as HTMLElement;
    type(firstCharacter, "daniel", 6);
    fireEvent.keyDown(firstCharacter, { key: "Enter" });
    const firstDialogue = screen.getByLabelText("Dialogue element 3") as HTMLElement;
    type(firstDialogue, "Not tonight.", 12);
    fireEvent.keyDown(firstDialogue, { key: "Enter" });
    const nextAction = screen.getByLabelText("Action element 4") as HTMLElement;
    fireEvent.keyDown(nextAction, { key: "Tab" });
    const nextCharacter = screen.getByLabelText("Character element 4") as HTMLElement;
    type(nextCharacter, "dan", 3);
    fireEvent.click(screen.getByRole("option", { name: "DANIEL" }));
    expect(text(nextCharacter)).toBe("DANIEL");
    fireEvent.keyDown(nextCharacter, { key: "Enter" });
    expect(screen.getByLabelText("Dialogue element 5")).toBeInTheDocument();
  });

  it("moves from a transition into a newly detected scene heading", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15);
    fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLElement;
    fireEvent.keyDown(action, { key: "6", ctrlKey: true });
    const transition = screen.getByLabelText("Transition element 2") as HTMLElement;
    type(transition, "cut to:", 7);
    expect(text(transition)).toBe("CUT TO:");
    fireEvent.keyDown(transition, { key: "Enter" });
    const nextScene = screen.getByLabelText("Scene Heading element 3") as HTMLElement;
    type(nextScene, "ext. empty road - dawn", 22);
    expect(text(nextScene)).toBe("EXT. EMPTY ROAD - DAWN");
  });

  it("keeps common transitions semantic, single-line, and isolated from other element geometry", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. GOAL POST - NIGHT", 22); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLElement;
    fireEvent.keyDown(action, { key: "6", ctrlKey: true });
    const transition = screen.getByLabelText("Transition element 2") as HTMLElement;
    for (const value of ["cut to:", "smash cut to:", "match cut to:", "dissolve to:", "fade out.", "fade to black."]) {
      type(transition, value, value.length);
      expect(text(transition)).toBe(value.toLocaleUpperCase("en-GB"));
      expect(text(transition)).not.toMatch(/^\s/u);
      expect(text(transition)).not.toContain("\n");
      expect(transition.closest(".screenplay-transition")).toBeInTheDocument();
      expect(transition.closest(".screenplay-character, .screenplay-dialogue")).toBeNull();
    }
    fireEvent.keyDown(transition, { key: "Enter" });
    expect(screen.getByLabelText("Scene Heading element 3").closest(".screenplay-scene-heading")).toBeInTheDocument();
  });

  it("undo restores an element transition exactly", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "EXT. ROAD - NIGHT", 17);
    fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2");
    fireEvent.keyDown(action, { key: "z", ctrlKey: true });
    expect(screen.queryByLabelText("Action element 2")).not.toBeInTheDocument();
    expect(text(screen.getByLabelText("Scene Heading element 1"))).toBe("EXT. ROAD - NIGHT");
  });

  it("never converts the previous speaker into Character during Action typing", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15);
    fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLElement;
    type(character, "deji", 4);
    fireEvent.keyDown(character, { key: "Enter" });
    const dialogue = screen.getByLabelText("Dialogue element 3") as HTMLElement;
    type(dialogue, "Ayomide, how far?", 17);
    fireEvent.keyDown(dialogue, { key: "Enter" });
    expect(screen.queryByRole("listbox", { name: "Action suggestions" })).not.toBeInTheDocument();

    const stages = ["D", "De", "Dej", "Deji", "Deji ", "Deji i", "Deji ig", "Deji ign", "Deji ignores", "Deji ignores the call."];
    for (const value of stages) {
      const action = screen.getByLabelText("Action element 4") as HTMLElement;
      type(action, value, value.length);
      expect(text(screen.getByLabelText("Action element 4"))).toBe(value);
      expect(cursorOf(screen.getByLabelText("Action element 4"))).toBe(value.length);
      expect(screen.queryByLabelText("Character element 4")).not.toBeInTheDocument();
      expect(screen.queryByRole("listbox", { name: "Action suggestions" })).not.toBeInTheDocument();
    }

    const committedAction = screen.getByLabelText("Action element 4") as HTMLElement;
    fireEvent.keyDown(committedAction, { key: "Enter" });
    const standalone = screen.getByLabelText("Action element 5") as HTMLElement;
    type(standalone, "Deji", 4);
    expect(text(screen.getByLabelText("Action element 5"))).toBe("Deji");
    fireEvent.keyDown(screen.getByLabelText("Action element 5"), { key: "Enter" });
    expect(text(screen.getByLabelText("Character element 5"))).toBe("DEJI");
    expect(screen.getByLabelText("Dialogue element 6")).toBeInTheDocument();
  });

  it("shows character autocomplete only after deliberate Character mode", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLElement;
    type(character, "deji", 4); fireEvent.keyDown(character, { key: "Enter" });
    type(screen.getByLabelText("Dialogue element 3"), "No.", 3);
    fireEvent.keyDown(screen.getByLabelText("Dialogue element 3"), { key: "Enter" });
    const action = screen.getByLabelText("Action element 4") as HTMLElement;
    expect(screen.queryByRole("listbox", { name: "Action suggestions" })).not.toBeInTheDocument();
    fireEvent.keyDown(action, { key: "Tab" });
    const characterMode = screen.getByLabelText("Character element 4") as HTMLElement;
    type(characterMode, "De", 2);
    expect(text(screen.getByLabelText("Character element 4"))).toBe("DE");
    expect(screen.getByRole("option", { name: "DEJI" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "INT." })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "DEJI" }));
    expect(text(screen.getByLabelText("Character element 4"))).toBe("DEJI");
  });

  it("completes professional character extensions and supports multiple extensions", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLElement;
    type(character, "tobias (v", 9);
    expect(screen.getByRole("option", { name: "V.O." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "V.O." }));
    expect(text(character)).toBe("TOBIAS (V.O.)");
    type(character, "TOBIAS (V.O.) (O", 16);
    fireEvent.click(screen.getByRole("option", { name: "O.S." }));
    expect(text(character)).toBe("TOBIAS (V.O.) (O.S.)");
    fireEvent.keyDown(character, { key: "Enter" });
    expect(screen.getByLabelText("Dialogue element 3")).toBeInTheDocument();
  });

  it("keeps automatic CONT'D attached to the character cue and suppresses a manual duplicate", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const first = screen.getByLabelText("Character element 2") as HTMLElement;
    type(first, "deji", 4); fireEvent.keyDown(first, { key: "Enter" });
    const dialogue = screen.getByLabelText("Dialogue element 3") as HTMLElement;
    type(dialogue, "Wait.", 5); fireEvent.keyDown(dialogue, { key: "Enter" });
    const action = screen.getByLabelText("Action element 4") as HTMLElement;
    type(action, "A door slams.", 13); fireEvent.keyDown(action, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 5"), { key: "Tab" });
    const repeated = screen.getByLabelText("Character element 5") as HTMLElement;
    type(repeated, "deji", 4);
    const cue = repeated.closest(".character-cue");
    expect(cue).toHaveAttribute("data-rendered-cue", "DEJI (CONT'D)");
    expect(screen.getByLabelText("Automatic character continued")).toHaveClass("automatic-continued");
    type(repeated, "DEJI (CONT'D)", 13);
    expect(cue).toHaveAttribute("data-rendered-cue", "DEJI (CONT'D)");
    expect(screen.queryByLabelText("Automatic character continued")).not.toBeInTheDocument();
  });

  it.each([
    "REMI", "TOBIAS", "DEJI", "EMEKA", "AYOMIDE", "UNCLE TUNDE", "YOUNG DANIEL",
    "TOBIAS (CONT'D)", "TOBIAS (V.O.)", "TOBIAS (O.S.)", "UNCLE TUNDE (CONT'D)",
  ])("keeps the complete Character cue %s in a non-shrinking single-line field", (cueText) => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLElement;
    type(scene, "INT. ROOM - DAY", 15); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLElement;
    type(character, cueText, cueText.length);
    const cue = character.closest(".character-cue") as HTMLElement;
    expect(text(character)).not.toContain("\n");
    expect(text(character)).toBe(cueText);
    expect(cue).toHaveClass("character-cue");
    // Width, no-shrink and no-wrap are applied by the .character-cue .rich-line stylesheet rule.
    expect(character).toHaveClass("rich-line");
  });

  it("capitalises new sentences as you type in action and dialogue", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1");
    type(scene, "INT. ROOM - DAY"); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2");
    type(action, "s", 1);
    expect(text(screen.getByLabelText("Action element 2"))).toBe("S");
    type(screen.getByLabelText("Action element 2"), "She waits. ", 11);
    type(screen.getByLabelText("Action element 2"), "She waits. t", 12);
    expect(text(screen.getByLabelText("Action element 2"))).toBe("She waits. T");
  });

  it("makes selected text bold with Ctrl+B and shows it as bold", () => {
    const { onChange } = setup();
    const scene = screen.getByLabelText("Scene Heading element 1");
    type(scene, "INT. ROOM - DAY"); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2");
    type(action, "A loud bang.");
    const node = action.firstChild!; const range = document.createRange(); range.setStart(node, 2); range.setEnd(node, 6);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    fireEvent.keyDown(action, { key: "b", ctrlKey: true });
    const line = screen.getByLabelText("Action element 2");
    expect(line.querySelector(".rt-b")?.textContent).toBe("loud");
    expect(text(line)).toBe("A loud bang.");
    expect(onChange.mock.calls.at(-1)![0]).toContain("A **loud** bang.");
  });

  it("pastes multi-line screenplay text as separate elements without asking", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1");
    const confirm = vi.spyOn(window, "confirm");
    const lines = Array.from({ length: 60 }, (_, i) => `Action line ${i + 1}.`).join("\n\n");
    fireEvent.paste(scene, { clipboardData: { getData: () => `INT. MARKET - NIGHT\n\n${lines}` } });
    expect(confirm).not.toHaveBeenCalled();
    expect(text(screen.getByLabelText("Scene Heading element 1"))).toBe("INT. MARKET - NIGHT");
    expect(screen.getByLabelText("Action element 61")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("pastes a single line inline at the cursor", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1");
    type(scene, "INT. ROOM - DAY"); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2");
    type(action, "She  away.", 4);
    fireEvent.paste(action, { clipboardData: { getData: () => "walks" } });
    expect(text(screen.getByLabelText("Action element 2"))).toBe("She walks away.");
  });

  it("offers Cut, Copy and Paste on right-click", () => {
    setup();
    fireEvent.contextMenu(screen.getByLabelText("Scene Heading element 1"));
    for (const name of [/^Cut/u, /^Copy/u, /^Paste/u, /^Bold/u]) expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
  });
});
