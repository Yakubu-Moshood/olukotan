import type { ProjectData, RevisionSet, SceneMetadata } from "../types";
import { createElement, parseCharacter, type ScreenplayDocument, type ScreenplayElement, type ScreenplayElementType } from "./screenplay-elements";
import { serializeTitlePage, styledChars, titleCreditBlock, type TitlePageFields } from "./pagination";

/**
 * Final Draft (.fdx) import and export.
 *
 * Import parses into Olukotan's neutral element model. Anything Olukotan does
 * not model (element settings, smart type lists, header/footer, page layout…)
 * is retained verbatim as a template so a later FDX export writes it back.
 */

export interface FdxImportResult {
  document: ScreenplayDocument;
  scenes: SceneMetadata[];
  revisionSets: RevisionSet[];
  activeRevisionSetId: string | null;
  titlePage: TitlePageFields;
  /** Original XML with <Content>/<TitlePage>/<Revisions> replaced by placeholders. */
  template: string;
  warnings: string[];
  stats: { paragraphs: number; scenes: number; characters: number; dualDialogue: number; unknownTypes: Record<string, number> };
}

const TYPE_FROM_FDX: Record<string, ScreenplayElementType> = {
  "Scene Heading": "scene-heading", Action: "action", Character: "character", Parenthetical: "parenthetical",
  Dialogue: "dialogue", Transition: "transition", Shot: "shot", General: "general", "Cast List": "general",
};
export const FDX_FROM_TYPE: Partial<Record<ScreenplayElementType, string>> = {
  "scene-heading": "Scene Heading", action: "Action", character: "Character", parenthetical: "Parenthetical",
  dialogue: "Dialogue", transition: "Transition", shot: "Shot", general: "General",
};

const PLACEHOLDER = { content: "<!--OLUKOTAN:CONTENT-->", title: "<!--OLUKOTAN:TITLEPAGE-->", revisions: "<!--OLUKOTAN:REVISIONS-->" };

function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml.replace(/^﻿/u, ""), "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error("This file is not valid Final Draft XML. It may be damaged or saved in a different format. Nothing was imported.");
  if (doc.documentElement.nodeName !== "FinalDraft") throw new Error("This XML file is not a Final Draft document. Nothing was imported.");
  return doc;
}

const children = (node: Element, name: string) => [...node.children].filter((child) => child.nodeName === name);

/** Converts <Text Style="Bold+Italic"> runs into Fountain emphasis markers. */
function runsToFountain(paragraph: Element, revisionIds: Set<string>): string {
  let out = "";
  for (const text of children(paragraph, "Text")) {
    let value = text.textContent ?? "";
    const revision = text.getAttribute("RevisionID"); if (revision) revisionIds.add(revision);
    const style = (text.getAttribute("Style") ?? "").split("+");
    if (style.includes("AllCaps")) value = value.toLocaleUpperCase("en-GB");
    if (!value) continue;
    // Escape literal markers so they survive as text.
    value = value.replace(/([*_\\])/gu, "\\$1");
    const lead = value.match(/^\s*/u)![0], trail = value.match(/\s*$/u)![0];
    let core = value.trim();
    if (core) {
      if (style.includes("Underline")) core = `_${core}_`;
      if (style.includes("Bold") && style.includes("Italic")) core = `***${core}***`;
      else if (style.includes("Bold")) core = `**${core}**`;
      else if (style.includes("Italic")) core = `*${core}*`;
    }
    out += lead + core + trail;
  }
  return out.replace(/\r?\n/gu, " ").replace(/\t/gu, " ");
}

function revisionForParagraph(paragraph: Element): string | undefined {
  for (const text of children(paragraph, "Text")) { const id = text.getAttribute("RevisionID"); if (id && id !== "0") return id; }
  return undefined;
}

const colourFromFdx = (value: string | null) => {
  // FDX colours are 48-bit: #RRRRGGGGBBBB. Keep the high byte of each channel.
  const match = value?.match(/^#([0-9a-f]{12})$/iu);
  if (!match) return value?.match(/^#[0-9a-f]{6}$/iu) ? value : undefined;
  const hex = match[1]; return `#${hex.slice(0, 2)}${hex.slice(4, 6)}${hex.slice(8, 10)}`.toLowerCase();
};
const colourToFdx = (value?: string) => {
  const match = value?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu);
  return match ? `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`.toUpperCase() : undefined;
};

function sceneId() { return globalThis.crypto?.randomUUID?.() ?? `scene-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function parseFdx(xml: string): FdxImportResult {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const content = children(root, "Content")[0];
  if (!content) throw new Error("This Final Draft file has no script content. Nothing was imported.");
  const warnings: string[] = [];
  const unknownTypes: Record<string, number> = {};
  const elements: ScreenplayElement[] = [];
  const scenes: SceneMetadata[] = [];
  const fdxRevisionIds = new Set<string>();
  let dualCount = 0, paragraphs = 0;
  const revisionMap = new Map<string, string>();

  const convert = (paragraph: Element, dualGroup?: string) => {
    paragraphs++;
    const fdxType = paragraph.getAttribute("Type") ?? "Action";
    let type = TYPE_FROM_FDX[fdxType];
    if (!type) { type = "general"; unknownTypes[fdxType] = (unknownTypes[fdxType] ?? 0) + 1; }
    if (paragraph.getAttribute("StartsNewPage") === "Yes" && elements.length) elements.push(createElement("page-break"));
    const text = runsToFountain(paragraph, fdxRevisionIds);
    const metadata: ScreenplayElement["metadata"] = {};
    const revision = revisionForParagraph(paragraph);
    if (revision) metadata.revisionSet = `fdx-revision-${revision}`;
    if (dualGroup && (type === "character" || type === "parenthetical" || type === "dialogue")) metadata.dualDialogueGroupId = dualGroup;
    if (type === "scene-heading") {
      const id = sceneId(); metadata.sceneId = id;
      const number = paragraph.getAttribute("Number") ?? undefined;
      if (number) metadata.sceneNumber = number;
      const properties = children(paragraph, "SceneProperties")[0];
      const summary = properties ? children(properties, "Summary")[0] : undefined;
      const summaryText = summary ? [...summary.getElementsByTagName("Text")].map((t) => t.textContent ?? "").join("").trim() : "";
      const colour = colourFromFdx(properties?.getAttribute("Color") ?? null);
      const omitted = /^\s*OMITTED\s*$/iu.test(text);
      scenes.push({ sceneId: id, ...(number ? { number, numberingMode: "manual" as const } : {}), ...(summaryText ? { summary: summaryText } : {}),
        ...(colour && colour !== "#000000" ? { colour } : {}), ...(properties?.getAttribute("Title") ? { tags: [properties.getAttribute("Title")!] } : {}), ...(omitted ? { omitted: true, status: "Omitted" as const } : {}) });
    }
    if (type === "character") { const parsed = parseCharacter(text); Object.assign(metadata, { characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions }); }
    const element = createElement(type, text, Object.keys(metadata).length ? metadata : undefined);
    // Preserve scene-heading/character text exactly (createElement upper-cases, which matches FD output).
    elements.push(element);
    // Script notes attached to a paragraph become Olukotan notes after it.
    for (const note of [...paragraph.getElementsByTagName("ScriptNote")]) {
      const noteText = [...note.getElementsByTagName("Text")].map((t) => t.textContent ?? "").join(" ").trim();
      if (noteText) elements.push(createElement("note", noteText));
    }
  };

  for (const paragraph of children(content, "Paragraph")) {
    const dual = children(paragraph, "DualDialogue")[0];
    if (dual) {
      dualCount++;
      const group = `dual-${dualCount}-${Math.random().toString(36).slice(2, 7)}`;
      for (const inner of children(dual, "Paragraph")) convert(inner, group);
      continue;
    }
    convert(paragraph);
  }

  // Revisions
  const revisionsNode = children(root, "Revisions")[0];
  const revisionSets: RevisionSet[] = [];
  let activeRevisionSetId: string | null = null;
  if (revisionsNode) {
    for (const revision of children(revisionsNode, "Revision")) {
      const fdxId = revision.getAttribute("ID") ?? String(revisionSets.length + 1);
      const id = `fdx-revision-${fdxId}`; revisionMap.set(fdxId, id);
      revisionSets.push({ id, name: (revision.getAttribute("Name") ?? `Revision ${fdxId}`).replace(/\s*Revision$/iu, ""),
        colour: colourFromFdx(revision.getAttribute("PageColor")) ?? "#ffffff", mark: revision.getAttribute("Mark") || "*" });
    }
    const active = revisionsNode.getAttribute("ActiveSet");
    if (active && revisionMap.has(active) && revisionsNode.getAttribute("RevisionMode") === "Yes") activeRevisionSetId = revisionMap.get(active)!;
  }
  for (const id of fdxRevisionIds) if (id !== "0" && !revisionMap.has(id)) revisionSets.push({ id: `fdx-revision-${id}`, name: `Revision ${id}`, colour: "#ffffff", mark: "*" });

  const titlePage = parseFdxTitlePage(children(root, "TitlePage")[0]);
  const template = buildTemplate(xml);

  for (const [type, count] of Object.entries(unknownTypes)) warnings.push(`${count} “${type}” paragraph${count === 1 ? "" : "s"} imported as General Text.`);
  if (children(root, "Content").length > 1) warnings.push("This file has more than one content section; only the first was imported.");
  const characters = new Set(elements.filter((element) => element.type === "character").map((element) => parseCharacter(element.text).name)).size;
  if (!elements.length) elements.push(createElement("scene-heading"));
  return {
    document: { preamble: serializeTitlePage(titlePage), elements }, scenes, revisionSets, activeRevisionSetId, titlePage, template, warnings,
    stats: { paragraphs, scenes: scenes.length, characters, dualDialogue: dualCount, unknownTypes },
  };
}

/** Maps Final Draft's free-form title page onto structured fields by position and alignment. */
function parseFdxTitlePage(node?: Element): TitlePageFields {
  if (!node) return {};
  const content = children(node, "Content")[0] ?? node;
  const lines = children(content, "Paragraph").map((paragraph) => ({
    text: [...paragraph.getElementsByTagName("Text")].map((t) => t.textContent ?? "").join("").trim(),
    align: (paragraph.getAttribute("Alignment") ?? "Left").toLowerCase(),
  }));
  const fields: TitlePageFields = {};
  const centred = lines.filter((line) => line.align === "center" && line.text);
  const creditIndex = centred.findIndex((line) => /\b(written|screenplay|teleplay|story)\b.*\bby\b|^by$/iu.test(line.text));
  if (centred.length) {
    const titleLines = creditIndex > 0 ? centred.slice(0, creditIndex) : centred.slice(0, 1);
    fields.title = titleLines.map((line) => line.text).join("\n");
    if (creditIndex >= 0) {
      fields.credit = centred[creditIndex].text;
      const rest = centred.slice(creditIndex + 1);
      const sourceIndex = rest.findIndex((line) => /^based on/iu.test(line.text));
      const authors = sourceIndex >= 0 ? rest.slice(0, sourceIndex) : rest;
      if (authors.length) fields.author = authors.map((line) => line.text).join("\n");
      if (sourceIndex >= 0) fields.source = rest.slice(sourceIndex).map((line) => line.text).join("\n");
    } else if (centred.length > 1) fields.author = centred.slice(1).map((line) => line.text).join("\n");
  }
  // Left-aligned block after the centred group = contact; right-aligned = draft date.
  const lastCentred = lines.map((line) => line.align).lastIndexOf("center");
  const left = lines.slice(lastCentred + 1).filter((line) => line.align !== "right" && line.align !== "center" && line.text);
  if (left.length) fields.contact = left.map((line) => line.text).join("\n");
  const right = lines.filter((line) => line.align === "right" && line.text);
  if (right.length) fields.draftDate = right.map((line) => line.text).join("\n");
  return fields;
}

function buildTemplate(xml: string): string {
  let template = xml.replace(/^﻿/u, "");
  const replaceSection = (tag: string, placeholder: string) => {
    const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</${tag}>)`, "u");
    if (pattern.test(template)) template = template.replace(pattern, placeholder);
    else template = template.replace(/<\/FinalDraft>\s*$/u, `${placeholder}\n</FinalDraft>`);
  };
  // Content is the first top-level <Content>; TitlePage contains its own <Content>, so remove TitlePage first.
  replaceSection("TitlePage", PLACEHOLDER.title);
  replaceSection("Content", PLACEHOLDER.content);
  replaceSection("Revisions", PLACEHOLDER.revisions);
  return template;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Converts Fountain emphasis into <Text Style="…"> runs. */
export function fountainToRuns(text: string, revisionId?: string): string {
  const chars = styledChars(text);
  if (!chars.length) return `<Text${revisionId ? ` RevisionID="${revisionId}"` : ""}></Text>`;
  const runs: { text: string; style: string }[] = [];
  for (const c of chars) {
    const style = [c.bold ? "Bold" : "", c.italic ? "Italic" : "", c.underline ? "Underline" : ""].filter(Boolean).join("+");
    const last = runs.at(-1);
    if (last && last.style === style) last.text += c.ch; else runs.push({ text: c.ch, style });
  }
  return runs.map((run) => `<Text${run.style ? ` Style="${run.style}"` : ""}${revisionId ? ` RevisionID="${revisionId}"` : ""}>${escapeXml(run.text)}</Text>`).join("");
}

export interface FdxExportOptions { includeSceneNumbers: boolean; includeNotes: boolean; includeTitlePage: boolean; titlePage: TitlePageFields; template?: string }

export function writeFdx(document: ScreenplayDocument, projectData: ProjectData, options: FdxExportOptions): string {
  const revisionIndex = new Map(projectData.revisionSets.map((set, index) => [set.id, String(index + 1)]));
  const sceneFor = (element: ScreenplayElement) => projectData.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId);
  const paragraphs: string[] = [];
  let startsNewPage = false;
  const paragraphXml = (element: ScreenplayElement) => {
    const type = FDX_FROM_TYPE[element.type] ?? "General";
    const revision = element.metadata?.revisionSet ? revisionIndex.get(element.metadata.revisionSet) : undefined;
    const scene = element.type === "scene-heading" ? sceneFor(element) : undefined;
    const number = options.includeSceneNumbers ? scene?.number : undefined;
    const attributes = [`Type="${type}"`, number ? `Number="${escapeXml(number)}"` : "", startsNewPage ? `StartsNewPage="Yes"` : ""].filter(Boolean).join(" ");
    startsNewPage = false;
    const properties = scene ? `<SceneProperties${scene.colour ? ` Color="${colourToFdx(scene.colour)}"` : ""}${scene.tags?.[0] ? ` Title="${escapeXml(scene.tags[0])}"` : ""}>${scene.summary ? `<Summary><Paragraph Type="Action"><Text>${escapeXml(scene.summary)}</Text></Paragraph></Summary>` : ""}</SceneProperties>` : "";
    const text = element.type === "scene-heading" && scene?.omitted ? "OMITTED" : element.text;
    return `<Paragraph ${attributes}>${properties}${fountainToRuns(text, revision)}</Paragraph>`;
  };
  const elements = document.elements;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.type === "page-break") { startsNewPage = true; continue; }
    if (["section", "synopsis"].includes(element.type)) continue;
    if (element.type === "note") {
      if (options.includeNotes && paragraphs.length) {
        const note = `<ScriptNote><Paragraph><Text>${escapeXml(element.text)}</Text></Paragraph></ScriptNote>`;
        paragraphs[paragraphs.length - 1] = paragraphs[paragraphs.length - 1].replace(/<\/Paragraph>$/u, `${note}</Paragraph>`);
      }
      continue;
    }
    const group = element.metadata?.dualDialogueGroupId;
    if (group && element.type === "character") {
      const inner: string[] = [];
      let j = i;
      for (; j < elements.length && elements[j].metadata?.dualDialogueGroupId === group && ["character", "parenthetical", "dialogue"].includes(elements[j].type); j++) inner.push(paragraphXml(elements[j]));
      paragraphs.push(`<Paragraph><DualDialogue>${inner.join("")}</DualDialogue></Paragraph>`);
      i = j - 1; continue;
    }
    paragraphs.push(paragraphXml(element));
  }
  const content = `<Content>\n${paragraphs.join("\n")}\n</Content>`;
  const titlePage = options.includeTitlePage ? writeTitlePage(options.titlePage) : "";
  const activeId = projectData.screenplaySettings.revisions.activeSetId;
  const revisions = projectData.revisionSets.length
    ? `<Revisions ActiveSet="${activeId ? revisionIndex.get(activeId) ?? "1" : "1"}" Location="7.75" RevisionMode="${projectData.screenplaySettings.revisions.enabled ? "Yes" : "No"}" RevisionsShown="Active" ShowAllMarks="Yes" ShowAllSets="Yes">${projectData.revisionSets.map((set, index) =>
      `<Revision Color="#000000000000" FullRevision="No" ID="${index + 1}" Mark="${escapeXml(set.mark)}" Name="${escapeXml(set.name)} Revision" PageColor="${colourToFdx(set.colour) ?? "#FFFFFFFFFFFF"}" Style=""/>`).join("")}</Revisions>`
    : "";
  if (options.template && options.template.includes(PLACEHOLDER.content)) {
    return options.template.replace(PLACEHOLDER.content, () => content).replace(PLACEHOLDER.title, () => titlePage).replace(PLACEHOLDER.revisions, () => revisions);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="5">\n${content}\n${titlePage}\n${revisions}\n</FinalDraft>\n`;
}

function writeTitlePage(fields: TitlePageFields): string {
  const p = (text: string, align: "Center" | "Left" | "Right" = "Center") => `<Paragraph Alignment="${align}" FirstIndent="0.00" Leading="Regular" LeftIndent="1.00" RightIndent="7.50" SpaceBefore="0" Spacing="1" StartsNewPage="No"><Text>${escapeXml(text)}</Text></Paragraph>`;
  const blank = (count: number) => Array.from({ length: count }, () => p("")).join("");
  const lines = [blank(17), ...(fields.title ?? "").split("\n").map((line) => p(line)), blank(3),
    ...titleCreditBlock(fields).map((line) => p(line)),
    blank(16), ...(fields.contact ?? "").split("\n").filter(Boolean).map((line) => p(line, "Left")), ...(fields.draftDate ? fields.draftDate.split("\n").map((line) => p(line, "Right")) : [])];
  return `<TitlePage><Content>${lines.join("")}</Content></TitlePage>`;
}
