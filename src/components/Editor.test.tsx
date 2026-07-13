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
    onChange={onChange} onProjectDataChange={vi.fn()} onSave={vi.fn()} onHome={vi.fn()} onReveal={vi.fn()}/>);
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
});
