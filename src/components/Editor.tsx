import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { wordCount } from "../lib/screenplay";
import { elementSpecs, lockPages, paginate } from "../lib/pagination";
import { applyRevisionMarks, clearRevisionMarks, nextRevisionSet, revisionMarkFor, revisionSetById } from "../lib/revisions";
import { ReportsDialog } from "./ReportsDialog";
import { TitlePageDialog } from "./TitlePageDialog";
import { RichLine, type RichLineHandle } from "./RichLine";
import { autoCapitalise, replaceRange, splitFormatted, visibleLength, visibleText, type Style } from "../lib/rich-text";
import { IndexCards, Navigator } from "./Navigator";
import { BeatBoard } from "./BeatBoard";
import { moveScene, sceneIndex, type SceneRow } from "../lib/scene-index";
import { automaticContinued, autocompleteSuggestions, displaySceneNumber, getAutocompleteContext, removeSceneNumbers, renderedCharacterCue, synchroniseSceneMetadata } from "../lib/screenplay-production";
import {
  COMMON_TRANSITIONS, ELEMENT_LABELS, SCENE_PREFIXES, TIMES_OF_DAY, applyEnter, applyTab, collectKnownCharacters,
  collectSceneLocations, createElement, getNextElementType, getTabElementType, normalizeElementText, normalizedCursorPosition, parseCharacter,
  parseFountain, screenplayPasteElements, serializeFountain, updateElementText,
  type EditResult, type ScreenplayDocument, type ScreenplayElement, type ScreenplayElementType,
} from "../lib/screenplay-elements";
import { migrateProjectData, type AppSettings, type Beat, type ExportFormat, type ProjectData, type ProjectPayload, type RecentProject, type ScreenplaySettings, type SmartTypeLists, type ToolbarPrefs } from "../types";
import { ScreenplaySettingsDialog } from "./ScreenplaySettingsDialog";
import { ExportDialog } from "./ExportDialog";
import { MenuBar, matchesShortcut, shortcutItems, type Menu, type MenuEntry } from "./MenuBar";
import { Ruler, SELECTABLE_TYPES, StatusBar, Toolbar, ZOOMS } from "./EditorChrome";
import { ConfirmDialog, Modal, PromptDialog } from "./dialogs/Modal";
import { FindDialog, GoToDialog } from "./dialogs/EditDialogs";
import { ElementsDialog, FontDialog } from "./dialogs/FormatDialogs";
import { BookmarksDialog, HeaderFooterDialog, MacrosDialog, MoresContinuedsDialog, PageLayoutDialog, ScriptNotesDialog, SendToScriptDialog, SmartTypeDialog } from "./dialogs/DocumentDialogs";
import { CustomizeDialog, FormatAssistantDialog, NamesDialog, OptionsDialog, ReformatDialog, ScriptCompareDialog, SpeechDialog, SpellingDialog, ThesaurusDialog, VoicesDialog } from "./dialogs/ToolsDialogs";
import { RevisionsDialog, SceneNumbersDialog } from "./dialogs/ProductionDialogs";
import { AboutDialog, HelpDialog, PrintPreviewDialog, SaveAsDialog, StationeryDialog } from "./dialogs/FileDialogs";
import { CollaboPanel } from "./CollaboPanel";
import { ScenePropertiesPanel } from "./ScenePropertiesPanel";
import { findAll, nextMatch, replaceAll, replaceMatch, type FindOptions } from "../lib/find";
import { exportScreenplay } from "../lib/exporters";
import { backupArchive, backupFileName } from "../lib/backup";
import { printPdf } from "../lib/print";
import { closeAppWindow, openExternal, platform, saveFileAs, setWindowTitle, toggleFullscreen } from "../platform";
import type { Stationery } from "../lib/stationery";
import { CollabSession, applyPatch, diffElements, sessionCode, type ChatMessage, type CollabMessage, type Participant } from "../lib/collab";
import type { SpeechLine } from "../lib/speech";
import { CHARACTER_EXTENSIONS } from "../lib/screenplay-production";

const SHORTCUT_TYPES: Record<string, ScreenplayElementType> = { "1": "scene-heading", "2": "action", "3": "character", "4": "parenthetical", "5": "dialogue", "6": "transition", "7": "shot", "0": "general" };
const DEFAULT_TOOLBAR: ToolbarPrefs = { showToolbar: true, showRuler: true, showStatusBar: true, hidden: [] };

interface History { past: ScreenplayDocument[]; future: ScreenplayDocument[] }
interface FocusRequest { index: number; cursor: number; end?: number }
interface Suggestion { value: string; type: "character" | "character-extension" | "scene-heading"; category: string }
type Confirm = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm(): void };
type Prompt = { title: string; label: string; initial?: string; confirmLabel?: string; validate?(value: string): string | undefined; onSubmit(value: string): void };
type DialogId = "find" | "goto" | "elements" | "font" | "pageLayout" | "headerFooter" | "mores" | "titlePage" | "smartType" | "macros" | "bookmarks" | "scriptNotes" | "sendToScript"
  | "spelling" | "thesaurus" | "speech" | "voices" | "names" | "reformat" | "formatAssistant" | "compare" | "customize" | "options" | "sceneNumbers" | "revisions"
  | "stationery" | "saveAs" | "printPreview" | "about" | "help" | "shortcuts" | "export" | "reports" | "screenplaySettings";

function cloneDocument(value: ScreenplayDocument): ScreenplayDocument { return structuredClone(value); }
const newId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface EditorProps {
  project: ProjectPayload; content: string; dirty: boolean; saving: boolean; message: string;
  onChange(value: string): void; onProjectDataChange(value: ProjectData): void; onSave(): void; onHome(): void; onReveal(): void;
  onExported(entry: { format: ExportFormat; path: string; exportedAt: string }): void;
  settings?: AppSettings; onSettingsChange?(settings: AppSettings): Promise<void> | void; recents?: RecentProject[];
  onNew?(): void; onNewFromTemplate?(template: Stationery): void; onOpen?(): void; onOpenRecent?(path: string): void;
  onSaveAs?(title: string, folder: string, screenplay: string, projectData: ProjectData): Promise<void>; onRevert?(): void; onExit?(): void;
  onJoinSession?(code: string): void; joinCode?: string;
}

export function Editor(props: EditorProps) {
  const { project, content, dirty, saving, message, onChange, onProjectDataChange, onSave, onHome, onExported } = props;
  const settings: AppSettings = props.settings ?? { defaultProjectFolder: "", defaultAuthor: "", theme: "system", autosaveSeconds: 5, googleClientId: "", driveSyncEnabled: false };
  const toolbarPrefs = { ...DEFAULT_TOOLBAR, ...settings.toolbar };
  const initial = useRef<ReturnType<typeof synchroniseSceneMetadata> | null>(null);
  if (!initial.current) initial.current = synchroniseSceneMetadata(parseFountain(content), migrateProjectData(project.projectData));
  const [document, setDocument] = useState<ScreenplayDocument>(() => initial.current!.document);
  const [projectData, setProjectData] = useState<ProjectData>(() => initial.current!.projectData);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [autocompleteOpen, setAutocompleteOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [reportTab, setReportTab] = useState<"Scenes" | "Characters" | "Locations" | "Summary">("Scenes");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [view, setView] = useState<"script" | "cards" | "beats">("script");
  const [split, setSplit] = useState<"none" | "vertical" | "horizontal">("none");
  const [splitPane, setSplitPane] = useState<"cards" | "beats">("cards");
  const [showNavigator, setShowNavigator] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(settings.zoom ?? 100);
  const [keys, setKeys] = useState({ caps: false, num: false });
  const [notice, setNoticeText] = useState("");
  const [speaking, setSpeaking] = useState<SpeechLine | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const textareas = useRef(new Map<string, RichLineHandle>());
  const registrations = useRef(new Map<string, (handle: RichLineHandle | null) => void>());
  const paper = useRef<HTMLDivElement>(null);
  const registerLine = (id: string) => {
    let callback = registrations.current.get(id);
    if (!callback) { callback = (handle) => { if (handle) textareas.current.set(id, handle); else { textareas.current.delete(id); registrations.current.delete(id); } }; registrations.current.set(id, callback); }
    return callback;
  };
  const focusRequest = useRef<FocusRequest | null>(null);
  const history = useRef<History>({ past: [], future: [] });
  const lastSerialized = useRef(content);
  const noticeTimer = useRef<number | undefined>(undefined);
  const setNotice = (text: string, ms = 4000) => { setNoticeText(text); window.clearTimeout(noticeTimer.current); if (text) noticeTimer.current = window.setTimeout(() => setNoticeText(""), ms); };

  // Co-writing session
  const session = useRef<CollabSession | null>(null);
  const [collab, setCollab] = useState<{ code: string; host: boolean; status: string; detail?: string } | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [collabPanel, setCollabPanel] = useState(false);

  useEffect(() => {
    const fountain = serializeFountain(document);
    const storedProjectData = migrateProjectData(project.projectData);
    if (JSON.stringify(projectData) !== JSON.stringify(storedProjectData)) onProjectDataChange(projectData);
    const hasPersistentScenes = document.elements.some((element) => element.type === "scene-heading" && Boolean(element.text && element.metadata?.sceneId));
    if (hasPersistentScenes && fountain !== content) { lastSerialized.current = fountain; onChange(fountain); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (content === lastSerialized.current) return;
    const prepared = synchroniseSceneMetadata(parseFountain(content), projectData); setDocument(prepared.document); setProjectData(prepared.projectData); setActiveIndex(0);
    history.current = { past: [], future: [] }; lastSerialized.current = content;
  }, [content]);

  useEffect(() => {
    const request = focusRequest.current; if (!request) return;
    const element = document.elements[request.index]; const area = element && textareas.current.get(element.id);
    if (area) { area.focus(); area.setSelectionRange(request.cursor, request.end ?? request.cursor); area.scrollIntoView?.({ block: "nearest" }); }
    focusRequest.current = null;
  }, [document]);

  const commitDocument = (next: ScreenplayDocument, focus?: FocusRequest, record = true, data: ProjectData = projectData, broadcast = true) => {
    if (record) { history.current.past.push(cloneDocument(document)); history.current.past = history.current.past.slice(-150); history.current.future = []; }
    const revisions = data.screenplaySettings.revisions;
    if (record && revisions.enabled && revisions.activeSetId && next.elements !== document.elements) next = { ...next, elements: applyRevisionMarks(document.elements, next.elements, revisions.activeSetId) };
    const prepared = synchroniseSceneMetadata(next, data);
    setDocument(prepared.document); setProjectData(prepared.projectData); onProjectDataChange(prepared.projectData);
    if (focus) { setActiveIndex(focus.index); focusRequest.current = focus; }
    const fountain = serializeFountain(prepared.document); lastSerialized.current = fountain; onChange(fountain);
    if (broadcast && session.current && collab?.status === "connected") {
      const patch = diffElements(document.elements, prepared.document.elements);
      if (patch) session.current.send({ kind: "patch", from: session.current.clientId, patch });
      if (JSON.stringify(prepared.projectData) !== JSON.stringify(projectData)) session.current.send({ kind: "data", from: session.current.clientId, projectData: prepared.projectData });
    }
  };
  const commitResult = (result: EditResult) => commitDocument({ ...document, elements: result.elements }, { index: result.activeIndex, cursor: result.cursorPosition });
  const commitData = (data: ProjectData, record = true) => commitDocument(document, undefined, record, data);
  const commitElements = (elements: ScreenplayElement[], focus?: FocusRequest) => commitDocument({ ...document, elements }, focus);

  const undo = () => {
    const previous = history.current.past.pop(); if (!previous) return;
    history.current.future.push(cloneDocument(document));
    const nextIndex = Math.min(activeIndex, previous.elements.length - 1);
    commitDocument(previous, { index: nextIndex, cursor: visibleLength(previous.elements[nextIndex]?.text ?? "") }, false);
  };
  const redo = () => {
    const next = history.current.future.pop(); if (!next) return;
    history.current.past.push(cloneDocument(document));
    const nextIndex = Math.min(activeIndex, next.elements.length - 1);
    commitDocument(next, { index: nextIndex, cursor: visibleLength(next.elements[nextIndex]?.text ?? "") }, false);
  };

  const active = document.elements[activeIndex] ?? document.elements[0];
  const knownCharacters = useMemo(() => [...new Set([...collectKnownCharacters(document.elements), ...(projectData.smartType?.characters ?? [])])], [document.elements, projectData.smartType]);
  const sceneLocations = useMemo(() => [...new Set([...collectSceneLocations(document.elements), ...(projectData.smartType?.locations ?? [])])], [document.elements, projectData.smartType]);
  const fountain = useMemo(() => serializeFountain(document), [document]);
  const deferredDocument = useDeferredValue(document);
  const specs = useMemo(() => elementSpecs(projectData), [projectData]);
  const layout = useMemo(() => paginate(deferredDocument, projectData, {
    lockedPages: projectData.pageLock.locked ? projectData.pageLock.pageStarts : undefined,
    sceneNumber: (element) => projectData.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId)?.number,
    revisionMark: (element) => revisionMarkFor(element, projectData),
  }), [deferredDocument, projectData]);
  const pages = layout.pages.length;
  const pageOf = (index: number): number | undefined => { for (let i = index; i >= 0; i--) { const page = layout.elementPage.get(document.elements[i]?.id); if (page) return page; } return undefined; };
  const activePage = pageOf(activeIndex) ?? 1;
  const focusElement = (index: number, cursor = 0, end?: number) => { if (index < 0 || index >= document.elements.length) return; setView("script"); setActiveIndex(index); focusRequest.current = { index, cursor, end }; setDocument({ ...document }); };
  const goToPage = (target: number) => {
    const page = layout.pages[target - 1]; if (!page) return;
    const index = document.elements.findIndex((element) => element.id === page.elementIds[0]); if (index >= 0) focusElement(index);
  };
  const pageView = projectData.screenplaySettings.pagination.viewMode === "page";
  const sceneRows = useMemo(() => sceneIndex(deferredDocument, projectData, layout), [deferredDocument, projectData, layout]);
  const jumpToScene = (row: SceneRow) => { const index = document.elements.findIndex((element) => element.metadata?.sceneId === row.sceneId); focusElement(index); };
  const reorderScene = (sceneId: string, beforeSceneId: string | null) => {
    const moved = moveScene(document, sceneId, beforeSceneId); if (moved === document) return;
    const index = moved.elements.findIndex((element) => element.metadata?.sceneId === sceneId);
    commitDocument(moved, view === "script" ? { index, cursor: 0 } : undefined);
  };
  const updateScene = (sceneId: string, patch: Partial<ProjectData["scenes"][number]>) => commitData({ ...projectData, scenes: projectData.scenes.map((scene) => scene.sceneId === sceneId ? { ...scene, ...patch } : scene) });
  const updateBeats = (beats: Beat[]) => commitDocument(document, undefined, false, { ...projectData, beats });
  const sceneRangeOf = (index: number): [number, number] => {
    let start = index; while (start > 0 && document.elements[start].type !== "scene-heading") start--;
    if (document.elements[start]?.type !== "scene-heading") start = 0;
    let end = start + 1; while (end < document.elements.length && document.elements[end].type !== "scene-heading") end++;
    return [start, end];
  };
  const insertScenesFromBeats = (beats: Beat[]) => {
    const [, end] = sceneRangeOf(activeIndex);
    const blankStart = document.elements.length === 1 && !document.elements[0].text.trim();
    const created = beats.flatMap((beat) => [createElement("scene-heading", "INT. LOCATION - DAY"), createElement("action", beat.body ?? beat.title)]);
    const elements = blankStart ? created : [...document.elements.slice(0, end), ...created, ...document.elements.slice(end)];
    const prepared = synchroniseSceneMetadata({ ...document, elements }, projectData);
    const headingIds = created.filter((element) => element.type === "scene-heading").map((element) => element.id);
    const sceneIds = headingIds.map((id) => prepared.document.elements.find((element) => element.id === id)?.metadata?.sceneId);
    const data = { ...prepared.projectData,
      scenes: prepared.projectData.scenes.map((scene) => { const i = sceneIds.indexOf(scene.sceneId); return i >= 0 ? { ...scene, summary: beats[i].title, colour: beats[i].colour } : scene; }),
      beats: projectData.beats.map((item) => { const i = beats.findIndex((beat) => beat.id === item.id); return i >= 0 && sceneIds[i] ? { ...item, sceneIds: [...new Set([...(item.sceneIds ?? []), sceneIds[i]!])] } : item; }) };
    setView("script");
    commitDocument(prepared.document, { index: prepared.document.elements.findIndex((element) => element.id === headingIds[0]), cursor: 0 }, true, data);
  };

  const changeType = (type: ScreenplayElementType, index = activeIndex) => {
    const range = selection ?? [index, index];
    const elements = document.elements.map((current, i) => {
      if (i < range[0] || i > range[1] || current.type === "page-break") return current;
      const text = normalizeElementText(type, current.text); const parsed = parseCharacter(text);
      return { ...current, type, text, metadata: type === "character" ? { ...current.metadata, characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions } : current.metadata };
    });
    const text = elements[index]?.text ?? "";
    commitDocument({ ...document, elements }, { index, cursor: type === "parenthetical" ? Math.max(1, text.length - 1) : visibleLength(text) });
    setPaletteOpen(false); setContextMenu(null);
  };

  const updateSceneNumber = (index: number, sceneNumber: string) => {
    const elements = [...document.elements]; const current = elements[index];
    elements[index] = { ...current, metadata: { ...current.metadata, sceneNumber: sceneNumber || undefined } };
    const scenes = projectData.scenes.map((scene) => scene.sceneId === current.metadata?.sceneId ? { ...scene, number: sceneNumber || undefined } : scene);
    commitDocument({ ...document, elements }, { index, cursor: current.text.length }, true, { ...projectData, scenes });
  };

  const onTextChange = (index: number, input: string, cursor: number) => {
    const current = document.elements[index];
    const raw = projectData.screenplaySettings.capitalisation.sentences !== false && current && ["action", "dialogue", "general"].includes(current.type)
      ? autoCapitalise(current.text, input, cursor) : input;
    const result = updateElementText(document.elements, index, raw);
    result.cursorPosition = normalizedCursorPosition(result.elements[index].type, raw, cursor);
    setAutocompleteOpen(true); setSuggestionIndex(-1); setSelection(null); commitResult(result);
  };

  const removeOrMerge = (index: number, cursor: number) => {
    if (cursor !== 0 || index === 0) return false;
    const elements = [...document.elements]; const current = elements[index]; const previous = elements[index - 1];
    if (!current.text) { elements.splice(index, 1); commitDocument({ ...document, elements }, { index: index - 1, cursor: visibleLength(previous.text) }); return true; }
    const compatible = current.type === previous.type && ["action", "dialogue", "general"].includes(current.type);
    if (compatible) {
      const joinAt = visibleLength(previous.text) + (previous.text ? 1 : 0); elements[index - 1] = { ...previous, text: `${previous.text}${previous.text ? " " : ""}${current.text}` }; elements.splice(index, 1);
      commitDocument({ ...document, elements }, { index: index - 1, cursor: joinAt }); return true;
    }
    focusElement(index - 1, visibleLength(previous.text)); return true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number, area: RichLineHandle) => {
    setKeys({ caps: event.getModifierState?.("CapsLock") ?? false, num: event.getModifierState?.("NumLock") ?? false });
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && SHORTCUT_TYPES[event.key]) { event.preventDefault(); changeType(SHORTCUT_TYPES[event.key], index); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setActiveIndex(index); setPaletteOpen(true); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (event.key === "Escape" && suggestions.length) { event.preventDefault(); setAutocompleteOpen(false); setSuggestionIndex(-1); return; }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
      event.preventDefault();
      setSuggestionIndex((current) => event.key === "ArrowDown" ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }
    const explicitlyAcceptingSuggestion = suggestionIndex >= 0 || (event.key === "Tab" && Boolean(area.value.trim())) || (event.key === "Enter" && getAutocompleteContext(document.elements[index]) === "character-extension");
    if ((event.key === "Enter" || event.key === "Tab") && suggestions.length && explicitlyAcceptingSuggestion) { event.preventDefault(); chooseSuggestion(suggestions[suggestionIndex >= 0 ? suggestionIndex : 0]); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = applyEnter(document.elements, index, area.selectionStart);
      if (event.shiftKey && document.elements[index].type === "dialogue" && result.elements[result.activeIndex]) result.elements[result.activeIndex].type = "dialogue";
      commitResult(result); return;
    }
    if (event.key === "Tab") { event.preventDefault(); commitResult(applyTab(document.elements, index, event.shiftKey)); return; }
    if (event.key === "Backspace" && area.selectionEnd === 0 && removeOrMerge(index, area.selectionStart)) event.preventDefault();
  };

  const onPaste = (index: number, pasted: string, area: RichLineHandle) => {
    if (!/\r?\n/u.test(pasted.trim())) return false;
    const pastedElements = screenplayPasteElements(pasted.replace(/\r\n?/gu, "\n"));
    const elements = [...document.elements]; const current = elements[index];
    const [before, after] = splitFormatted(current.text, area.selectionStart);
    const replacement = [...(before.trim() ? [{ ...current, text: before }] : []), ...pastedElements, ...(after.trim() ? [createElement(current.type, after.trim())] : [])];
    elements.splice(index, 1, ...replacement);
    const target = index + replacement.length - 1 - (after.trim() ? 1 : 0);
    commitDocument({ ...document, elements }, { index: target, cursor: visibleLength(elements[target].text) });
    return true;
  };

  const activeHandle = () => (active ? textareas.current.get(active.id) : undefined);
  const toggleFormat = (style: Style) => activeHandle()?.toggle(style);
  const onFormat = (index: number, next: string, start: number, end: number) => {
    const elements = [...document.elements]; elements[index] = { ...elements[index], text: next };
    commitDocument({ ...document, elements }, { index, cursor: start, end });
  };

  // ---- Block (multi-paragraph) selection: Select All, Select Scene, Shift+click ----
  const selectionRange = (): [number, number] => selection ?? [activeIndex, activeIndex];
  const selectionFountain = () => { const [a, b] = selectionRange(); return serializeFountain({ preamble: "", elements: document.elements.slice(a, b + 1) }).trim(); };
  const deleteSelection = () => {
    const [a, b] = selectionRange();
    let elements = [...document.elements.slice(0, a), ...document.elements.slice(b + 1)];
    if (!elements.length) elements = [createElement("scene-heading")];
    setSelection(null); commitElements(elements, { index: Math.min(a, elements.length - 1), cursor: 0 });
  };
  const writeClipboard = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { setNotice("Couldn't reach the clipboard. Use Ctrl+C instead."); return false; } };
  const clipboardAction = async (action: "cut" | "copy" | "paste" | "selectAll") => {
    setContextMenu(null);
    if (selection && action !== "paste") {
      if (action === "selectAll") { setSelection([0, document.elements.length - 1]); return; }
      if (await writeClipboard(selectionFountain()) && action === "cut") deleteSelection();
      return;
    }
    const handle = activeHandle(); if (!handle) return;
    handle.focus();
    if (action === "selectAll") { selectAll(); return; }
    if (action !== "paste") { window.document.execCommand(action); return; }
    try {
      const text = await navigator.clipboard.readText();
      if (selection) deleteSelection();
      if (text && !onPaste(activeIndex, text, handle)) handle.insertText(text);
    } catch { setNotice("Press Ctrl+V to paste — this window wasn't given clipboard access."); }
  };
  const selectAll = () => { setSelection([0, document.elements.length - 1]); paper.current?.focus(); setNotice("Whole script selected — Copy, Cut, Delete, Reformat or Mark Revised apply to all of it.", 3000); };
  const selectScene = () => { const [a, b] = sceneRangeOf(activeIndex); setSelection([a, b - 1]); paper.current?.focus(); };
  const clear = () => {
    if (selection) { deleteSelection(); return; }
    const handle = activeHandle(); if (!handle) return;
    if (handle.selectionStart === handle.selectionEnd) return;
    handle.focus(); window.document.execCommand("delete");
  };

  const suggestions = useMemo(() => {
    if (!active || !autocompleteOpen) return [] as Suggestion[];
    const context = getAutocompleteContext(active);
    if (context === "none" || context === "transition" || context === "shot") return [];
    const query = active.text.trim().toLocaleUpperCase("en-GB");
    if (context === "scene-location" || context === "scene-time") {
      const fragment = context === "scene-time" ? (query.split(" - ").at(-1) ?? "") : query.replace(/^[A-Z./]+\s*/u, "");
      const values = context === "scene-time" ? [...new Set([...TIMES_OF_DAY, ...(projectData.smartType?.times ?? [])])] : sceneLocations;
      return values.filter((value) => value.startsWith(fragment) && value !== fragment).slice(0, 6).map((value) => ({ value, type: "scene-heading" as const, category: context === "scene-time" ? "Times of Day" : "Locations" }));
    }
    return autocompleteSuggestions(active, knownCharacters, [...new Set([...SCENE_PREFIXES, ...(projectData.smartType?.sceneIntros ?? [])])]);
  }, [active, autocompleteOpen, knownCharacters, sceneLocations, projectData.smartType]);

  const chooseSuggestion = (suggestion: Suggestion) => {
    if (!active) return;
    const value = suggestion.value;
    let text = value; const type: ScreenplayElementType = active.type === "action" && suggestion.type !== "character-extension" ? suggestion.type : active.type;
    if (suggestion.type === "character-extension") {
      const open = active.text.lastIndexOf("(");
      const beforeOpen = active.text.slice(0, open).trimEnd();
      const compact = value === "VOICE OVER" ? "V.O." : value === "OFF SCREEN" ? "O.S." : value;
      const existing = parseCharacter(beforeOpen).extensions.map((extension) => extension.replace(/[’`]/gu, "'").toLocaleUpperCase("en-GB"));
      text = existing.includes(compact.replace(/[’`]/gu, "'").toLocaleUpperCase("en-GB")) ? beforeOpen : `${beforeOpen} (${compact})`;
    }
    if (type === "scene-heading") {
      const current = active.text;
      const prefixes = [...new Set([...SCENE_PREFIXES, ...(projectData.smartType?.sceneIntros ?? [])])];
      if (prefixes.includes(value)) text = `${value} `;
      else if (TIMES_OF_DAY.includes(value) || projectData.smartType?.times.includes(value)) text = `${current.replace(/\s+-\s+[^-]*$/u, "")} - ${value}`;
      else text = `${current.match(prefixes.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"))?.[0] ?? "INT."} ${value}`;
    }
    const parsed = parseCharacter(text);
    const elements = [...document.elements]; elements[activeIndex] = { ...active, type, text: normalizeElementText(type, text), metadata: type === "character" ? { ...active.metadata, characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions } : active.metadata };
    setAutocompleteOpen(false); setSuggestionIndex(-1); commitDocument({ ...document, elements }, { index: activeIndex, cursor: elements[activeIndex].text.length });
  };

  const withSettings = (patch: Partial<ScreenplaySettings>, data: ProjectData = projectData): ProjectData => ({ ...data, screenplaySettings: { ...data.screenplaySettings, ...patch } });
  const saveScreenplaySettings = (value: ScreenplaySettings) => { commitData(migrateProjectData({ ...projectData, screenplaySettings: value })); setDialog(null); };
  const keepFocus = () => ({ index: activeIndex, cursor: visibleLength(active?.text ?? "") });

  // ---- Scene numbers, omit, revisions, locking ----
  const activeScene = [...document.elements.slice(0, activeIndex + 1)].reverse().find((element) => element.type === "scene-heading");
  const activeSceneMeta = activeScene ? projectData.scenes.find((scene) => scene.sceneId === activeScene.metadata?.sceneId) : undefined;
  const activeSceneRow = sceneRows.find((row) => row.sceneId === activeScene?.metadata?.sceneId);
  const activeSceneNumber = activeScene ? displaySceneNumber(activeScene, projectData) : undefined;
  const lockSceneNumbers = () => {
    const numbered = synchroniseSceneMetadata(document, withSettings({ sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, enabled: true, mode: "automatic" } }));
    commitDocument(numbered.document, keepFocus(), true, { ...numbered.projectData, screenplaySettings: { ...numbered.projectData.screenplaySettings, sceneNumbers: { ...numbered.projectData.screenplaySettings.sceneNumbers, mode: "locked" } }, scenes: numbered.projectData.scenes.map((scene) => ({ ...scene, locked: true, numberingMode: "locked" as const })) });
    setNotice("Scene numbers locked. New scenes get A-numbers (e.g. 12A).");
  };
  const unlockSceneNumbers = () => setConfirm({ title: "Unlock Scene Numbers", message: "Unlocking lets a later renumber change numbers the production already uses. Continue?", confirmLabel: "Unlock", onConfirm: () => commitData({ ...withSettings({ sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, mode: "manual" } }), scenes: projectData.scenes.map((scene) => ({ ...scene, locked: false, numberingMode: "manual" as const })) }) });
  const removeNumbers = () => setConfirm({ title: "Remove Scene Numbers", message: "Remove all scene numbers from this script? A copy of the script is kept in the project's production snapshots.", confirmLabel: "Remove", danger: true, onConfirm: () => { const removed = removeSceneNumbers(document, projectData); commitDocument(removed.document, keepFocus(), true, removed.projectData); } });
  const applySceneNumbers = (value: ScreenplaySettings["sceneNumbers"], renumber: boolean) => {
    setDialog(null);
    if (!renumber) { commitData(withSettings({ sceneNumbers: { ...value, mode: "automatic" } })); lockSceneNumbers(); return; }
    const run = () => commitData({ ...withSettings({ sceneNumbers: { ...value, mode: "automatic" } }), scenes: projectData.scenes.map((scene) => ({ ...scene, number: undefined, locked: false })) });
    if (projectData.screenplaySettings.sceneNumbers.mode === "locked") setConfirm({ title: "Renumber Scenes", message: "Scene numbers are locked. Renumbering replaces numbers the production may already use. Continue?", confirmLabel: "Renumber", danger: true, onConfirm: run });
    else run();
  };
  const editSceneNumber = () => {
    if (!activeScene) { setNotice("Put the cursor in a scene first."); return; }
    setPrompt({ title: "Edit Scene Number", label: "Scene number (e.g. 14 or 14A)", initial: activeSceneMeta?.number ?? "", validate: (raw) => {
      const value = raw.trim().toLocaleUpperCase("en-GB");
      if (!/^\d+[A-Z]*$/u.test(value)) return "Use a number with an optional letter suffix, such as 14A.";
      if (projectData.scenes.some((scene) => scene.sceneId !== activeScene.metadata?.sceneId && scene.number === value)) return `Scene number ${value} is already in use.`;
      return undefined;
    }, onSubmit: (raw) => {
      const value = raw.trim().toLocaleUpperCase("en-GB");
      commitData({ ...withSettings({ sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, enabled: true, mode: "manual" } }), scenes: projectData.scenes.map((scene) => scene.sceneId === activeScene.metadata?.sceneId ? { ...scene, number: value, locked: false, numberingMode: "manual" as const } : scene) });
      setPrompt(null);
    } });
  };
  const toggleOmitScene = () => {
    if (!activeSceneMeta) { setNotice("Put the cursor in a scene first."); return; }
    const omitted = !activeSceneMeta.omitted;
    const run = () => updateScene(activeSceneMeta.sceneId, { omitted, status: omitted ? "Omitted" : "Draft" });
    if (omitted) setConfirm({ title: "Omit Scene", message: "The scene will print as OMITTED with its number kept. Its text stays in the project and can be restored.", confirmLabel: "Omit Scene", onConfirm: run }); else run();
  };
  const revisionSettings = projectData.screenplaySettings.revisions;
  const activeRevision = revisionSetById(projectData, revisionSettings.activeSetId);
  const ensureRevisionSet = (data: ProjectData = projectData): [ProjectData, string] => {
    const existing = revisionSetById(data, data.screenplaySettings.revisions.activeSetId);
    if (existing) return [data, existing.id];
    const set = nextRevisionSet(data.revisionSets);
    return [withSettings({ revisions: { ...data.screenplaySettings.revisions, activeSetId: set.id } }, { ...data, revisionSets: [...data.revisionSets, set] }), set.id];
  };
  const toggleRevisionMode = () => {
    const [data] = revisionSettings.enabled ? [projectData] : ensureRevisionSet();
    commitDocument(document, keepFocus(), false, withSettings({ revisions: { ...data.screenplaySettings.revisions, enabled: !revisionSettings.enabled } }, data));
    setNotice(revisionSettings.enabled ? "Revision mode off." : `Revision mode on: changes are marked with the ${revisionSetById(data, data.screenplaySettings.revisions.activeSetId)?.name} set.`);
  };
  const markRevised = () => {
    const [data, setId] = ensureRevisionSet(); const [a, b] = selectionRange();
    commitDocument({ ...document, elements: document.elements.map((element, i) => i >= a && i <= b && element.text.trim() ? { ...element, metadata: { ...element.metadata, revisionSet: setId } } : element) }, keepFocus(), true, data);
  };
  const clearRevised = () => {
    const [a, b] = selectionRange();
    commitElements([...document.elements.slice(0, a), ...clearRevisionMarks(document.elements.slice(a, b + 1)), ...document.elements.slice(b + 1)], keepFocus());
  };
  const lockPagesNow = (relabel = false) => {
    const unlocked = paginate(document, { ...projectData, pageLock: { locked: false, pageStarts: [] } }, { sceneNumber: (element) => projectData.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId)?.number });
    const starts = lockPages(unlocked);
    const anchorIds = new Set(starts.map((start) => start.elementId));
    const elements = document.elements.map((element) => anchorIds.has(element.id) ? { ...element, metadata: { ...element.metadata, anchor: true } } : element);
    commitDocument({ ...document, elements }, keepFocus(), true, { ...projectData, pageLock: { locked: true, lockedAt: new Date().toISOString(), pageStarts: starts } });
    setNotice(relabel ? "A-pages folded into the page sequence and pages re-locked." : `Pages locked (${starts.length}). New material will create A-pages.`);
  };
  const unlockAllPages = () => setConfirm({ title: "Unlock All Pages", message: "The script will reflow and page numbers will no longer match pages already issued.", confirmLabel: "Unlock All Pages", danger: true, onConfirm: () => commitData({ ...projectData, pageLock: { locked: false, pageStarts: [] } }) });
  const unlockAPages = () => setConfirm({ title: "Unlock \"A\" Pages", message: "A-pages (12A, 12B…) will be folded into ordinary page numbers and pages re-locked from here. Pages already issued may change number.", confirmLabel: "Unlock A Pages", onConfirm: () => lockPagesNow(true) });

  // ---- Format ----
  const setParagraphFormat = (patch: { align?: "left" | "center" | "right" | null; spacing?: 1 | 1.5 | 2 | null; spaceBefore?: number | null }) => {
    const [a, b] = selectionRange();
    commitElements(document.elements.map((element, i) => {
      if (i < a || i > b) return element;
      const format = { ...element.metadata?.format };
      for (const [key, value] of Object.entries(patch)) { if (value === null) delete format[key as keyof typeof format]; else (format as Record<string, unknown>)[key] = value; }
      return { ...element, metadata: { ...element.metadata, format: Object.keys(format).length ? format : undefined } };
    }), keepFocus());
  };
  const setLeading = (linesAdjust: number) => commitData({ ...projectData, pageLayout: { top: 1, bottom: 1, headerFromTop: 0.5, footerFromBottom: 0.5, ...projectData.pageLayout, linesAdjust } });
  const insertAfterActive = (created: ScreenplayElement[], focusOffset = created.length - 1) => {
    const elements = [...document.elements.slice(0, activeIndex + 1), ...created, ...document.elements.slice(activeIndex + 1)];
    commitElements(elements, { index: activeIndex + 1 + focusOffset, cursor: 0 });
  };
  const insertPageBreak = () => insertAfterActive([createElement("page-break"), createElement("action")]);
  const speechBlock = (index: number): [number, number] | null => {
    let start = index; while (start > 0 && ["dialogue", "parenthetical"].includes(document.elements[start].type)) start--;
    if (document.elements[start]?.type !== "character") return null;
    let end = start + 1; while (end < document.elements.length && ["dialogue", "parenthetical"].includes(document.elements[end].type)) end++;
    return [start, end];
  };
  const toggleDualDialogue = () => {
    const current = speechBlock(activeIndex);
    if (!current) { setNotice("Put the cursor in the second speech of the pair (a character cue or its dialogue)."); return; }
    const group = document.elements[current[0]].metadata?.dualDialogueGroupId;
    if (group) { commitElements(document.elements.map((element) => element.metadata?.dualDialogueGroupId === group ? { ...element, metadata: { ...element.metadata, dualDialogueGroupId: undefined } } : element), keepFocus()); setNotice("Dual dialogue removed."); return; }
    const previous = current[0] > 0 ? speechBlock(current[0] - 1) : null;
    if (!previous || previous[1] !== current[0]) { setNotice("Dual dialogue needs two speeches directly one after the other."); return; }
    const id = `dual-${newId()}`;
    commitElements(document.elements.map((element, i) => (i >= previous[0] && i < current[1]) ? { ...element, metadata: { ...element.metadata, dualDialogueGroupId: id } } : element), keepFocus());
    setNotice("Dual dialogue: these two speeches print side by side.");
  };

  // ---- Document ----
  const collectedSmartType = (): SmartTypeLists => ({
    characters: collectKnownCharacters(document.elements), extensions: CHARACTER_EXTENSIONS, sceneIntros: SCENE_PREFIXES, locations: collectSceneLocations(document.elements),
    times: [...new Set(document.elements.filter((e) => e.type === "scene-heading").map((e) => e.text.split(/\s+-\s+/u).at(-1)?.trim() ?? "").filter(Boolean))], transitions: COMMON_TRANSITIONS,
  });
  const insertBookmark = () => setPrompt({ title: "Insert Bookmark", label: "Bookmark name", initial: visibleText(active?.text ?? "").slice(0, 30) || "Bookmark", onSubmit: (name) => {
    const id = newId();
    const elements = document.elements.map((element, i) => i === activeIndex ? { ...element, metadata: { ...element.metadata, bookmark: id, anchor: true } } : element);
    commitDocument({ ...document, elements }, keepFocus(), true, { ...projectData, bookmarks: [...(projectData.bookmarks ?? []), { id, name: name.trim() || "Bookmark", elementId: id, createdAt: new Date().toISOString() }] });
    setPrompt(null); setNotice(`Bookmark “${name}” added. Edit → Go To jumps back here.`);
  } });
  const goToBookmark = (bookmarkId: string) => { const index = document.elements.findIndex((element) => element.metadata?.bookmark === bookmarkId); if (index >= 0) focusElement(index); else setNotice("That bookmark's text was deleted."); };
  const insertNote = () => insertAfterActive([createElement("note", "")]);
  const insertLabel = () => setPrompt({ title: "Insert Label", label: "Label (doesn't print — e.g. ACT ONE, Midpoint)", onSubmit: (text) => { insertAfterActive([createElement("section", text.trim() || "Label")]); setPrompt(null); } });
  const insertNewScene = () => { const [, end] = sceneRangeOf(activeIndex); const heading = createElement("scene-heading", ""); const elements = [...document.elements.slice(0, end), heading, ...document.elements.slice(end)]; commitElements(elements, { index: end, cursor: 0 }); };
  const runMacro = (key: string) => {
    const macro = projectData.macros?.find((item) => item.key === key && item.text); if (!macro) return false;
    const handle = activeHandle();
    if (macro.elementType && active) changeType(macro.elementType as ScreenplayElementType);
    if (handle) { handle.focus(); handle.insertText(macro.text); }
    return true;
  };

  // ---- Find ----
  const findFrom = (options: FindOptions, backwards: boolean) => {
    const handle = activeHandle();
    const offset = handle ? (backwards ? handle.selectionStart : handle.selectionEnd) : 0;
    const match = nextMatch(findAll(document.elements, options), { index: activeIndex, offset: backwards ? offset : offset }, backwards);
    if (match) focusElement(match.index, match.start, match.end);
    return match;
  };
  const replaceCurrent = (options: FindOptions, replacement: string) => {
    const handle = activeHandle(); if (!handle) return false;
    const match = findAll(document.elements, options).find((m) => m.index === activeIndex && m.start === handle.selectionStart && m.end === handle.selectionEnd);
    if (!match) return false;
    commitElements(replaceMatch(document.elements, match, replacement), { index: match.index, cursor: match.start + replacement.length });
    return true;
  };
  const replaceEverywhere = (options: FindOptions, replacement: string) => { const result = replaceAll(document.elements, options, replacement); if (result.count) commitElements(result.elements, keepFocus()); return result.count; };
  const selectedWord = () => { const handle = activeHandle(); if (!handle) return ""; const text = handle.value; let { selectionStart: a, selectionEnd: b } = handle; if (a === b) { while (a > 0 && /[\p{L}\p{M}'’]/u.test(text[a - 1])) a--; while (b < text.length && /[\p{L}\p{M}'’]/u.test(text[b])) b++; } return text.slice(a, b).trim(); };
  const findSelection = () => {
    const handle = activeHandle(); const text = handle && handle.selectionStart !== handle.selectionEnd ? handle.value.slice(handle.selectionStart, handle.selectionEnd) : selectedWord();
    if (!text) { setDialog("find"); return; }
    setFindQuery(text);
    if (!findFrom({ query: text, matchCase: false, wholeWord: false }, false)) setNotice(`“${text}” wasn't found elsewhere.`);
  };
  const replaceSelectedWord = (word: string) => {
    const handle = activeHandle(); if (!handle || !active) return;
    let { selectionStart: a, selectionEnd: b } = handle; const text = handle.value;
    if (a === b) { while (a > 0 && /[\p{L}\p{M}'’]/u.test(text[a - 1])) a--; while (b < text.length && /[\p{L}\p{M}'’]/u.test(text[b])) b++; }
    commitElements(document.elements.map((element, i) => i === activeIndex ? { ...element, text: replaceRange(element.text, a, b, word) } : element), { index: activeIndex, cursor: a + word.length });
  };

  // ---- File ----
  const exportContext = (overrides: Partial<ScreenplaySettings["exportDefaults"]> = {}) => ({ project, document, projectData, options: { ...projectData.screenplaySettings.exportDefaults, includeRevisionMarks: revisionSettings.showMarks && projectData.revisionSets.length > 0, ...overrides } });
  const makePdf = async () => (await exportScreenplay("pdf", exportContext())).data as Uint8Array;
  const safeTitle = project.manifest.title.replace(/[<>:"/\\|?*]/gu, "").trim() || "Screenplay";
  const saveAsPdf = async () => {
    try { const path = await saveFileAs(`${safeTitle}.pdf`, await makePdf(), "PDF", ["pdf"]); if (path) { onExported({ format: "pdf", path, exportedAt: new Date().toISOString() }); setNotice(`Saved PDF to ${path}`); } }
    catch (reason) { setNotice(`The PDF couldn't be saved. ${reason instanceof Error ? reason.message : ""}`, 6000); }
  };
  const backup = async () => {
    try { const path = await saveFileAs(backupFileName(safeTitle), backupArchive(project.manifest, fountain, projectData), "ZIP archive", ["zip"]); if (path) setNotice(`Backup saved to ${path}`); }
    catch (reason) { setNotice(`The backup couldn't be saved. ${reason instanceof Error ? reason.message : ""}`, 6000); }
  };
  const print = async (bytes?: Uint8Array) => { setDialog(null); setNotice("Preparing pages for printing…", 20000); try { await printPdf(bytes ?? await makePdf()); setNotice(""); } catch (reason) { setNotice(`Printing failed. ${reason instanceof Error ? reason.message : ""}`, 6000); } };
  const email = async () => {
    try {
      const bytes = await makePdf();
      const file = new File([bytes as BlobPart], `${safeTitle}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: project.manifest.title }); return; }
      const path = await saveFileAs(`${safeTitle}.pdf`, bytes, "PDF", ["pdf"]); if (!path) return;
      await openExternal(`mailto:?subject=${encodeURIComponent(project.manifest.title)}&body=${encodeURIComponent(`Please find attached “${project.manifest.title}”.\n\n(The PDF is saved at ${path}; attach it to this email.)`)}`);
      setNotice(`PDF saved to ${path}. Attach it to the email that just opened.`, 8000);
    } catch (reason) { if ((reason as Error)?.name !== "AbortError") setNotice(`Couldn't prepare the email. ${reason instanceof Error ? reason.message : ""}`, 6000); }
  };
  const revert = () => setConfirm({ title: "Revert", message: "Discard all changes since you last saved and reload the saved script?", confirmLabel: "Revert", danger: true, onConfirm: () => props.onRevert?.() });
  const exit = async () => { if (!(await closeAppWindow().catch(() => false))) (props.onExit ?? onHome)(); };
  const leaveWith = (action: () => void) => { if (!dirty) { action(); return; } setConfirm({ title: "Unsaved changes", message: "Save your changes before leaving this script? (Your recovery copy stays available either way.)", confirmLabel: "Save and continue", onConfirm: () => { onSave(); window.setTimeout(action, 200); } }); };

  // ---- View ----
  const setViewMode = (mode: "page" | "continuous") => commitDocument(document, undefined, false, withSettings({ pagination: { ...projectData.screenplaySettings.pagination, viewMode: mode } }));
  const zoomBy = (step: number) => { const i = ZOOMS.indexOf(zoom); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.indexOf(100) : i) + step))]); };
  const saveToolbar = (prefs: ToolbarPrefs) => void props.onSettingsChange?.({ ...settings, toolbar: prefs });
  const toggleToolbarPref = (key: "showToolbar" | "showRuler" | "showStatusBar") => saveToolbar({ ...toolbarPrefs, [key]: !toolbarPrefs[key] });

  // ---- Co-writing ----
  const collabHandlers = (host: boolean) => ({
    onStatus: (status: "connecting" | "connected" | "error" | "closed", detail?: string) => setCollab((current) => current ? { ...current, status, detail } : current),
    onParticipants: setParticipants,
    snapshot: host ? () => JSON.stringify({ document: latestDoc.current, projectData: latestData.current }) : undefined,
    onMessage: (msg: CollabMessage) => remoteMessage.current(msg),
  });
  const latestDoc = useRef(document); latestDoc.current = document;
  const latestData = useRef(projectData); latestData.current = projectData;
  const remoteMessage = useRef<(message: CollabMessage) => void>(() => undefined);
  remoteMessage.current = (msg: CollabMessage) => {
    if (msg.kind === "patch") commitDocument({ ...document, elements: applyPatch(document.elements, msg.patch) }, undefined, false, projectData, false);
    else if (msg.kind === "data") commitDocument(document, undefined, false, migrateProjectData({ ...msg.projectData, pageLock: projectData.pageLock }), false);
    else if (msg.kind === "snapshot") { try { const snap = JSON.parse(msg.chunk) as { document: ScreenplayDocument; projectData: ProjectData }; commitDocument(snap.document, { index: 0, cursor: 0 }, false, migrateProjectData(snap.projectData), false); setNotice("Connected: you're now editing the shared script."); } catch { setNotice("The shared script couldn't be read."); } }
    else if (msg.kind === "chat") { setChat((list) => [...list, msg.message]); setCollabPanel(true); }
  };
  const startSession = async (host: boolean, code = sessionCode()) => {
    if (!settings.supabaseUrl || !settings.supabaseKey) { setNotice("Set up co-writing first: Tools → Options → Co-writing.", 6000); setDialog("options"); return; }
    await session.current?.leave();
    const created = new CollabSession(settings.supabaseUrl, settings.supabaseKey, code, settings.collaboratorName || settings.defaultAuthor || "Writer", host, collabHandlers(host));
    session.current = created; setCollab({ code, host, status: "connecting" }); setCollabPanel(true); setChat([]);
    try { await created.start(); } catch (reason) { setCollab({ code, host, status: "error", detail: reason instanceof Error ? reason.message : String(reason) }); }
  };
  const leaveSession = async () => { await session.current?.leave(); session.current = null; setCollab(null); setParticipants([]); setCollabPanel(false); };
  const joinStarted = useRef(false);
  useEffect(() => { if (props.joinCode && !joinStarted.current) { joinStarted.current = true; void startSession(false, props.joinCode); } return () => { void session.current?.leave(); }; }, []);
  useEffect(() => { if (collab?.status === "connected") session.current?.shareCursor(active?.id); }, [active?.id, collab?.status]);

  // Window title like a classic desktop app: "Olukotan - [Title]", * when unsaved.
  useEffect(() => { void setWindowTitle(`Olukotan - [${project.manifest.title}]${dirty ? " *" : ""}`); }, [project.manifest.title, dirty]);
  useEffect(() => () => { void setWindowTitle("Olukotan"); }, []);

  // ---- Menus ----
  const [a0, b0] = selectionRange();
  const hasTextSelection = () => { const handle = activeHandle(); return !!handle && handle.selectionStart !== handle.selectionEnd; };
  const recents = (props.recents ?? []).filter((item) => item.path !== project.projectPath).slice(0, 8);
  const format = active?.metadata?.format ?? {};
  const linesAdjust = projectData.pageLayout?.linesAdjust ?? 0;
  const menus: Menu[] = [
    { id: "file", label: "File", items: [
      { id: "file.new", label: "New", shortcut: "Ctrl+N", run: () => leaveWith(() => props.onNew?.()), disabled: !props.onNew },
      { id: "file.stationery", label: "New from Stationery…", shortcut: "Ctrl+Shift+N", run: () => setDialog("stationery"), disabled: !props.onNewFromTemplate },
      { id: "file.open", label: "Open…", shortcut: "Ctrl+O", run: () => leaveWith(() => props.onOpen?.()), disabled: !props.onOpen },
      { id: "file.close", label: "Close", run: () => leaveWith(onHome) }, "separator",
      { id: "file.save", label: "Save", shortcut: "Ctrl+S", run: onSave, disabled: !dirty || saving || project.readOnly },
      { id: "file.saveAs", label: "Save As…", run: () => setDialog("saveAs"), disabled: !props.onSaveAs },
      { id: "file.pdf", label: "Save As PDF…", run: () => void saveAsPdf() },
      { id: "file.export", label: "Export…", run: () => setDialog("export") },
      { id: "file.backup", label: "Backup…", run: () => void backup() },
      { id: "file.revert", label: "Revert", run: revert, disabled: !dirty || !props.onRevert }, "separator",
      { id: "file.preview", label: "Print Preview", run: () => setDialog("printPreview") },
      { id: "file.print", label: "Print…", shortcut: "Ctrl+P", run: () => void print() }, "separator",
      { id: "file.email", label: "Email…", run: () => void email() },
      { id: "file.register", label: "Register Script", run: () => void openExternal("https://www.wgawregistry.org/") }, "separator",
      { id: "file.recent", label: "Recent File", disabled: !recents.length, submenu: recents.map((item) => ({ id: `file.recent.${item.projectId}`, label: item.title, run: () => leaveWith(() => props.onOpenRecent?.(item.path)) })) }, "separator",
      { id: "file.exit", label: "Exit", run: () => leaveWith(() => void exit()) },
    ] },
    { id: "edit", label: "Edit", items: [
      { id: "edit.undo", label: "Undo", shortcut: "Ctrl+Z", run: undo, disabled: !history.current.past.length },
      { id: "edit.redo", label: history.current.future.length ? "Redo" : "Can't Redo", shortcut: "Ctrl+Y", run: redo, disabled: !history.current.future.length }, "separator",
      { id: "edit.cut", label: "Cut", shortcut: "Ctrl+X", run: () => void clipboardAction("cut"), disabled: project.readOnly },
      { id: "edit.copy", label: "Copy", shortcut: "Ctrl+C", run: () => void clipboardAction("copy") },
      { id: "edit.paste", label: "Paste", shortcut: "Ctrl+V", run: () => void clipboardAction("paste"), disabled: project.readOnly }, "separator",
      { id: "edit.clear", label: "Clear", shortcut: "Delete", run: clear, disabled: project.readOnly },
      { id: "edit.selectAll", label: "Select All", shortcut: "Ctrl+A", run: selectAll },
      { id: "edit.selectScene", label: "Select Scene", shortcut: "Ctrl+Shift+A", run: selectScene }, "separator",
      { id: "edit.find", label: "Find…", shortcut: "Ctrl+F", run: () => { setFindQuery(selectedWord()); setDialog("find"); } },
      { id: "edit.goto", label: "Go To…", shortcut: "Ctrl+G", run: () => setDialog("goto") },
      { id: "edit.findSelection", label: "Find Selection", shortcut: "Ctrl+E", run: findSelection },
    ] },
    { id: "view", label: "View", items: [
      { id: "view.normal", label: "Normal", checked: !pageView, run: () => setViewMode("continuous") },
      { id: "view.page", label: "Page", checked: pageView, run: () => setViewMode("page") }, "separator",
      { id: "view.script", label: "Script", checked: view === "script", run: () => setView("script") },
      { id: "view.cards", label: "Index Cards", checked: view === "cards", run: () => setView("cards") },
      { id: "view.beats", label: "Beat Board", checked: view === "beats", run: () => setView("beats") }, "separator",
      { id: "view.toolbar", label: "Toolbar", checked: toolbarPrefs.showToolbar, run: () => toggleToolbarPref("showToolbar") },
      { id: "view.ruler", label: "Ruler", checked: toolbarPrefs.showRuler, run: () => toggleToolbarPref("showRuler") },
      { id: "view.status", label: "Status Bar", checked: toolbarPrefs.showStatusBar, run: () => toggleToolbarPref("showStatusBar") },
      { id: "view.sceneNumbers", label: "Scene Numbers", checked: projectData.screenplaySettings.sceneNumbers.showInEditor, run: () => commitData(withSettings({ sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, showInEditor: !projectData.screenplaySettings.sceneNumbers.showInEditor } }), false) },
      { id: "view.revisionMarks", label: "Revision Marks", checked: revisionSettings.showMarks, run: () => commitData(withSettings({ revisions: { ...revisionSettings, showMarks: !revisionSettings.showMarks } }), false) }, "separator",
      { id: "view.zoomIn", label: "Zoom In", shortcut: "Ctrl+=", run: () => zoomBy(1) },
      { id: "view.zoomOut", label: "Zoom Out", shortcut: "Ctrl+-", run: () => zoomBy(-1) },
      { id: "view.zoomReset", label: "Actual Size", shortcut: "Ctrl+0", run: () => setZoom(100) }, "separator",
      { id: "view.focus", label: "Focus Mode", checked: focusMode, run: () => setFocusMode(!focusMode) },
      { id: "view.fullscreen", label: "Full Screen", shortcut: "F11", run: () => void toggleFullscreen() },
    ] },
    { id: "format", label: "Format", items: [
      { id: "format.elements", label: "Elements…", shortcut: "Ctrl+Shift+E", run: () => setDialog("elements") },
      { id: "format.font", label: "Font…", run: () => setDialog("font") }, "separator",
      { id: "format.alignment", label: "Alignment", submenu: ([["left", "Left"], ["center", "Centre"], ["right", "Right"]] as const).map(([value, label]) => ({ id: `format.align.${value}`, label, checked: format.align === value, run: () => setParagraphFormat({ align: value }) })).concat([{ id: "format.align.default", label: "Element default", checked: !format.align, run: () => setParagraphFormat({ align: null }) }] as never) },
      { id: "format.spacing", label: "Spacing", submenu: ([[1, "Single"], [1.5, "1.5 Lines"], [2, "Double"]] as const).map(([value, label]) => ({ id: `format.spacing.${value}`, label, checked: (format.spacing ?? specs[active?.type ?? "action"].spacing) === value, run: () => setParagraphFormat({ spacing: value }) })) },
      { id: "format.spaceBefore", label: "Space Before", submenu: [0, 1, 2, 3].map((value) => ({ id: `format.before.${value}`, label: `${value} line${value === 1 ? "" : "s"}`, checked: (format.spaceBefore ?? specs[active?.type ?? "action"].before) === value, run: () => setParagraphFormat({ spaceBefore: value }) })) },
      { id: "format.leading", label: "Leading", submenu: ([[-2, "Loosest"], [-1, "Looser"], [0, "Regular"], [1, "Tighter"], [2, "Tightest"]] as const).map(([value, label]) => ({ id: `format.leading.${value}`, label, checked: linesAdjust === value, run: () => setLeading(value) })) },
      { id: "format.pageBreak", label: "Insert Page Break", run: insertPageBreak }, "separator",
      { id: "format.dual", label: "Dual Dialogue", checked: !!active?.metadata?.dualDialogueGroupId, run: toggleDualDialogue },
    ] },
    { id: "document", label: "Document", items: [
      { id: "doc.layout", label: "Page Layout…", run: () => setDialog("pageLayout") },
      { id: "doc.headerFooter", label: "Header and Footer…", run: () => setDialog("headerFooter") },
      { id: "doc.mores", label: "Mores and Continueds…", run: () => setDialog("mores") }, "separator",
      { id: "doc.titlePage", label: "Title Page", run: () => setDialog("titlePage") },
      { id: "doc.smartType", label: "SmartType…", shortcut: "Ctrl+Shift+L", run: () => setDialog("smartType") },
      { id: "doc.macros", label: "Macros…", run: () => setDialog("macros") },
      { id: "doc.bookmarks", label: "Bookmarks…", run: () => setDialog("bookmarks") },
      { id: "doc.notes", label: "ScriptNotes…", run: () => setDialog("scriptNotes") },
      { id: "doc.settings", label: "Screenplay Settings…", run: () => setDialog("screenplaySettings") }, "separator",
      { id: "doc.insertBookmark", label: "Insert Bookmark…", shortcut: "Ctrl+M", run: insertBookmark },
      { id: "doc.insertNote", label: "Insert ScriptNote", shortcut: "Ctrl+J", run: insertNote },
      { id: "doc.insertLabel", label: "Insert Label…", run: insertLabel },
      { id: "doc.insertScene", label: "Insert New Scene", shortcut: "Ctrl+Shift+I", run: insertNewScene },
      { id: "doc.sendToScript", label: "Send to Script", shortcut: "Ctrl+Shift+C", run: () => setDialog("sendToScript"), disabled: !projectData.beats.length },
    ] },
    { id: "tools", label: "Tools", items: [
      { id: "tools.spelling", label: "Spelling…", shortcut: "Ctrl+D", run: () => setDialog("spelling") },
      { id: "tools.thesaurus", label: "Thesaurus…", shortcut: "Ctrl+Shift+D", run: () => setDialog("thesaurus") }, "separator",
      { id: "tools.speech", label: "Speech Control…", run: () => setDialog("speech") },
      { id: "tools.voices", label: "Assign Voices…", run: () => setDialog("voices") }, "separator",
      { id: "tools.reports", label: "Reports", submenu: ([["Scenes", "Scene Report"], ["Characters", "Character Report"], ["Locations", "Location Report"], ["Summary", "Script Report"]] as const).map(([tab, label]) => ({ id: `tools.reports.${tab}`, label, run: () => { setReportTab(tab); setDialog("reports"); } })) },
      { id: "tools.names", label: "Names Database…", run: () => setDialog("names") },
      { id: "tools.reformat", label: "Reformat…", run: () => setDialog("reformat") },
      { id: "tools.assistant", label: "Format Assistant…", run: () => setDialog("formatAssistant") },
      { id: "tools.compare", label: "ScriptCompare…", run: () => setDialog("compare") },
      { id: "tools.navigator", label: showNavigator ? "Hide Navigator" : "Show Navigator", run: () => setShowNavigator(!showNavigator) },
      { id: "tools.properties", label: showProperties ? "Hide Scene Properties" : "Show Scene Properties", run: () => setShowProperties(!showProperties) }, "separator",
      { id: "tools.collab", label: "CollaboWriter", submenu: [
        { id: "tools.collab.start", label: "Start a Session…", run: () => void startSession(true), disabled: !!collab },
        { id: "tools.collab.join", label: "Join a Session…", run: () => setPrompt({ title: "Join a Session", label: "Session code from the host (e.g. K7P2Q-9MXRT)", confirmLabel: "Join", validate: (value) => /^[A-Z2-9]{5}-?[A-Z2-9]{5}$/iu.test(value.trim()) ? undefined : "Enter the 10-character code the host shared.", onSubmit: (value) => { setPrompt(null); const code = value.trim().toUpperCase().replace(/^(.{5})-?(.{5})$/u, "$1-$2"); if (props.onJoinSession) props.onJoinSession(code); else void startSession(false, code); } }), disabled: !!collab },
        { id: "tools.collab.panel", label: "Show Chat and People", run: () => setCollabPanel(true), disabled: !collab },
        { id: "tools.collab.leave", label: collab?.host ? "End Session" : "Leave Session", run: () => void leaveSession(), disabled: !collab },
      ] }, "separator",
      { id: "tools.customize", label: "Customize…", run: () => setDialog("customize") },
      { id: "tools.options", label: "Options…", run: () => setDialog("options") },
    ] },
    { id: "production", label: "Production", items: [
      { id: "prod.sceneNumbers", label: "Scene Numbers…", run: () => setDialog("sceneNumbers") },
      { id: "prod.editSceneNumber", label: "Edit Scene Number…", shortcut: "Ctrl+Shift+J", run: editSceneNumber, disabled: !activeScene }, "separator",
      { id: "prod.omit", label: activeSceneMeta?.omitted ? "Restore Omitted Scene" : "Omit Scene", run: toggleOmitScene, disabled: !activeSceneMeta }, "separator",
      { id: "prod.revisions", label: "Revisions…", run: () => setDialog("revisions") },
      { id: "prod.revisionMode", label: "Revision Mode", checked: revisionSettings.enabled, run: toggleRevisionMode },
      { id: "prod.markRevised", label: "Mark Revised", shortcut: "Ctrl+R", run: markRevised },
      { id: "prod.clearRevised", label: "Clear Revised", shortcut: "Ctrl+Shift+R", run: clearRevised, disabled: !document.elements.slice(a0, b0 + 1).some((element) => element.metadata?.revisionSet) }, "separator",
      { id: "prod.lock", label: "Lock Pages", run: () => lockPagesNow(), disabled: projectData.pageLock.locked },
      { id: "prod.unlockA", label: "Unlock \"A\" Pages", run: unlockAPages, disabled: !projectData.pageLock.locked || !layout.pages.some((page) => /[A-Z]/u.test(page.label)) },
      { id: "prod.unlockAll", label: "Unlock All Pages", run: unlockAllPages, disabled: !projectData.pageLock.locked },
      { id: "prod.lockingTools", label: "Locking Tools", submenu: [
        { id: "prod.lockScenes", label: "Lock Scene Numbers", run: lockSceneNumbers, disabled: projectData.screenplaySettings.sceneNumbers.mode === "locked" },
        { id: "prod.unlockScenes", label: "Unlock Scene Numbers", run: unlockSceneNumbers, disabled: projectData.screenplaySettings.sceneNumbers.mode !== "locked" },
        { id: "prod.removeNumbers", label: "Remove Scene Numbers…", run: removeNumbers, disabled: !projectData.scenes.some((scene) => scene.number) },
        { id: "prod.relock", label: "Re-lock Pages from Here", run: () => lockPagesNow(true), disabled: !projectData.pageLock.locked },
      ] },
    ] },
    { id: "window", label: "Window", items: [
      { id: "window.splitVertical", label: "Split Side by Side", checked: split === "vertical", run: () => setSplit(split === "vertical" ? "none" : "vertical") },
      { id: "window.splitHorizontal", label: "Split Top and Bottom", checked: split === "horizontal", run: () => setSplit(split === "horizontal" ? "none" : "horizontal") },
      { id: "window.noSplit", label: "Remove Split", run: () => setSplit("none"), disabled: split === "none" },
      { id: "window.splitShows", label: "Split Shows", submenu: [
        { id: "window.split.cards", label: "Index Cards", checked: splitPane === "cards", run: () => { setSplitPane("cards"); if (split === "none") setSplit("vertical"); } },
        { id: "window.split.beats", label: "Beat Board", checked: splitPane === "beats", run: () => { setSplitPane("beats"); if (split === "none") setSplit("vertical"); } },
      ] }, "separator",
      { id: "window.current", label: `1 ${project.manifest.title}`, checked: true, run: () => focusElement(activeIndex) },
    ] },
    { id: "help", label: "Help", items: [
      { id: "help.guide", label: "Olukotan Help", shortcut: "F1", run: () => setDialog("help") },
      { id: "help.shortcuts", label: "Keyboard Shortcuts", run: () => setDialog("shortcuts") }, "separator",
      { id: "help.issue", label: "Report a Problem…", run: () => void openExternal("https://github.com/Yakubu-Moshood/olukotan/issues/new") },
      { id: "help.updates", label: "Check for Updates…", run: () => void openExternal("https://github.com/Yakubu-Moshood/olukotan/releases") }, "separator",
      { id: "help.about", label: "About Olukotan", run: () => setDialog("about") },
    ] },
  ];
  const menusRef = useRef(menus); menusRef.current = menus;

  // Global shortcuts: run after the focused line has handled its own keys.
  const keyHandler = useCallback((event: KeyboardEvent) => {
    setKeys({ caps: event.getModifierState?.("CapsLock") ?? false, num: event.getModifierState?.("NumLock") ?? false });
    if (event.defaultPrevented) return;
    if (event.altKey && !event.ctrlKey && /^[0-9]$/u.test(event.key) && runMacroRef.current(`Alt+${event.key}`)) { event.preventDefault(); return; }
    const native = ["ctrl+x", "ctrl+c", "ctrl+v", "delete"];
    for (const item of shortcutItems(menusRef.current)) {
      if (!item.shortcut || item.disabled) continue;
      if (native.includes(item.shortcut.toLowerCase()) && !selectionRef.current) continue;
      if (item.shortcut.toLowerCase() === "ctrl+=" ? ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) : matchesShortcut(item.shortcut, event)) { event.preventDefault(); item.run?.(); return; }
    }
  }, []);
  const runMacroRef = useRef(runMacro); runMacroRef.current = runMacro;
  const selectionRef = useRef(selection); selectionRef.current = selection;
  useEffect(() => { window.addEventListener("keydown", keyHandler); return () => window.removeEventListener("keydown", keyHandler); }, [keyHandler]);

  // ---- Status bar hint (like "[Tab] Character, [Enter] Action") ----
  const hint = (() => {
    if (!active) return "";
    if (selection) return `${selection[1] - selection[0] + 1} paragraphs selected — Esc to cancel`;
    const tab = getTabElementType(active, document.elements[activeIndex - 1]);
    const enter = active.text.trim() ? getNextElementType({ currentType: active.type, currentText: active.text, knownCharacters, cursorPosition: 0, isElementEmpty: false }) : "Select Element";
    return `[Tab] ${ELEMENT_LABELS[tab]}, [Enter] ${typeof enter === "string" && enter in ELEMENT_LABELS ? ELEMENT_LABELS[enter as ScreenplayElementType] : enter}`;
  })();

  // ---- Page rendering ----
  const groups = useMemo(() => {
    const out: { page: number; items: { element: ScreenplayElement; index: number }[] }[] = [];
    document.elements.forEach((element, index) => {
      const page = pageView ? (layout.elementPage.get(element.id) ?? out.at(-1)?.page ?? 1) : 1;
      if (!out.length || out.at(-1)!.page !== page) out.push({ page, items: [] });
      out.at(-1)!.items.push({ element, index });
    });
    return out;
  }, [document.elements, layout, pageView]);
  const fontFamily = `"${projectData.font?.family ?? "Courier Prime"}", "Courier Prime", "Courier New", monospace`;
  const fontSize = projectData.font?.size ?? 12;
  const geometry = layout.geometry;
  const presenceFor = (id: string) => participants.find((person) => person.elementId === id && person.id !== session.current?.clientId);
  const pageLabel = (page: number) => layout.pages[page - 1]?.label ?? String(page);
  const activeSpec = specs[active?.type ?? "action"];

  const renderBlock = ({ element, index }: { element: ScreenplayElement; index: number }, firstOnSheet: boolean) => {
    const spec = specs[element.type];
    const elementFormat = element.metadata?.format;
    const before = firstOnSheet ? 0 : (elementFormat?.spaceBefore ?? (["dialogue", "parenthetical"].includes(element.type) ? 0 : spec.before));
    const selected = selection && index >= selection[0] && index <= selection[1];
    const presence = presenceFor(element.id);
    const sceneNumber = element.type === "scene-heading" ? displaySceneNumber(element, projectData) : undefined;
    const showNumbers = projectData.screenplaySettings.sceneNumbers.showInEditor;
    return <div key={element.id} className={`screenplay-block screenplay-${element.type} ${element.type === "character" ? "character-cue" : ""} ${index === activeIndex ? "is-active" : ""} ${selected ? "block-selected" : ""} ${speaking?.index === index ? "is-speaking" : ""} ${element.metadata?.dualDialogueGroupId ? "is-dual" : ""}`}
      data-element-type={element.type} data-rendered-cue={element.type === "character" ? renderedCharacterCue(document.elements, index, projectData.screenplaySettings, projectData.moresContinueds?.contd) : undefined}
      style={{ marginLeft: `calc(var(--in) * ${element.type === "page-break" ? 0 : spec.left - 1.5})`, width: element.type === "page-break" ? "100%" : `calc(var(--in) * ${spec.right - spec.left})`, marginTop: `calc(var(--line) * ${before})`,
        textAlign: elementFormat?.align ?? spec.align, ...(spec.caps ? { textTransform: "uppercase" } : {}), fontWeight: spec.style.bold ? 700 : undefined, fontStyle: spec.style.italic ? "italic" : undefined, textDecoration: spec.style.underline ? "underline" : undefined,
        ...(elementFormat?.spacing && elementFormat.spacing > 1 ? { lineHeight: elementFormat.spacing } : spec.spacing > 1 ? { lineHeight: spec.spacing } : {}), ...(presence ? { boxShadow: `-4px 0 0 ${presence.colour}` } : {}) }}
      onMouseDown={(event) => { if (event.shiftKey && !event.defaultPrevented) { event.preventDefault(); setSelection([Math.min(activeIndex, index), Math.max(activeIndex, index)]); paper.current?.focus(); } else if (selection) setSelection(null); }}>
      {sceneNumber && showNumbers && ["left", "both"].includes(projectData.screenplaySettings.sceneNumbers.position) && (projectData.screenplaySettings.sceneNumbers.mode === "manual"
        ? <input className="scene-number-input scene-number-left" aria-label={`Scene number ${index + 1}`} value={sceneNumber} onFocus={() => setActiveIndex(index)} onChange={(event) => updateSceneNumber(index, event.target.value.replace(/#/g, ""))}/>
        : <span className="scene-number-gutter scene-number-left">{sceneNumber}</span>)}
      {sceneNumber && showNumbers && ["right", "both"].includes(projectData.screenplaySettings.sceneNumbers.position) && <span className="scene-number-gutter scene-number-right">{sceneNumber}</span>}
      {element.type === "page-break" ? <button className="explicit-page-break" onClick={() => setActiveIndex(index)}>Page break</button> : <RichLine register={registerLine(element.id)}
        label={`${ELEMENT_LABELS[element.type]} element ${index + 1}`} value={element.text} readOnly={project.readOnly}
        spellCheck={settings.spellCheckAsYouType !== false && !(["scene-heading", "character", "transition", "shot"].includes(element.type))}
        onFocus={() => setActiveIndex(index)} onChange={(next, cursor) => onTextChange(index, next, cursor)} onFormat={(next, start, end) => onFormat(index, next, start, end)}
        onKeyDown={(event, handle) => onKeyDown(event, index, handle)} onPaste={(text, handle) => onPaste(index, text, handle)}
        onContextMenu={(event) => { event.preventDefault(); setActiveIndex(index); setContextMenu({ x: event.clientX, y: event.clientY }); }}/>}
      {automaticContinued(document.elements, index, projectData.screenplaySettings) && !parseCharacter(element.text).extensions.some((extension) => extension.replace(/[’`]/gu, "'") === "CONT'D") && <span className="automatic-continued" aria-label="Automatic character continued">{projectData.moresContinueds?.contd ?? "(CONT'D)"}</span>}
      {element.metadata?.dualDialogueGroupId && element.type === "character" && <span className="dual-badge" title="Prints side by side with the neighbouring speech">DUAL</span>}
      {index === activeIndex && suggestions.length > 0 && <div className="screenplay-suggestions" role="listbox" aria-label={`${ELEMENT_LABELS[element.type]} suggestions`}>{suggestions.map((suggestion, suggestionPosition) => <button className={suggestionPosition === suggestionIndex ? "selected" : ""} key={`${suggestion.type}-${suggestion.value}`} role="option" aria-label={suggestion.value} aria-selected={suggestionPosition === suggestionIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}><span>{suggestion.value}</span><small>{suggestion.category}</small></button>)}</div>}
      {revisionMarkFor(element, projectData) && <span className="revision-mark" aria-label="Revised">{revisionMarkFor(element, projectData)}</span>}
      {presence && <span className="presence-tag" style={{ background: presence.colour }}>{presence.name}</span>}
    </div>;
  };

  const scriptPane = <div className="page-wrap fd-wrap" style={{ ["--zoom" as string]: zoom / 100, ["--in" as string]: `calc(1in * ${zoom / 100})`, ["--line" as string]: `calc(${fontSize}pt * ${zoom / 100})` }}>
    {project.readOnly && <div className="read-only">Read-only mode — this folder cannot be written to. Your original files are unchanged.</div>}
    <div ref={paper} tabIndex={-1} className={`fd-paper ${pageView ? "page-view" : "normal-view"}`} role="textbox" aria-label="Screenplay editor" aria-multiline="true"
      style={{ fontFamily, fontSize: `calc(${fontSize}pt * var(--zoom))` }}
      onKeyDown={async (event) => {
        if (!selection || event.target !== paper.current) return;
        const key = event.key.toLowerCase(); const ctrl = event.ctrlKey || event.metaKey;
        if (event.key === "Escape") { event.preventDefault(); setSelection(null); focusElement(activeIndex); return; }
        if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); return; }
        if (ctrl && (key === "c" || key === "x")) { event.preventDefault(); await clipboardAction(key === "c" ? "copy" : "cut"); return; }
        if (ctrl && SHORTCUT_TYPES[event.key]) { event.preventDefault(); changeType(SHORTCUT_TYPES[event.key]); }
      }}>
      {groups.map((group, groupIndex) => <div key={`${group.page}-${groupIndex}`} className="sheet" style={{ width: `calc(var(--in) * ${geometry.widthIn})`, minHeight: pageView ? `calc(var(--in) * ${geometry.heightIn})` : undefined, padding: `calc(var(--in) * ${geometry.topIn}) calc(var(--in) * ${geometry.widthIn - 7.5}) calc(var(--in) * 1) calc(var(--in) * 1.5)` }}>
        {pageView && group.page > 1 && groupIndex > 0 && groups[groupIndex - 1].page !== group.page && <span className="sheet-number" aria-label={`Page ${pageLabel(group.page)}`}>{pageLabel(group.page)}.</span>}
        {group.items.map((item, position) => renderBlock(item, pageView && position === 0 && groupIndex > 0))}
      </div>)}
    </div>
  </div>;
  const secondPane = splitPane === "cards" ? <IndexCards rows={sceneRows} onJump={jumpToScene} onMove={reorderScene} onUpdate={updateScene}/> : <BeatBoard beats={projectData.beats} scenes={sceneRows} onChange={updateBeats} onCreateScene={(beat) => insertScenesFromBeats([beat])} onJump={jumpToScene}/>;
  const showChrome = !focusMode;
  const rangeForTools = selection ?? [activeIndex, activeIndex] as [number, number];

  return <div className={`studio fd-studio ${focusMode ? "focus-mode" : ""}`} onClick={() => contextMenu && setContextMenu(null)}>
    <header className="fd-menubar-row">
      <span className="app-mark" title="Olukotan" aria-hidden>Ọ</span>
      <MenuBar menus={menus}/>
      {collab && <span className={`collab-pill ${collab.status}`} onClick={() => setCollabPanel(true)}>{participants.length || 1} co-writing</span>}
    </header>
    {showChrome && toolbarPrefs.showToolbar && <Toolbar hidden={toolbarPrefs.hidden} activeType={active?.type ?? "action"} zoom={zoom} canUndo={!!history.current.past.length} canRedo={!!history.current.future.length} canSave={dirty && !saving && !project.readOnly}
      view={pageView ? "page" : "normal"} split={split} navigator={showNavigator} properties={showProperties}
      actions={{ newScript: () => leaveWith(() => props.onNew?.()), open: () => leaveWith(() => props.onOpen?.()), save: onSave, print: () => void print(), spelling: () => setDialog("spelling"),
        cut: () => void clipboardAction("cut"), copy: () => void clipboardAction("copy"), paste: () => void clipboardAction("paste"), undo, redo, format: toggleFormat, setType: (type) => changeType(type), setZoom,
        normalView: () => { setSplit("none"); setViewMode("continuous"); }, pageView: () => { setSplit("none"); setViewMode("page"); }, splitVertical: () => setSplit(split === "vertical" ? "none" : "vertical"), splitHorizontal: () => setSplit(split === "horizontal" ? "none" : "horizontal"),
        info: () => { setReportTab("Summary"); setDialog("reports"); }, help: () => setDialog("help"), toggleNavigator: () => setShowNavigator(!showNavigator), toggleProperties: () => setShowProperties(!showProperties), cards: () => setView(view === "cards" ? "script" : "cards") }}/>}
    {showChrome && toolbarPrefs.showRuler && view === "script" && <Ruler widthIn={geometry.widthIn} zoom={zoom} left={activeSpec.left} right={activeSpec.right}
      onChange={(left, right) => commitDocument(document, undefined, false, { ...projectData, elementStyles: { ...projectData.elementStyles, [active?.type ?? "action"]: { ...projectData.elementStyles?.[active?.type ?? "action"], left, right } } })}/>}
    <div className={`fd-body ${showChrome && showNavigator ? "with-nav" : ""} ${(showChrome && showProperties) || collabPanel ? "with-side" : ""}`}>
      {showChrome && showNavigator && <aside className="left-sidebar fd-nav"><div className="panel-heading"><span>Navigator</span><span className="hint">{sceneRows.length} scenes · {pages} pp</span></div><Navigator rows={sceneRows} activeSceneId={activeScene?.metadata?.sceneId} onJump={jumpToScene} onMove={reorderScene} onUpdate={updateScene}/></aside>}
      <main className={`writing-area fd-main split-${split}`}>
        {view === "cards" && <IndexCards rows={sceneRows} onJump={jumpToScene} onMove={reorderScene} onUpdate={updateScene}/>}
        {view === "beats" && <BeatBoard beats={projectData.beats} scenes={sceneRows} onChange={updateBeats} onCreateScene={(beat) => insertScenesFromBeats([beat])} onJump={jumpToScene}/>}
        {view === "script" && (split === "none" ? scriptPane : <div className={`split-panes ${split}`}><div className="pane">{scriptPane}</div><div className="pane second">{secondPane}</div></div>)}
      </main>
      {showChrome && showProperties && !collabPanel && <ScenePropertiesPanel row={activeSceneRow} meta={activeSceneMeta} onChange={(patch) => activeSceneMeta && updateScene(activeSceneMeta.sceneId, patch)} onClose={() => setShowProperties(false)}/>}
      {collabPanel && collab && <CollaboPanel code={collab.code} host={collab.host} status={collab.status} detail={collab.detail} participants={participants} messages={chat} selfId={session.current?.clientId ?? ""}
        onChat={(text) => { const sent = session.current?.chat(text); if (sent) setChat((list) => [...list, sent]); }} onLeave={() => void leaveSession()} onClose={() => setCollabPanel(false)}/>}
    </div>
    {showChrome && toolbarPrefs.showStatusBar && <StatusBar hint={notice || hint} scene={activeSceneNumber ? `Scene ${activeSceneNumber}` : activeScene ? "Scene" : "No Scene"} page={pageLabel(activePage)} pages={pages} element={active ? ELEMENT_LABELS[active.type] : ""} caps={keys.caps} num={keys.num}
      extra={<><span className="sb-save">{saving ? "Saving…" : dirty ? "Unsaved changes" : message || "Saved"}</span>{revisionSettings.enabled && activeRevision && <span className="revision-badge" style={{ background: activeRevision.colour }}>Revising: {activeRevision.name}</span>}{projectData.pageLock.locked && <span className="lock-badge">Pages locked</span>}<span className="sb-words">{wordCount(visibleText(fountain)).toLocaleString()} words</span></>}/>}

    {contextMenu && <div className="element-context-menu" style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 230)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 640)), maxHeight: "calc(100vh - 16px)", overflowY: "auto" }} role="menu" onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.stopPropagation()}>
      <button role="menuitem" onClick={() => void clipboardAction("cut")} disabled={project.readOnly}>Cut <kbd>Ctrl+X</kbd></button><button role="menuitem" onClick={() => void clipboardAction("copy")}>Copy <kbd>Ctrl+C</kbd></button><button role="menuitem" onClick={() => void clipboardAction("paste")} disabled={project.readOnly}>Paste <kbd>Ctrl+V</kbd></button><button role="menuitem" onClick={() => void clipboardAction("selectAll")}>Select All <kbd>Ctrl+A</kbd></button>
      <button role="menuitem" onClick={() => { toggleFormat("bold"); setContextMenu(null); }}>Bold <kbd>Ctrl+B</kbd></button><button role="menuitem" onClick={() => { toggleFormat("italic"); setContextMenu(null); }}>Italic <kbd>Ctrl+I</kbd></button><button role="menuitem" onClick={() => { toggleFormat("underline"); setContextMenu(null); }}>Underline <kbd>Ctrl+U</kbd></button>
      <button role="menuitem" onClick={() => { setContextMenu(null); setDialog("thesaurus"); }}>Thesaurus…</button>
      <hr/>{active?.type === "scene-heading" && <button role="menuitem" onClick={() => { setContextMenu(null); editSceneNumber(); }}>Set Scene Number…</button>}{SELECTABLE_TYPES.map((type) => <button role="menuitem" key={type} onClick={() => changeType(type)}>{ELEMENT_LABELS[type]} <kbd>Ctrl+{Object.entries(SHORTCUT_TYPES).find(([, value]) => value === type)?.[0] ?? ""}</kbd></button>)}</div>}
    {paletteOpen && <div className="command-palette-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="command-palette" role="dialog" aria-label="Element command palette" onMouseDown={(event) => event.stopPropagation()}><h2>Change screenplay element</h2>{SELECTABLE_TYPES.map((type) => <button key={type} onClick={() => changeType(type)}><span>{ELEMENT_LABELS[type]}</span><kbd>Ctrl+{Object.entries(SHORTCUT_TYPES).find(([, value]) => value === type)?.[0] ?? ""}</kbd></button>)}</div></div>}

    {dialog === "find" && <FindDialog elements={document.elements} initialQuery={findQuery} onFind={findFrom} onReplace={replaceCurrent} onReplaceAll={replaceEverywhere} onClose={() => setDialog(null)}/>}
    {dialog === "goto" && <GoToDialog pages={layout.pages.map((page) => page.label)} scenes={sceneRows} bookmarks={projectData.bookmarks ?? []} onPage={(label) => goToPage(layout.pages.findIndex((page) => page.label === label) + 1)} onScene={jumpToScene} onBookmark={goToBookmark} onClose={() => setDialog(null)}/>}
    {dialog === "elements" && <ElementsDialog projectData={projectData} initialType={active?.type ?? "action"} onSave={(styles, sceneHeadingSpacing) => { commitData({ ...withSettings({ pagination: { ...projectData.screenplaySettings.pagination, sceneHeadingSpacing } }), elementStyles: styles }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "font" && <FontDialog projectData={projectData} onSave={(font) => { commitData({ ...projectData, font }); setDialog(null); }} onStyle={(style) => toggleFormat(style)} onClose={() => setDialog(null)}/>}
    {dialog === "pageLayout" && <PageLayoutDialog projectData={projectData} onSave={(pageSize, pageLayout) => { commitData({ ...withSettings({ pagination: { ...projectData.screenplaySettings.pagination, pageSize } }), pageLayout }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "headerFooter" && <HeaderFooterDialog projectData={projectData} onSave={(headerFooter) => { commitData({ ...projectData, headerFooter }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "mores" && <MoresContinuedsDialog projectData={projectData} onSave={(continueds, moresContinueds) => { commitData({ ...withSettings({ continueds }), moresContinueds }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "titlePage" && <TitlePageDialog preamble={document.preamble} fallbackTitle={project.manifest.title} fallbackAuthor={project.manifest.author} onClose={() => setDialog(null)} onSave={(preamble) => { commitDocument({ ...document, preamble }, keepFocus()); setDialog(null); }}/>}
    {dialog === "smartType" && <SmartTypeDialog lists={projectData.smartType ?? { characters: [], extensions: [], sceneIntros: [], locations: [], times: [], transitions: [] }} collected={collectedSmartType()} onSave={(smartType) => { commitData({ ...projectData, smartType }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "macros" && <MacrosDialog macros={projectData.macros ?? []} onSave={(macros) => { commitData({ ...projectData, macros }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "bookmarks" && <BookmarksDialog bookmarks={projectData.bookmarks ?? []} elements={document.elements.map((element) => element.metadata?.bookmark ? { ...element, id: element.metadata.bookmark } : element)} onGo={(bookmark) => { setDialog(null); goToBookmark(bookmark.id); }} onSave={(bookmarks) => { commitDocument({ ...document, elements: document.elements.map((element) => element.metadata?.bookmark && !bookmarks.some((b) => b.id === element.metadata?.bookmark) ? { ...element, metadata: { ...element.metadata, bookmark: undefined } } : element) }, undefined, true, { ...projectData, bookmarks }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "scriptNotes" && <ScriptNotesDialog elements={document.elements} onGo={(index) => { setDialog(null); focusElement(index); }} onDelete={(index) => commitElements(document.elements.filter((_, i) => i !== index))} onClose={() => setDialog(null)}/>}
    {dialog === "sendToScript" && <SendToScriptDialog beats={projectData.beats} onSend={(beats) => { setDialog(null); insertScenesFromBeats(beats); }} onClose={() => setDialog(null)}/>}
    {dialog === "spelling" && <SpellingDialog elements={document.elements} customWords={projectData.customWords ?? []} knownNames={knownCharacters.flatMap((name) => name.split(/\s+/u))}
      onSelect={(miss) => focusElement(miss.index, miss.start, miss.end)}
      onReplace={(miss, replacement, all) => { if (all) { const result = replaceAll(document.elements, { query: miss.word, matchCase: true, wholeWord: true }, replacement); commitElements(result.elements); } else commitElements(replaceMatch(document.elements, miss, replacement)); }}
      onAddWord={(word) => commitData({ ...projectData, customWords: [...new Set([...(projectData.customWords ?? []), word])] })} onClose={() => setDialog(null)}/>}
    {dialog === "thesaurus" && <ThesaurusDialog initialWord={selectedWord()} onReplace={replaceSelectedWord} onClose={() => setDialog(null)}/>}
    {dialog === "speech" && <SpeechDialog elements={document.elements} activeIndex={activeIndex} sceneRange={sceneRangeOf(activeIndex)} voices={projectData.voices ?? {}} onLine={(line) => { setSpeaking(line); if (line) textareas.current.get(document.elements[line.index]?.id)?.scrollIntoView({ block: "center" }); }} onAssign={() => setDialog("voices")} onClose={() => { setSpeaking(null); setDialog(null); }}/>}
    {dialog === "voices" && <VoicesDialog characters={collectKnownCharacters(document.elements)} voices={projectData.voices ?? {}} onSave={(voices) => { commitData({ ...projectData, voices }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "names" && <NamesDialog onClose={() => setDialog(null)} onInsert={(name) => {
      const upper = name.toLocaleUpperCase("en-GB");
      if (active && !active.text.trim()) { commitElements(document.elements.map((element, i) => i === activeIndex ? { ...element, type: "character", text: upper, metadata: { ...element.metadata, characterName: upper } } : element), { index: activeIndex, cursor: upper.length }); }
      else insertAfterActive([createElement("character", upper, { characterName: upper }), createElement("dialogue")]);
      setDialog(null);
    }}/>}
    {dialog === "reformat" && <ReformatDialog range={rangeForTools} elements={document.elements} onApply={(type, range) => { const saved = selection; setSelection(range[0] === range[1] ? null : range); changeTypeRange(type, range); setSelection(saved && range[0] !== range[1] ? saved : null); }} onStep={(index) => focusElement(index)} onClose={() => setDialog(null)}/>}
    {dialog === "formatAssistant" && <FormatAssistantDialog elements={document.elements} onGo={(index) => focusElement(index)} onFix={(issue) => issue.fix && commitElements(issue.fix(document.elements))} onClose={() => setDialog(null)}/>}
    {dialog === "compare" && <ScriptCompareDialog elements={document.elements} onGo={(index) => focusElement(index)} onMarkRevised={(indices) => { const [data, setId] = ensureRevisionSet(); const marked = new Set(indices); commitDocument({ ...document, elements: document.elements.map((element, i) => marked.has(i) ? { ...element, metadata: { ...element.metadata, revisionSet: setId } } : element) }, keepFocus(), true, data); setDialog(null); setNotice(`${indices.length} changed paragraphs marked as revised.`); }} onClose={() => setDialog(null)}/>}
    {dialog === "customize" && <CustomizeDialog prefs={toolbarPrefs} menus={menus} onSave={(prefs) => { saveToolbar(prefs); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "shortcuts" && <Modal title="Keyboard Shortcuts" eyebrow="Help" onClose={() => setDialog(null)} width={520}><table className="ol-table"><tbody>{shortcutItems(menus).map((item) => <tr key={item.id}><td>{item.label.replace(/…$/u, "")}</td><td><kbd>{item.shortcut}</kbd></td></tr>)}{["Ctrl+1 … Ctrl+7, Ctrl+0|Change element", "Tab|Next element type", "Enter|New paragraph", "Ctrl+B / Ctrl+I / Ctrl+U|Bold / Italic / Underline", "Ctrl+K|Element palette", "Shift+click|Select paragraphs", "Alt+1 … Alt+0|Macros"].map((row) => <tr key={row}><td>{row.split("|")[1]}</td><td><kbd>{row.split("|")[0]}</kbd></td></tr>)}</tbody></table></Modal>}
    {dialog === "options" && <OptionsDialog settings={settings} sentences={projectData.screenplaySettings.capitalisation.sentences !== false} webMode={platform.kind === "web"} onSave={(value, sentences) => { void props.onSettingsChange?.(value); commitData(withSettings({ capitalisation: { ...projectData.screenplaySettings.capitalisation, sentences } }), false); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "sceneNumbers" && <SceneNumbersDialog settings={projectData.screenplaySettings.sceneNumbers} onApply={applySceneNumbers} onClose={() => setDialog(null)}/>}
    {dialog === "revisions" && <RevisionsDialog projectData={projectData} onSave={(revisionSets, activeSetId, showMarks) => { commitData({ ...withSettings({ revisions: { ...revisionSettings, activeSetId, showMarks, enabled: revisionSettings.enabled && !!activeSetId } }), revisionSets }); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "stationery" && <StationeryDialog onChoose={(template) => { setDialog(null); leaveWith(() => props.onNewFromTemplate?.(template)); }} onClose={() => setDialog(null)}/>}
    {dialog === "saveAs" && <SaveAsDialog title={project.manifest.title} onSave={async (title, folder) => { await props.onSaveAs?.(title, folder, fountain, projectData); setDialog(null); }} onClose={() => setDialog(null)}/>}
    {dialog === "printPreview" && <PrintPreviewDialog makePdf={makePdf} onPrint={(bytes) => void print(bytes)} onClose={() => setDialog(null)}/>}
    {dialog === "about" && <AboutDialog onLink={(url) => void openExternal(url)} onClose={() => setDialog(null)}/>}
    {dialog === "help" && <HelpDialog onClose={() => setDialog(null)}/>}
    {dialog === "screenplaySettings" && <ScreenplaySettingsDialog initial={projectData.screenplaySettings} onClose={() => setDialog(null)} onSave={saveScreenplaySettings}/>}
    {dialog === "reports" && <ReportsDialog title={project.manifest.title} document={document} projectData={projectData} layout={layout} initialTab={reportTab} onClose={() => setDialog(null)}/>}
    {dialog === "export" && <ExportDialog project={project} document={document} projectData={projectData} onClose={() => setDialog(null)} onExported={onExported}/>}
    {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)}/>}
    {prompt && <PromptDialog {...prompt} onClose={() => setPrompt(null)}/>}
  </div>;

  function changeTypeRange(type: ScreenplayElementType, range: [number, number]) {
    const elements = document.elements.map((current, i) => {
      if (i < range[0] || i > range[1] || current.type === "page-break") return current;
      const text = normalizeElementText(type, current.text); const parsed = parseCharacter(text);
      return { ...current, type, text, metadata: type === "character" ? { ...current.metadata, characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions } : current.metadata };
    });
    commitElements(elements, { index: range[0], cursor: 0 });
  }
}
