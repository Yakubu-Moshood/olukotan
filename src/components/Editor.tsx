import { ArrowLeft, Bold, ChevronLeft, ChevronRight, Cloud, Command, FileText, FolderOpen, Italic, PanelLeftClose, PanelRightClose, Redo2, Save, Search, Settings, Underline, Undo2, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { approximatePageCount, wordCount } from "../lib/screenplay";
import { automaticContinued, autocompleteSuggestions, displaySceneNumber, getAutocompleteContext, removeSceneNumbers, renderedCharacterCue, synchroniseSceneMetadata } from "../lib/screenplay-production";
import {
  ELEMENT_LABELS, SCENE_PREFIXES, TIMES_OF_DAY, applyEnter, applyTab, collectKnownCharacters,
  collectSceneLocations, createElement, normalizeElementText, normalizedCursorPosition, parseCharacter,
  parseFountain, screenplayPasteElements, serializeFountain, updateElementText,
  type EditResult, type ScreenplayDocument, type ScreenplayElement, type ScreenplayElementType,
} from "../lib/screenplay-elements";
import { migrateProjectData, type ExportFormat, type ProjectData, type ProjectPayload, type ScreenplaySettings } from "../types";
import { ScreenplaySettingsDialog } from "./ScreenplaySettingsDialog";
import { ExportDialog } from "./ExportDialog";

const SELECTABLE_TYPES: ScreenplayElementType[] = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general"];
const SHORTCUT_TYPES: Record<string, ScreenplayElementType> = { "1": "scene-heading", "2": "action", "3": "character", "4": "parenthetical", "5": "dialogue", "6": "transition", "7": "shot", "0": "general" };

interface History { past: ScreenplayDocument[]; future: ScreenplayDocument[] }
interface FocusRequest { index: number; cursor: number }
interface Suggestion { value: string; type: "character" | "character-extension" | "scene-heading"; category: string }

function cloneDocument(value: ScreenplayDocument): ScreenplayDocument { return structuredClone(value); }

export function Editor({ project, content, dirty, saving, message, onChange, onProjectDataChange, onSave, onHome, onReveal, onExported }: {
  project: ProjectPayload; content: string; dirty: boolean; saving: boolean; message: string;
  onChange(value: string): void; onProjectDataChange(value: ProjectData): void; onSave(): void; onHome(): void; onReveal(): void;
  onExported(entry: { format: ExportFormat; path: string; exportedAt: string }): void;
}) {
  const initial = useRef<ReturnType<typeof synchroniseSceneMetadata> | null>(null);
  if (!initial.current) initial.current = synchroniseSceneMetadata(parseFountain(content), migrateProjectData(project.projectData));
  const [document, setDocument] = useState<ScreenplayDocument>(() => initial.current!.document);
  const [projectData, setProjectData] = useState<ProjectData>(() => initial.current!.projectData);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [screenplaySettingsOpen, setScreenplaySettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [productionMenuOpen, setProductionMenuOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [autocompleteOpen, setAutocompleteOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const focusRequest = useRef<FocusRequest | null>(null);
  const history = useRef<History>({ past: [], future: [] });
  const lastSerialized = useRef(content);

  useEffect(() => {
    const fountain = serializeFountain(document);
    const storedProjectData = migrateProjectData(project.projectData);
    if (JSON.stringify(projectData) !== JSON.stringify(storedProjectData)) onProjectDataChange(projectData);
    const hasPersistentScenes = document.elements.some((element) => element.type === "scene-heading" && Boolean(element.text && element.metadata?.sceneId));
    if (hasPersistentScenes && fountain !== content) { lastSerialized.current = fountain; onChange(fountain); }
    // Migrate older projects and persist scene IDs once when the editor opens.
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
    if (area) { area.focus(); area.setSelectionRange(request.cursor, request.cursor); area.scrollIntoView?.({ block: "nearest" }); }
    focusRequest.current = null;
  }, [document]);

  const commitDocument = (next: ScreenplayDocument, focus?: FocusRequest, record = true, data: ProjectData = projectData) => {
    if (record) { history.current.past.push(cloneDocument(document)); history.current.past = history.current.past.slice(-150); history.current.future = []; }
    const prepared = synchroniseSceneMetadata(next, data);
    setDocument(prepared.document); setProjectData(prepared.projectData); onProjectDataChange(prepared.projectData);
    if (focus) { setActiveIndex(focus.index); focusRequest.current = focus; }
    const fountain = serializeFountain(prepared.document); lastSerialized.current = fountain; onChange(fountain);
  };
  const commitResult = (result: EditResult) => commitDocument({ ...document, elements: result.elements }, { index: result.activeIndex, cursor: result.cursorPosition });

  const undo = () => {
    const previous = history.current.past.pop(); if (!previous) return;
    history.current.future.push(cloneDocument(document));
    const nextIndex = Math.min(activeIndex, previous.elements.length - 1);
    commitDocument(previous, { index: nextIndex, cursor: previous.elements[nextIndex]?.text.length ?? 0 }, false);
  };
  const redo = () => {
    const next = history.current.future.pop(); if (!next) return;
    history.current.past.push(cloneDocument(document));
    const nextIndex = Math.min(activeIndex, next.elements.length - 1);
    commitDocument(next, { index: nextIndex, cursor: next.elements[nextIndex]?.text.length ?? 0 }, false);
  };

  const active = document.elements[activeIndex] ?? document.elements[0];
  const knownCharacters = useMemo(() => collectKnownCharacters(document.elements), [document.elements]);
  const sceneLocations = useMemo(() => collectSceneLocations(document.elements), [document.elements]);
  const fountain = useMemo(() => serializeFountain(document), [document]);
  const pages = approximatePageCount(fountain);
  const scenes = useMemo(() => document.elements.map((element, index) => ({ element, index })).filter(({ element }) => element.type === "scene-heading" && element.text), [document.elements]);

  const changeType = (type: ScreenplayElementType, index = activeIndex) => {
    const elements = [...document.elements]; const current = elements[index]; if (!current) return;
    const text = normalizeElementText(type, current.text);
    const parsed = parseCharacter(text);
    const metadata = type === "character" ? { ...current.metadata, characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions } : current.metadata;
    elements[index] = { ...current, type, text, metadata };
    commitDocument({ ...document, elements }, { index, cursor: type === "parenthetical" ? Math.max(1, text.length - 1) : text.length });
    setPaletteOpen(false); setContextMenu(null);
  };

  const updateSceneNumber = (index: number, sceneNumber: string) => {
    const elements = [...document.elements]; const current = elements[index];
    elements[index] = { ...current, metadata: { ...current.metadata, sceneNumber: sceneNumber || undefined } };
    const scenes = projectData.scenes.map((scene) => scene.sceneId === current.metadata?.sceneId ? { ...scene, number: sceneNumber || undefined } : scene);
    commitDocument({ ...document, elements }, { index, cursor: current.text.length }, true, { ...projectData, scenes });
  };

  const onTextChange = (index: number, raw: string, cursor: number) => {
    const result = updateElementText(document.elements, index, raw);
    result.cursorPosition = normalizedCursorPosition(result.elements[index].type, raw, cursor);
    setAutocompleteOpen(true); setSuggestionIndex(-1); commitResult(result);
  };

  const removeOrMerge = (index: number, cursor: number) => {
    if (cursor !== 0 || index === 0) return false;
    const elements = [...document.elements]; const current = elements[index]; const previous = elements[index - 1];
    if (!current.text) {
      elements.splice(index, 1); commitDocument({ ...document, elements }, { index: index - 1, cursor: previous.text.length }); return true;
    }
    const compatible = current.type === previous.type && ["action", "dialogue", "general"].includes(current.type);
    if (compatible) {
      const joinAt = previous.text.length; elements[index - 1] = { ...previous, text: `${previous.text}${previous.text ? " " : ""}${current.text}` }; elements.splice(index, 1);
      commitDocument({ ...document, elements }, { index: index - 1, cursor: joinAt }); return true;
    }
    focusRequest.current = { index: index - 1, cursor: previous.text.length }; setActiveIndex(index - 1); setDocument({ ...document }); return true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const area = event.currentTarget;
    if ((event.ctrlKey || event.metaKey) && SHORTCUT_TYPES[event.key]) { event.preventDefault(); changeType(SHORTCUT_TYPES[event.key], index); return; }
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
    if ((event.key === "Enter" || event.key === "Tab") && suggestions.length && explicitlyAcceptingSuggestion) {
      event.preventDefault(); chooseSuggestion(suggestions[suggestionIndex >= 0 ? suggestionIndex : 0]); return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = applyEnter(document.elements, index, area.selectionStart);
      if (event.shiftKey && document.elements[index].type === "dialogue" && result.elements[result.activeIndex]) result.elements[result.activeIndex].type = "dialogue";
      commitResult(result); return;
    }
    if (event.key === "Tab") { event.preventDefault(); commitResult(applyTab(document.elements, index, event.shiftKey)); return; }
    if (event.key === "Backspace" && removeOrMerge(index, area.selectionStart)) event.preventDefault();
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>, index: number) => {
    const pasted = event.clipboardData.getData("text/plain"); if (!/\r?\n/u.test(pasted)) return;
    event.preventDefault();
    const lines = pasted.split(/\r?\n/u).length;
    if (lines > 50 && !window.confirm(`Paste and interpret ${lines} lines as screenplay elements?`)) return;
    const pastedElements = screenplayPasteElements(pasted); const elements = [...document.elements];
    if (!elements[index].text) elements.splice(index, 1, ...pastedElements); else elements.splice(index + 1, 0, ...pastedElements);
    const target = elements[index].text ? index + pastedElements.length : index + pastedElements.length - 1;
    commitDocument({ ...document, elements }, { index: target, cursor: elements[target].text.length });
  };

  const wrapSelection = (marker: "*" | "**" | "_") => {
    const area = active && textareas.current.get(active.id); if (!area || !["action", "dialogue", "general"].includes(active.type)) return;
    const start = area.selectionStart; const end = area.selectionEnd; const raw = `${active.text.slice(0, start)}${marker}${active.text.slice(start, end)}${marker}${active.text.slice(end)}`;
    const elements = [...document.elements]; elements[activeIndex] = { ...active, text: raw };
    commitDocument({ ...document, elements }, { index: activeIndex, cursor: end + marker.length * 2 });
  };

  const suggestions = useMemo(() => {
    if (!active || !autocompleteOpen) return [] as Suggestion[];
    const context = getAutocompleteContext(active);
    if (context === "none" || context === "transition" || context === "shot") return [];
    const query = active.text.trim().toLocaleUpperCase("en-GB");
    if (context === "scene-location" || context === "scene-time") {
      const fragment = context === "scene-time" ? (query.split(" - ").at(-1) ?? "") : query.replace(/^[A-Z./]+\s*/u, "");
      const values = context === "scene-time" ? TIMES_OF_DAY : sceneLocations;
      return values.filter((value) => value.startsWith(fragment) && value !== fragment).slice(0, 6).map((value) => ({ value, type: "scene-heading" as const, category: context === "scene-time" ? "Times of Day" : "Locations" }));
    }
    return autocompleteSuggestions(active, knownCharacters, SCENE_PREFIXES);
  }, [active, autocompleteOpen, knownCharacters, sceneLocations]);

  const chooseSuggestion = (suggestion: Suggestion) => {
    if (!active) return;
    const value = suggestion.value;
    let text = value; let type: ScreenplayElementType = active.type === "action" && suggestion.type !== "character-extension" ? suggestion.type : active.type;
    if (suggestion.type === "character-extension") {
      const open = active.text.lastIndexOf("(");
      const beforeOpen = active.text.slice(0, open).trimEnd();
      const compact = value === "VOICE OVER" ? "V.O." : value === "OFF SCREEN" ? "O.S." : value;
      const existing = parseCharacter(beforeOpen).extensions.map((extension) => extension.replace(/[’`]/gu, "'").toLocaleUpperCase("en-GB"));
      text = existing.includes(compact.replace(/[’`]/gu, "'").toLocaleUpperCase("en-GB")) ? beforeOpen : `${beforeOpen} (${compact})`;
    }
    if (type === "scene-heading") {
      const current = active.text;
      if (SCENE_PREFIXES.includes(value)) text = `${value} `;
      else if (TIMES_OF_DAY.includes(value)) text = `${current.replace(/\s+-\s+[^-]*$/u, "")} - ${value}`;
      else text = `${current.match(SCENE_PREFIXES.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"))?.[0] ?? "INT."} ${value}`;
    }
    const parsed = parseCharacter(text);
    const elements = [...document.elements]; elements[activeIndex] = { ...active, type, text: normalizeElementText(type, text), metadata: type === "character" ? { ...active.metadata, characterName: parsed.name, characterExtension: parsed.extension, characterExtensions: parsed.extensions } : active.metadata };
    setAutocompleteOpen(false); setSuggestionIndex(-1); commitDocument({ ...document, elements }, { index: activeIndex, cursor: elements[activeIndex].text.length });
  };

  const saveScreenplaySettings = (settings: ScreenplaySettings) => {
    const nextData = migrateProjectData({ ...projectData, screenplaySettings: settings });
    commitDocument(document, { index: activeIndex, cursor: active?.text.length ?? 0 }, true, nextData);
    setScreenplaySettingsOpen(false);
  };

  const activeScene = [...document.elements.slice(0, activeIndex + 1)].reverse().find((element) => element.type === "scene-heading");
  const sceneNumberFor = (element: ScreenplayElement) => projectData.scenes.find((scene) => scene.sceneId === element.metadata?.sceneId)?.number;
  const numberingStart = () => { const raw = window.prompt("Start scene numbering at:", String(projectData.screenplaySettings.sceneNumbers.startAt || 1)); if (raw === null) return undefined; const value = Number(raw); if (!Number.isInteger(value) || value < 1) { window.alert("Enter a whole number of 1 or greater."); return undefined; } return value; };
  const numberScenes = () => { const startAt = numberingStart(); if (!startAt) return; const settings = { ...projectData.screenplaySettings, sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, enabled: true, mode: "automatic" as const, startAt } }; commitDocument(document, { index: activeIndex, cursor: active?.text.length ?? 0 }, true, { ...projectData, screenplaySettings: settings }); setProductionMenuOpen(false); };
  const removeNumbers = () => { if (!window.confirm("Remove scene numbers from this screenplay?")) return; const removed = removeSceneNumbers(document, projectData); commitDocument(removed.document, { index: activeIndex, cursor: active?.text.length ?? 0 }, true, removed.projectData); setProductionMenuOpen(false); };
  const renumberScenes = () => { if (projectData.screenplaySettings.sceneNumbers.mode === "locked" && !window.confirm("Scene numbers are locked. Renumbering will replace production references. Continue?")) return; numberScenes(); };
  const lockSceneNumbers = () => { const numbered = synchroniseSceneMetadata(document, { ...projectData, screenplaySettings: { ...projectData.screenplaySettings, sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, enabled: true, mode: "automatic" } } }); const locked = { ...numbered.projectData, screenplaySettings: { ...numbered.projectData.screenplaySettings, sceneNumbers: { ...numbered.projectData.screenplaySettings.sceneNumbers, mode: "locked" as const } }, scenes: numbered.projectData.scenes.map((scene) => ({ ...scene, locked: true, numberingMode: "locked" as const })) }; commitDocument(numbered.document, { index: activeIndex, cursor: active?.text.length ?? 0 }, true, locked); setProductionMenuOpen(false); };
  const unlockSceneNumbers = () => { if (!window.confirm("Unlocking scene numbers may allow later renumbering to change existing production references. Continue?")) return; const data = { ...projectData, screenplaySettings: { ...projectData.screenplaySettings, sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, mode: "manual" as const } }, scenes: projectData.scenes.map((scene) => ({ ...scene, locked: false, numberingMode: "manual" as const })) }; commitDocument(document, { index: activeIndex, cursor: active?.text.length ?? 0 }, true, data); setProductionMenuOpen(false); };
  const setCurrentSceneNumber = () => { if (!activeScene) return; const requested = window.prompt("Set scene number:", sceneNumberFor(activeScene) ?? ""); if (requested === null) return; const value = requested.trim().toLocaleUpperCase("en-GB"); if (!/^\d+[A-Z]*$/u.test(value)) { window.alert("Use a number with an optional letter suffix, such as 14A."); return; } if (projectData.scenes.some((scene) => scene.sceneId !== activeScene.metadata?.sceneId && scene.number === value)) { window.alert(`Scene number ${value} is already in use.`); return; } const data = { ...projectData, screenplaySettings: { ...projectData.screenplaySettings, sceneNumbers: { ...projectData.screenplaySettings.sceneNumbers, enabled: true, mode: "manual" as const } }, scenes: projectData.scenes.map((scene) => scene.sceneId === activeScene.metadata?.sceneId ? { ...scene, number: value, locked: false, numberingMode: "manual" as const } : scene) }; commitDocument(document, { index: activeIndex, cursor: active?.text.length ?? 0 }, true, data); setProductionMenuOpen(false); };
  const activeSceneNumber = activeScene ? displaySceneNumber(activeScene, projectData) : undefined;

  return <div className="studio" onClick={() => contextMenu && setContextMenu(null)}>
    <header className="app-bar"><div className="app-left"><button className="icon-button" onClick={onHome} aria-label="Back to home"><ArrowLeft size={19}/></button><span className="mini-wordmark">OLUKOTAN</span><span className="divider"/><div><strong>{project.manifest.title}</strong><small>{dirty ? "Unsaved changes" : message || "Saved locally"}</small></div></div>
      <div className="app-actions"><span className="offline"><WifiOff size={15}/> Offline</span><button className="secondary compact" onClick={onSave} disabled={!dirty || saving || project.readOnly}><Save size={16}/>{saving ? "Saving…" : "Save"}</button><button className="icon-button" aria-label="Screenplay settings" onClick={() => setScreenplaySettingsOpen(true)}><Settings size={19}/></button></div>
    </header>
    <aside className="left-sidebar"><div className="panel-heading"><span>Scenes</span><button className="icon-button" aria-label="Collapse scene navigator"><PanelLeftClose size={17}/></button></div><div className="scene-search"><Search size={15}/><input placeholder="Search scenes" aria-label="Search scenes"/></div>
      <nav className="scene-list" aria-label="Scene navigator">{scenes.length ? scenes.map(({ element, index }) => <button key={element.metadata?.sceneId ?? element.id} onClick={() => { setActiveIndex(index); focusRequest.current = { index, cursor: 0 }; setDocument({ ...document }); }}><span>{displaySceneNumber(element, projectData) ?? ""}</span><strong>{element.text}</strong></button>) : <p>Your scene headings will appear here.<br/><br/>Start typing: <strong>INT.</strong></p>}</nav>
      <button className="folder-link" onClick={() => project.projectPath.startsWith("browser://") ? setExportOpen(true) : onReveal()}><FolderOpen size={16}/> {project.projectPath.startsWith("browser://") ? "Export screenplay…" : "Open project folder"}</button>
    </aside>
    <main className="writing-area"><div className="editor-toolbar">
      <div className="menu-control"><button onClick={() => { setFileMenuOpen((open) => !open); setProductionMenuOpen(false); }}>File</button>{fileMenuOpen && <div className="app-menu" role="menu"><button role="menuitem" onClick={() => { setExportOpen(true); setFileMenuOpen(false); }}>Export…</button><button role="menuitem" onClick={() => { setExportOpen(true); setFileMenuOpen(false); }}>Export As…</button><button role="menuitem" onClick={() => { setExportOpen(true); setFileMenuOpen(false); }}>Save Copy As…</button></div>}</div>
      <div className="menu-control"><button onClick={() => { setProductionMenuOpen((open) => !open); setFileMenuOpen(false); }}>Production</button>{productionMenuOpen && <div className="app-menu" role="menu"><button role="menuitem" disabled={!scenes.length} onClick={numberScenes}>Number Scenes…</button><button role="menuitem" disabled={!projectData.scenes.some((scene) => scene.number)} onClick={removeNumbers}>Remove Scene Numbers…</button><button role="menuitem" disabled={!scenes.length} onClick={renumberScenes}>Renumber Scenes…</button><button role="menuitem" disabled={!projectData.scenes.some((scene) => scene.number) || projectData.screenplaySettings.sceneNumbers.mode === "locked"} onClick={lockSceneNumbers}>Lock Scene Numbers</button><button role="menuitem" disabled={projectData.screenplaySettings.sceneNumbers.mode !== "locked"} onClick={unlockSceneNumbers}>Unlock Scene Numbers</button><button role="menuitem" disabled={!activeScene} onClick={setCurrentSceneNumber}>Set Current Scene Number…</button></div>}</div>
      <select aria-label="Screenplay element" value={active?.type ?? "action"} onChange={(event) => changeType(event.target.value as ScreenplayElementType)}>{SELECTABLE_TYPES.map((type) => <option key={type} value={type}>{ELEMENT_LABELS[type]}</option>)}</select>
      <button className="icon-button" aria-label="Bold" onClick={() => wrapSelection("**")}><Bold size={16}/></button><button className="icon-button" aria-label="Italic" onClick={() => wrapSelection("*")}><Italic size={16}/></button><button className="icon-button" aria-label="Underline" onClick={() => wrapSelection("_")}><Underline size={16}/></button>
      <button className="icon-button" aria-label="Undo" onClick={undo} disabled={!history.current.past.length}><Undo2 size={16}/></button><button className="icon-button" aria-label="Redo" onClick={redo} disabled={!history.current.future.length}><Redo2 size={16}/></button><button className="icon-button" aria-label="Command palette" onClick={() => setPaletteOpen(true)}><Command size={16}/></button>
      <span/><button className="icon-button" aria-label="Previous page"><ChevronLeft size={17}/></button><strong>Page 1 of ~{pages}</strong><button className="icon-button" aria-label="Next page"><ChevronRight size={17}/></button></div>
      {project.readOnly && <div className="read-only">Read-only mode — this folder cannot be written to. Your original files are unchanged.</div>}
      <div className="page-wrap"><div className="paper screenplay-paper" role="textbox" aria-label="Screenplay editor" aria-multiline="true">
        {document.elements.map((element, index) => <div className={`screenplay-block screenplay-${element.type} ${element.type === "character" ? "character-cue" : ""} ${index === activeIndex ? "is-active" : ""}`} key={element.id} data-element-type={element.type} data-rendered-cue={element.type === "character" ? renderedCharacterCue(document.elements, index, projectData.screenplaySettings) : undefined}>
          {element.type === "scene-heading" && displaySceneNumber(element, projectData) && projectData.screenplaySettings.sceneNumbers.showInEditor && ["left", "both"].includes(projectData.screenplaySettings.sceneNumbers.position) && (projectData.screenplaySettings.sceneNumbers.mode === "manual" ? <input className="scene-number-input scene-number-left" aria-label={`Scene number ${index + 1}`} value={displaySceneNumber(element, projectData)} onFocus={() => setActiveIndex(index)} onChange={(event) => updateSceneNumber(index, event.target.value.replace(/#/g, ""))}/> : <span className="scene-number-gutter scene-number-left">{displaySceneNumber(element, projectData)}</span>)}
          {element.type === "scene-heading" && displaySceneNumber(element, projectData) && projectData.screenplaySettings.sceneNumbers.showInEditor && ["right", "both"].includes(projectData.screenplaySettings.sceneNumbers.position) && <span className="scene-number-gutter scene-number-right">{displaySceneNumber(element, projectData)}</span>}
          {element.type === "page-break" ? <button className="explicit-page-break" onClick={() => setActiveIndex(index)}>Page break</button> : <textarea
            ref={(node) => { if (node) textareas.current.set(element.id, node); else textareas.current.delete(element.id); }}
            aria-label={`${ELEMENT_LABELS[element.type]} element ${index + 1}`} value={element.text} readOnly={project.readOnly} style={element.type === "character" ? { width: `calc(${Math.max(1, element.text.length)}ch + 2px)`, flexShrink: 0, whiteSpace: "pre-wrap", wordBreak: "normal", overflowWrap: "normal" } : undefined}
            rows={Math.max(1, element.text.split("\n").length)} spellCheck={!(["scene-heading", "character", "transition", "shot"].includes(element.type))}
            onFocus={() => setActiveIndex(index)} onChange={(event) => onTextChange(index, event.target.value, event.target.selectionStart)}
            onKeyDown={(event) => onKeyDown(event, index)} onPaste={(event) => onPaste(event, index)}
            onContextMenu={(event) => { event.preventDefault(); setActiveIndex(index); setContextMenu({ x: event.clientX, y: event.clientY }); }}/>} 
          {automaticContinued(document.elements, index, projectData.screenplaySettings) && !parseCharacter(element.text).extensions.some((extension) => extension.replace(/[’`]/gu, "'") === "CONT'D") && <span className="automatic-continued" aria-label="Automatic character continued">(CONT'D)</span>}
          {index === activeIndex && suggestions.length > 0 && <div className="screenplay-suggestions" role="listbox" aria-label={`${ELEMENT_LABELS[element.type]} suggestions`}>{suggestions.map((suggestion, suggestionPosition) => <button className={suggestionPosition === suggestionIndex ? "selected" : ""} key={`${suggestion.type}-${suggestion.value}`} role="option" aria-label={suggestion.value} aria-selected={suggestionPosition === suggestionIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}><span>{suggestion.value}</span><small>{suggestion.category}</small></button>)}</div>}
        </div>)}
      </div></div>
    </main>
    <aside className="right-sidebar"><div className="panel-heading"><span>Project</span><button className="icon-button" aria-label="Collapse project inspector"><PanelRightClose size={17}/></button></div><div className="inspector-section"><p className="eyebrow">Document</p><h3><FileText size={17}/> Screenplay</h3><dl><div><dt>Active element</dt><dd>{active ? ELEMENT_LABELS[active.type] : "—"}</dd></div><div><dt>Format</dt><dd>Structured Fountain</dd></div><div><dt>Page size</dt><dd>{project.manifest.pageSize}</dd></div><div><dt>Scenes</dt><dd>{scenes.length}</dd></div><div><dt>Words</dt><dd>{wordCount(fountain).toLocaleString()}</dd></div></dl><p className="pagination-note">Page count is approximate while exact font-metric pagination is under development.</p></div>
      <div className="ownership-note"><Cloud size={19}/><strong>Stored on your device</strong><p>{project.projectPath}</p></div>
    </aside>
    <footer className="status-bar"><span>{message || (dirty ? "Editing" : "All changes saved")}</span><span>{activeSceneNumber ? `Scene ${activeSceneNumber} · ` : ""}{active ? ELEMENT_LABELS[active.type] : ""} · {wordCount(fountain).toLocaleString()} words · ~{pages} {pages === 1 ? "page" : "pages"} · UTF-8</span></footer>
    {contextMenu && <div className="element-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>{active?.type === "scene-heading" && <button role="menuitem" onClick={setCurrentSceneNumber}>Set Scene Number…</button>}{SELECTABLE_TYPES.map((type) => <button role="menuitem" key={type} onClick={() => changeType(type)}>{ELEMENT_LABELS[type]} <kbd>Ctrl+{Object.entries(SHORTCUT_TYPES).find(([, value]) => value === type)?.[0] ?? ""}</kbd></button>)}</div>}
    {paletteOpen && <div className="command-palette-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="command-palette" role="dialog" aria-label="Element command palette" onMouseDown={(event) => event.stopPropagation()}><h2>Change screenplay element</h2>{SELECTABLE_TYPES.map((type) => <button key={type} onClick={() => changeType(type)}><span>{ELEMENT_LABELS[type]}</span><kbd>Ctrl+{Object.entries(SHORTCUT_TYPES).find(([, value]) => value === type)?.[0] ?? ""}</kbd></button>)}</div></div>}
    {screenplaySettingsOpen && <ScreenplaySettingsDialog initial={projectData.screenplaySettings} onClose={() => setScreenplaySettingsOpen(false)} onSave={saveScreenplaySettings}/>} 
    {exportOpen && <ExportDialog project={project} document={document} projectData={projectData} onClose={() => setExportOpen(false)} onExported={onExported}/>} 
  </div>;
}
