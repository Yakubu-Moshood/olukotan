import { ArrowLeft, Bold, ChevronLeft, ChevronRight, Cloud, Command, FileText, FolderOpen, Italic, PanelLeftClose, PanelRightClose, Redo2, Save, Search, Settings, Underline, Undo2, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { approximatePageCount, wordCount } from "../lib/screenplay";
import {
  ELEMENT_LABELS, SCENE_PREFIXES, TIMES_OF_DAY, applyEnter, applyTab, collectKnownCharacters,
  collectSceneLocations, createElement, normalizeElementText, normalizedCursorPosition, parseCharacter,
  parseFountain, screenplayPasteElements, serializeFountain, updateElementText,
  type EditResult, type ScreenplayDocument, type ScreenplayElement, type ScreenplayElementType,
} from "../lib/screenplay-elements";
import type { ProjectPayload } from "../types";

const SELECTABLE_TYPES: ScreenplayElementType[] = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general"];
const SHORTCUT_TYPES: Record<string, ScreenplayElementType> = { "1": "scene-heading", "2": "action", "3": "character", "4": "parenthetical", "5": "dialogue", "6": "transition", "7": "shot", "0": "general" };

interface History { past: ScreenplayDocument[]; future: ScreenplayDocument[] }
interface FocusRequest { index: number; cursor: number }

function cloneDocument(value: ScreenplayDocument): ScreenplayDocument { return structuredClone(value); }

export function Editor({ project, content, dirty, saving, message, onChange, onSave, onHome, onReveal }: {
  project: ProjectPayload; content: string; dirty: boolean; saving: boolean; message: string;
  onChange(value: string): void; onSave(): void; onHome(): void; onReveal(): void;
}) {
  const [document, setDocument] = useState<ScreenplayDocument>(() => parseFountain(content));
  const [activeIndex, setActiveIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const focusRequest = useRef<FocusRequest | null>(null);
  const history = useRef<History>({ past: [], future: [] });
  const lastSerialized = useRef(content);

  useEffect(() => {
    if (content === lastSerialized.current) return;
    const parsed = parseFountain(content); setDocument(parsed); setActiveIndex(0);
    history.current = { past: [], future: [] }; lastSerialized.current = content;
  }, [content]);

  useEffect(() => {
    const request = focusRequest.current; if (!request) return;
    const element = document.elements[request.index]; const area = element && textareas.current.get(element.id);
    if (area) { area.focus(); area.setSelectionRange(request.cursor, request.cursor); area.scrollIntoView?.({ block: "nearest" }); }
    focusRequest.current = null;
  }, [document]);

  const commitDocument = (next: ScreenplayDocument, focus?: FocusRequest, record = true) => {
    if (record) { history.current.past.push(cloneDocument(document)); history.current.past = history.current.past.slice(-150); history.current.future = []; }
    setDocument(next); if (focus) { setActiveIndex(focus.index); focusRequest.current = focus; }
    const fountain = serializeFountain(next); lastSerialized.current = fountain; onChange(fountain);
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
    const metadata = type === "character" ? { ...current.metadata, characterName: parseCharacter(text).name, characterExtension: parseCharacter(text).extension } : current.metadata;
    elements[index] = { ...current, type, text, metadata };
    commitDocument({ ...document, elements }, { index, cursor: type === "parenthetical" ? Math.max(1, text.length - 1) : text.length });
    setPaletteOpen(false); setContextMenu(null);
  };

  const updateSceneNumber = (index: number, sceneNumber: string) => {
    const elements = [...document.elements]; const current = elements[index];
    elements[index] = { ...current, metadata: { ...current.metadata, sceneNumber: sceneNumber || undefined } };
    commitDocument({ ...document, elements }, { index, cursor: current.text.length });
  };

  const onTextChange = (index: number, raw: string, cursor: number) => {
    const result = updateElementText(document.elements, index, raw);
    result.cursorPosition = normalizedCursorPosition(result.elements[index].type, raw, cursor);
    commitResult(result);
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
    if (!active) return [] as string[];
    const query = active.text.trim().toLocaleUpperCase("en-GB");
    if (active.type === "character") return knownCharacters.filter((name) => name.startsWith(parseCharacter(query).name) && name !== parseCharacter(query).name).slice(0, 6);
    if (active.type === "action") {
      const characterMatches = knownCharacters.filter((name) => name.startsWith(query) && name !== query);
      const prefixMatches = SCENE_PREFIXES.filter((prefix) => prefix.startsWith(query));
      return [...characterMatches, ...prefixMatches].slice(0, 6);
    }
    if (active.type === "scene-heading") {
      if (!query || !SCENE_PREFIXES.some((prefix) => query.startsWith(prefix))) return SCENE_PREFIXES.filter((prefix) => prefix.startsWith(query)).slice(0, 6);
      const afterDash = query.includes(" - ");
      return (afterDash ? TIMES_OF_DAY.filter((time) => time.startsWith(query.split(" - ").at(-1) ?? "")) : sceneLocations.filter((location) => location.includes(query.replace(/^[A-Z./]+\s*/u, "")))).slice(0, 6);
    }
    return [] as string[];
  }, [active, knownCharacters, sceneLocations]);

  const chooseSuggestion = (value: string) => {
    if (!active) return;
    let text = value; let type = active.type;
    if (active.type === "action") type = SCENE_PREFIXES.includes(value) ? "scene-heading" : "character";
    if (type === "scene-heading") {
      const current = active.text;
      if (SCENE_PREFIXES.includes(value)) text = `${value} `;
      else if (TIMES_OF_DAY.includes(value)) text = `${current.replace(/\s+-\s+[^-]*$/u, "")} - ${value}`;
      else text = `${current.match(SCENE_PREFIXES.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"))?.[0] ?? "INT."} ${value}`;
    }
    const elements = [...document.elements]; elements[activeIndex] = { ...active, type, text: normalizeElementText(type, text), metadata: type === "character" ? { ...active.metadata, characterName: parseCharacter(text).name } : active.metadata };
    commitDocument({ ...document, elements }, { index: activeIndex, cursor: elements[activeIndex].text.length });
  };

  return <div className="studio" onClick={() => contextMenu && setContextMenu(null)}>
    <header className="app-bar"><div className="app-left"><button className="icon-button" onClick={onHome} aria-label="Back to home"><ArrowLeft size={19}/></button><span className="mini-wordmark">OLUKOTAN</span><span className="divider"/><div><strong>{project.manifest.title}</strong><small>{dirty ? "Unsaved changes" : message || "Saved locally"}</small></div></div>
      <div className="app-actions"><span className="offline"><WifiOff size={15}/> Offline</span><button className="secondary compact" onClick={onSave} disabled={!dirty || saving || project.readOnly}><Save size={16}/>{saving ? "Saving…" : "Save"}</button><button className="icon-button" aria-label="Settings"><Settings size={19}/></button></div>
    </header>
    <aside className="left-sidebar"><div className="panel-heading"><span>Scenes</span><button className="icon-button" aria-label="Collapse scene navigator"><PanelLeftClose size={17}/></button></div><div className="scene-search"><Search size={15}/><input placeholder="Search scenes" aria-label="Search scenes"/></div>
      <nav className="scene-list" aria-label="Scene navigator">{scenes.length ? scenes.map(({ element, index }, sceneIndex) => <button key={element.id} onClick={() => { setActiveIndex(index); focusRequest.current = { index, cursor: 0 }; setDocument({ ...document }); }}><span>{element.metadata?.sceneNumber ?? sceneIndex + 1}</span><strong>{element.text}</strong></button>) : <p>Your scene headings will appear here.<br/><br/>Start typing: <strong>INT.</strong></p>}</nav>
      <button className="folder-link" onClick={onReveal}><FolderOpen size={16}/> {project.projectPath.startsWith("browser://") ? "Export Fountain file" : "Open project folder"}</button>
    </aside>
    <main className="writing-area"><div className="editor-toolbar">
      <select aria-label="Screenplay element" value={active?.type ?? "action"} onChange={(event) => changeType(event.target.value as ScreenplayElementType)}>{SELECTABLE_TYPES.map((type) => <option key={type} value={type}>{ELEMENT_LABELS[type]}</option>)}</select>
      <button className="icon-button" aria-label="Bold" onClick={() => wrapSelection("**")}><Bold size={16}/></button><button className="icon-button" aria-label="Italic" onClick={() => wrapSelection("*")}><Italic size={16}/></button><button className="icon-button" aria-label="Underline" onClick={() => wrapSelection("_")}><Underline size={16}/></button>
      <button className="icon-button" aria-label="Undo" onClick={undo} disabled={!history.current.past.length}><Undo2 size={16}/></button><button className="icon-button" aria-label="Redo" onClick={redo} disabled={!history.current.future.length}><Redo2 size={16}/></button><button className="icon-button" aria-label="Command palette" onClick={() => setPaletteOpen(true)}><Command size={16}/></button>
      <span/><button className="icon-button" aria-label="Previous page"><ChevronLeft size={17}/></button><strong>Page 1 of ~{pages}</strong><button className="icon-button" aria-label="Next page"><ChevronRight size={17}/></button></div>
      {project.readOnly && <div className="read-only">Read-only mode — this folder cannot be written to. Your original files are unchanged.</div>}
      <div className="page-wrap"><div className="paper screenplay-paper" role="textbox" aria-label="Screenplay editor" aria-multiline="true">
        {document.elements.map((element, index) => <div className={`screenplay-block screenplay-${element.type} ${index === activeIndex ? "is-active" : ""}`} key={element.id} data-element-type={element.type}>
          {element.type === "scene-heading" && <input className="scene-number-input" aria-label={`Scene number ${index + 1}`} value={element.metadata?.sceneNumber ?? ""} placeholder="#" onFocus={() => setActiveIndex(index)} onChange={(event) => updateSceneNumber(index, event.target.value.replace(/#/g, ""))}/>} 
          {element.type === "page-break" ? <button className="explicit-page-break" onClick={() => setActiveIndex(index)}>Page break</button> : <textarea
            ref={(node) => { if (node) textareas.current.set(element.id, node); else textareas.current.delete(element.id); }}
            aria-label={`${ELEMENT_LABELS[element.type]} element ${index + 1}`} value={element.text} readOnly={project.readOnly}
            rows={Math.max(1, element.text.split("\n").length)} spellCheck={!(["scene-heading", "character", "transition", "shot"].includes(element.type))}
            onFocus={() => setActiveIndex(index)} onChange={(event) => onTextChange(index, event.target.value, event.target.selectionStart)}
            onKeyDown={(event) => onKeyDown(event, index)} onPaste={(event) => onPaste(event, index)}
            onContextMenu={(event) => { event.preventDefault(); setActiveIndex(index); setContextMenu({ x: event.clientX, y: event.clientY }); }}/>} 
          {index === activeIndex && suggestions.length > 0 && <div className="screenplay-suggestions" role="listbox" aria-label={`${ELEMENT_LABELS[element.type]} suggestions`}>{suggestions.map((suggestion) => <button key={suggestion} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)}>{suggestion}</button>)}</div>}
        </div>)}
      </div></div>
    </main>
    <aside className="right-sidebar"><div className="panel-heading"><span>Project</span><button className="icon-button" aria-label="Collapse project inspector"><PanelRightClose size={17}/></button></div><div className="inspector-section"><p className="eyebrow">Document</p><h3><FileText size={17}/> Screenplay</h3><dl><div><dt>Active element</dt><dd>{active ? ELEMENT_LABELS[active.type] : "—"}</dd></div><div><dt>Format</dt><dd>Structured Fountain</dd></div><div><dt>Page size</dt><dd>{project.manifest.pageSize}</dd></div><div><dt>Scenes</dt><dd>{scenes.length}</dd></div><div><dt>Words</dt><dd>{wordCount(fountain).toLocaleString()}</dd></div></dl><p className="pagination-note">Page count is approximate while exact font-metric pagination is under development.</p></div>
      <div className="ownership-note"><Cloud size={19}/><strong>Stored on your device</strong><p>{project.projectPath}</p></div>
    </aside>
    <footer className="status-bar"><span>{message || (dirty ? "Editing" : "All changes saved")}</span><span>{active ? ELEMENT_LABELS[active.type] : ""} · {wordCount(fountain).toLocaleString()} words · ~{pages} {pages === 1 ? "page" : "pages"} · UTF-8</span></footer>
    {contextMenu && <div className="element-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>{SELECTABLE_TYPES.map((type) => <button role="menuitem" key={type} onClick={() => changeType(type)}>{ELEMENT_LABELS[type]} <kbd>Ctrl+{Object.entries(SHORTCUT_TYPES).find(([, value]) => value === type)?.[0] ?? ""}</kbd></button>)}</div>}
    {paletteOpen && <div className="command-palette-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="command-palette" role="dialog" aria-label="Element command palette" onMouseDown={(event) => event.stopPropagation()}><h2>Change screenplay element</h2>{SELECTABLE_TYPES.map((type) => <button key={type} onClick={() => changeType(type)}><span>{ELEMENT_LABELS[type]}</span><kbd>Ctrl+{Object.entries(SHORTCUT_TYPES).find(([, value]) => value === type)?.[0] ?? ""}</kbd></button>)}</div></div>}
  </div>;
}
