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

function setup() {
  const onChange = vi.fn();
  render(<Editor project={project} content={project.screenplay} dirty={false} saving={false} message=""
    onChange={onChange} onProjectDataChange={vi.fn()} onSave={vi.fn()} onHome={vi.fn()} onReveal={vi.fn()} onExported={vi.fn()}/>);
  return { onChange };
}

describe("structured screenplay editor integration", () => {
  it("completes scene → action → character → dialogue using Enter and Tab", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "int. reception centre - night", selectionStart: 29 } });
    expect(scene).toHaveValue("INT. RECEPTION CENTRE - NIGHT");
    fireEvent.keyDown(scene, { key: "Enter" });

    const action = screen.getByLabelText("Action element 2") as HTMLTextAreaElement;
    fireEvent.change(action, { target: { value: "Daniel stands over the locked drawer.", selectionStart: 37 } });
    fireEvent.keyDown(action, { key: "Enter" });
    const blankAction = screen.getByLabelText("Action element 3") as HTMLTextAreaElement;
    fireEvent.keyDown(blankAction, { key: "Tab" });

    const character = screen.getByLabelText("Character element 3") as HTMLTextAreaElement;
    fireEvent.change(character, { target: { value: "daniel", selectionStart: 6 } });
    expect(character).toHaveValue("DANIEL");
    fireEvent.keyDown(character, { key: "Enter" });
    expect(screen.getByLabelText("Dialogue element 4")).toBeInTheDocument();
  });

  it("converts an opening parenthesis into a parenthetical", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } }); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLTextAreaElement; fireEvent.keyDown(action, { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(character, { target: { value: "daniel", selectionStart: 6 } }); fireEvent.keyDown(character, { key: "Enter" });
    const dialogue = screen.getByLabelText("Dialogue element 3") as HTMLTextAreaElement;
    fireEvent.change(dialogue, { target: { value: "(", selectionStart: 1 } });
    expect(screen.getByLabelText("Parenthetical element 3")).toHaveValue("()");
  });

  it("selects a known character from autocomplete and continues into dialogue", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } });
    fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLTextAreaElement;
    fireEvent.keyDown(action, { key: "Tab" });
    const firstCharacter = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(firstCharacter, { target: { value: "daniel", selectionStart: 6 } });
    fireEvent.keyDown(firstCharacter, { key: "Enter" });
    const firstDialogue = screen.getByLabelText("Dialogue element 3") as HTMLTextAreaElement;
    fireEvent.change(firstDialogue, { target: { value: "Not tonight.", selectionStart: 12 } });
    fireEvent.keyDown(firstDialogue, { key: "Enter" });
    const nextAction = screen.getByLabelText("Action element 4") as HTMLTextAreaElement;
    fireEvent.keyDown(nextAction, { key: "Tab" });
    const nextCharacter = screen.getByLabelText("Character element 4") as HTMLTextAreaElement;
    fireEvent.change(nextCharacter, { target: { value: "dan", selectionStart: 3 } });
    fireEvent.click(screen.getByRole("option", { name: "DANIEL" }));
    expect(nextCharacter).toHaveValue("DANIEL");
    fireEvent.keyDown(nextCharacter, { key: "Enter" });
    expect(screen.getByLabelText("Dialogue element 5")).toBeInTheDocument();
  });

  it("moves from a transition into a newly detected scene heading", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } });
    fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLTextAreaElement;
    fireEvent.keyDown(action, { key: "6", ctrlKey: true });
    const transition = screen.getByLabelText("Transition element 2") as HTMLTextAreaElement;
    fireEvent.change(transition, { target: { value: "cut to:", selectionStart: 7 } });
    expect(transition).toHaveValue("CUT TO:");
    fireEvent.keyDown(transition, { key: "Enter" });
    const nextScene = screen.getByLabelText("Scene Heading element 3") as HTMLTextAreaElement;
    fireEvent.change(nextScene, { target: { value: "ext. empty road - dawn", selectionStart: 22 } });
    expect(nextScene).toHaveValue("EXT. EMPTY ROAD - DAWN");
  });

  it("keeps common transitions semantic, single-line, and isolated from other element geometry", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. GOAL POST - NIGHT", selectionStart: 22 } }); fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2") as HTMLTextAreaElement;
    fireEvent.keyDown(action, { key: "6", ctrlKey: true });
    const transition = screen.getByLabelText("Transition element 2") as HTMLTextAreaElement;
    for (const value of ["cut to:", "smash cut to:", "match cut to:", "dissolve to:", "fade out.", "fade to black."]) {
      fireEvent.change(transition, { target: { value, selectionStart: value.length } });
      expect(transition.value).toBe(value.toLocaleUpperCase("en-GB"));
      expect(transition.value).not.toMatch(/^\s/u);
      expect(transition.value).not.toContain("\n");
      expect(transition.closest(".screenplay-transition")).toBeInTheDocument();
      expect(transition.closest(".screenplay-character, .screenplay-dialogue")).toBeNull();
    }
    fireEvent.keyDown(transition, { key: "Enter" });
    expect(screen.getByLabelText("Scene Heading element 3").closest(".screenplay-scene-heading")).toBeInTheDocument();
  });

  it("undo restores an element transition exactly", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "EXT. ROAD - NIGHT", selectionStart: 17 } });
    fireEvent.keyDown(scene, { key: "Enter" });
    const action = screen.getByLabelText("Action element 2");
    fireEvent.keyDown(action, { key: "z", ctrlKey: true });
    expect(screen.queryByLabelText("Action element 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scene Heading element 1")).toHaveValue("EXT. ROAD - NIGHT");
  });

  it("never converts the previous speaker into Character during Action typing", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } });
    fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(character, { target: { value: "deji", selectionStart: 4 } });
    fireEvent.keyDown(character, { key: "Enter" });
    const dialogue = screen.getByLabelText("Dialogue element 3") as HTMLTextAreaElement;
    fireEvent.change(dialogue, { target: { value: "Ayomide, how far?", selectionStart: 17 } });
    fireEvent.keyDown(dialogue, { key: "Enter" });
    expect(screen.queryByRole("listbox", { name: "Action suggestions" })).not.toBeInTheDocument();

    const stages = ["D", "De", "Dej", "Deji", "Deji ", "Deji i", "Deji ig", "Deji ign", "Deji ignores", "Deji ignores the call."];
    for (const value of stages) {
      const action = screen.getByLabelText("Action element 4") as HTMLTextAreaElement;
      fireEvent.change(action, { target: { value, selectionStart: value.length } });
      expect(screen.getByLabelText("Action element 4")).toHaveValue(value);
      expect((screen.getByLabelText("Action element 4") as HTMLTextAreaElement).selectionStart).toBe(value.length);
      expect(screen.queryByLabelText("Character element 4")).not.toBeInTheDocument();
      expect(screen.queryByRole("listbox", { name: "Action suggestions" })).not.toBeInTheDocument();
    }

    const committedAction = screen.getByLabelText("Action element 4") as HTMLTextAreaElement;
    fireEvent.keyDown(committedAction, { key: "Enter" });
    const standalone = screen.getByLabelText("Action element 5") as HTMLTextAreaElement;
    fireEvent.change(standalone, { target: { value: "Deji", selectionStart: 4 } });
    expect(screen.getByLabelText("Action element 5")).toHaveValue("Deji");
    fireEvent.keyDown(screen.getByLabelText("Action element 5"), { key: "Enter" });
    expect(screen.getByLabelText("Character element 5")).toHaveValue("DEJI");
    expect(screen.getByLabelText("Dialogue element 6")).toBeInTheDocument();
  });

  it("shows character autocomplete only after deliberate Character mode", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } }); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(character, { target: { value: "deji", selectionStart: 4 } }); fireEvent.keyDown(character, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Dialogue element 3"), { target: { value: "No.", selectionStart: 3 } });
    fireEvent.keyDown(screen.getByLabelText("Dialogue element 3"), { key: "Enter" });
    const action = screen.getByLabelText("Action element 4") as HTMLTextAreaElement;
    expect(screen.queryByRole("listbox", { name: "Action suggestions" })).not.toBeInTheDocument();
    fireEvent.keyDown(action, { key: "Tab" });
    const characterMode = screen.getByLabelText("Character element 4") as HTMLTextAreaElement;
    fireEvent.change(characterMode, { target: { value: "De", selectionStart: 2 } });
    expect(screen.getByLabelText("Character element 4")).toHaveValue("DE");
    expect(screen.getByRole("option", { name: "DEJI" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "INT." })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "DEJI" }));
    expect(screen.getByLabelText("Character element 4")).toHaveValue("DEJI");
  });

  it("completes professional character extensions and supports multiple extensions", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } }); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(character, { target: { value: "tobias (v", selectionStart: 9 } });
    expect(screen.getByRole("option", { name: "V.O." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "V.O." }));
    expect(character).toHaveValue("TOBIAS (V.O.)");
    fireEvent.change(character, { target: { value: "TOBIAS (V.O.) (O", selectionStart: 16 } });
    fireEvent.click(screen.getByRole("option", { name: "O.S." }));
    expect(character).toHaveValue("TOBIAS (V.O.) (O.S.)");
    fireEvent.keyDown(character, { key: "Enter" });
    expect(screen.getByLabelText("Dialogue element 3")).toBeInTheDocument();
  });

  it("keeps automatic CONT'D attached to the character cue and suppresses a manual duplicate", () => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } }); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const first = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(first, { target: { value: "deji", selectionStart: 4 } }); fireEvent.keyDown(first, { key: "Enter" });
    const dialogue = screen.getByLabelText("Dialogue element 3") as HTMLTextAreaElement;
    fireEvent.change(dialogue, { target: { value: "Wait.", selectionStart: 5 } }); fireEvent.keyDown(dialogue, { key: "Enter" });
    const action = screen.getByLabelText("Action element 4") as HTMLTextAreaElement;
    fireEvent.change(action, { target: { value: "A door slams.", selectionStart: 13 } }); fireEvent.keyDown(action, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 5"), { key: "Tab" });
    const repeated = screen.getByLabelText("Character element 5") as HTMLTextAreaElement;
    fireEvent.change(repeated, { target: { value: "deji", selectionStart: 4 } });
    const cue = repeated.closest(".character-cue");
    expect(cue).toHaveAttribute("data-rendered-cue", "DEJI (CONT'D)");
    expect(screen.getByLabelText("Automatic character continued")).toHaveClass("automatic-continued");
    fireEvent.change(repeated, { target: { value: "DEJI (CONT'D)", selectionStart: 13 } });
    expect(cue).toHaveAttribute("data-rendered-cue", "DEJI (CONT'D)");
    expect(screen.queryByLabelText("Automatic character continued")).not.toBeInTheDocument();
  });

  it.each([
    "REMI", "TOBIAS", "DEJI", "EMEKA", "AYOMIDE", "UNCLE TUNDE", "YOUNG DANIEL",
    "TOBIAS (CONT'D)", "TOBIAS (V.O.)", "TOBIAS (O.S.)", "UNCLE TUNDE (CONT'D)",
  ])("keeps the complete Character cue %s in a non-shrinking single-line field", (cueText) => {
    setup();
    const scene = screen.getByLabelText("Scene Heading element 1") as HTMLTextAreaElement;
    fireEvent.change(scene, { target: { value: "INT. ROOM - DAY", selectionStart: 15 } }); fireEvent.keyDown(scene, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Action element 2"), { key: "Tab" });
    const character = screen.getByLabelText("Character element 2") as HTMLTextAreaElement;
    fireEvent.change(character, { target: { value: cueText, selectionStart: cueText.length } });
    const cue = character.closest(".character-cue") as HTMLElement;
    expect(character.value).not.toContain("\n");
    expect(character.style.width).toBe(`calc(${cueText.length}ch + 2px)`);
    expect(cue).toHaveClass("character-cue");
    expect(character.style.flexShrink).toBe("0");
    expect(character.style.wordBreak).toBe("normal");
    expect(character.style.overflowWrap).toBe("normal");
  });
});
