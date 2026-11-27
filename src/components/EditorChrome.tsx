import { useRef } from "react";
import { BookOpen, CircleHelp, Info, Clipboard, Columns2, Copy, FilePlus2, FileText, FolderOpen, LayoutList, PanelLeft, PanelRight, Printer, Redo2, Rows2, Save, Scissors, SpellCheck, Undo2 } from "lucide-react";
import { ELEMENT_LABELS, type ScreenplayElementType } from "../lib/screenplay-elements";

export const SELECTABLE_TYPES: ScreenplayElementType[] = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general"];
export const ZOOMS = [50, 75, 90, 100, 110, 125, 150, 175, 200];

export interface ToolbarActions {
  newScript(): void; open(): void; save(): void; print(): void; spelling(): void; cut(): void; copy(): void; paste(): void;
  undo(): void; redo(): void; format(style: "bold" | "italic" | "underline"): void; setType(type: ScreenplayElementType): void; setZoom(zoom: number): void;
  normalView(): void; pageView(): void; info(): void; help(): void; splitVertical(): void; splitHorizontal(): void; toggleNavigator(): void; toggleProperties(): void; cards(): void;
}

const Tool = ({ id, label, hidden, onClick, disabled, active, children, tint }: { id: string; label: string; hidden: string[]; onClick(): void; disabled?: boolean; active?: boolean; children: React.ReactNode; tint?: string }) =>
  hidden.includes(id) ? null : <button className={`tool ${tint ? `tint-${tint}` : ""} ${active ? "active" : ""}`} aria-label={label} title={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{children}</button>;

export function Toolbar({ actions, hidden, activeType, zoom, canUndo, canRedo, canSave, view, split, navigator, properties }: {
  actions: ToolbarActions; hidden: string[]; activeType: ScreenplayElementType; zoom: number; canUndo: boolean; canRedo: boolean; canSave: boolean;
  view: "page" | "normal"; split: "none" | "vertical" | "horizontal"; navigator: boolean; properties: boolean;
}) {
  const group = (ids: string[], content: React.ReactNode) => ids.every((id) => hidden.includes(id)) ? null : <div className="tool-group">{content}</div>;
  return <div className="toolbar" role="toolbar" aria-label="Toolbar">
    {group(["new", "open", "save"], <>
      <Tool id="new" label="New (Ctrl+N)" tint="green" hidden={hidden} onClick={actions.newScript}><FilePlus2 size={17}/></Tool>
      <Tool id="open" label="Open (Ctrl+O)" tint="amber" hidden={hidden} onClick={actions.open}><FolderOpen size={17}/></Tool>
      <Tool id="save" label="Save (Ctrl+S)" tint="blue" hidden={hidden} disabled={!canSave} onClick={actions.save}><Save size={17}/></Tool></>)}
    {group(["print", "spelling"], <>
      <Tool id="print" label="Print (Ctrl+P)" tint="slate" hidden={hidden} onClick={actions.print}><Printer size={17}/></Tool>
      <Tool id="spelling" label="Spelling (Ctrl+D)" tint="red" hidden={hidden} onClick={actions.spelling}><SpellCheck size={17}/></Tool></>)}
    {group(["cut", "copy", "paste"], <>
      <Tool id="cut" label="Cut (Ctrl+X)" tint="slate" hidden={hidden} onClick={actions.cut}><Scissors size={17}/></Tool>
      <Tool id="copy" label="Copy (Ctrl+C)" tint="slate" hidden={hidden} onClick={actions.copy}><Copy size={17}/></Tool>
      <Tool id="paste" label="Paste (Ctrl+V)" tint="slate" hidden={hidden} onClick={actions.paste}><Clipboard size={17}/></Tool></>)}
    {group(["undo", "redo"], <>
      <Tool id="undo" label="Undo (Ctrl+Z)" tint="violet" hidden={hidden} disabled={!canUndo} onClick={actions.undo}><Undo2 size={17}/></Tool>
      <Tool id="redo" label="Redo (Ctrl+Y)" tint="violet" hidden={hidden} disabled={!canRedo} onClick={actions.redo}><Redo2 size={17}/></Tool></>)}
    {group(["format"], <>
      <Tool id="format" label="Bold" hidden={hidden} onClick={() => actions.format("bold")}><b className="fmt">B</b></Tool>
      <Tool id="format" label="Italic" hidden={hidden} onClick={() => actions.format("italic")}><i className="fmt">i</i></Tool>
      <Tool id="format" label="Underline" hidden={hidden} onClick={() => actions.format("underline")}><u className="fmt">U</u></Tool></>)}
    {!hidden.includes("element") && <select className="tool-select" aria-label="Screenplay element" value={SELECTABLE_TYPES.includes(activeType) ? activeType : "action"} onChange={(event) => actions.setType(event.target.value as ScreenplayElementType)}>{SELECTABLE_TYPES.map((type) => <option key={type} value={type}>{ELEMENT_LABELS[type]}</option>)}</select>}
    {!hidden.includes("zoom") && <select className="tool-select zoom" aria-label="Zoom" value={zoom} onChange={(event) => actions.setZoom(Number(event.target.value))}>{ZOOMS.map((value) => <option key={value} value={value}>{value}%</option>)}</select>}
    {group(["views"], <>
      <Tool id="views" label="Normal view" hidden={hidden} active={view === "normal" && split === "none"} onClick={actions.normalView}><FileText size={17}/></Tool>
      <Tool id="views" label="Page view" hidden={hidden} active={view === "page" && split === "none"} onClick={actions.pageView}><BookOpen size={17}/></Tool>
      <Tool id="views" label="Split side by side (script and index cards)" hidden={hidden} active={split === "vertical"} onClick={actions.splitVertical}><Columns2 size={17}/></Tool>
      <Tool id="views" label="Split top and bottom" hidden={hidden} active={split === "horizontal"} onClick={actions.splitHorizontal}><Rows2 size={17}/></Tool></>)}
    {group(["navigator", "properties"], <>
      <Tool id="navigator" label="Navigator" hidden={hidden} active={navigator} onClick={actions.toggleNavigator}><PanelLeft size={17}/></Tool>
      <Tool id="navigator" label="Index cards" hidden={hidden} onClick={actions.cards}><LayoutList size={17}/></Tool>
      <Tool id="properties" label="Scene Properties" hidden={hidden} active={properties} onClick={actions.toggleProperties}><PanelRight size={17}/></Tool>
      <Tool id="info" label="Script information" hidden={hidden} tint="blue" onClick={actions.info}><Info size={17}/></Tool>
      <Tool id="help" label="Help (F1)" hidden={hidden} tint="blue" onClick={actions.help}><CircleHelp size={17}/></Tool></>)}
  </div>;
}

/** Ruler in inches across the page; drag the triangles to change the current element's indents. */
export function Ruler({ widthIn, left, right, zoom, onChange }: { widthIn: number; left: number; right: number; zoom: number; onChange(left: number, right: number): void }) {
  const ruler = useRef<HTMLDivElement>(null);
  const toInches = (clientX: number) => { const rect = ruler.current!.getBoundingClientRect(); return Math.round(((clientX - rect.left) / rect.width) * widthIn * 20) / 20; };
  const drag = (which: "left" | "right") => (event: React.PointerEvent) => {
    event.preventDefault();
    const move = (e: PointerEvent) => { const x = Math.max(0.5, Math.min(widthIn - 0.25, toInches(e.clientX))); if (which === "left" && x < right - 1) onChange(x, right); if (which === "right" && x > left + 1) onChange(left, x); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const ticks = [];
  for (let i = 0; i <= widthIn * 8; i++) { const x = i / 8; ticks.push(<span key={i} className={`tick ${i % 8 === 0 ? "inch" : i % 4 === 0 ? "half" : ""}`} style={{ left: `${(x / widthIn) * 100}%` }}>{i % 8 === 0 && i ? i / 8 : ""}</span>); }
  return <div className="ruler-row"><div className="ruler" ref={ruler} style={{ width: `calc(${widthIn}in * ${zoom / 100})` }} aria-label="Ruler">
    <span className="ruler-margin" style={{ left: 0, width: `${(1.5 / widthIn) * 100}%` }}/><span className="ruler-margin" style={{ right: 0, width: `${((widthIn - 7.5) / widthIn) * 100}%` }}/>
    {ticks}
    <button className="indent-marker left" aria-label={`Left indent ${left} inches`} title="Drag to change this element's left indent" style={{ left: `${(left / widthIn) * 100}%` }} onPointerDown={drag("left")}/>
    <button className="indent-marker right" aria-label={`Right indent ${right} inches`} title="Drag to change this element's right indent" style={{ left: `${(right / widthIn) * 100}%` }} onPointerDown={drag("right")}/>
  </div></div>;
}

export function StatusBar({ hint, scene, page, pages, element, caps, num, extra }: { hint: string; scene: string; page: string; pages: number; element: string; caps: boolean; num: boolean; extra?: React.ReactNode }) {
  return <footer className="status-bar fd" role="status">
    <span className="sb-hint">{hint}</span><span className="sb-extra">{extra}</span>
    <span className="sb-cell">{scene}</span><span className="sb-cell">{page} of {pages}</span><span className="sb-cell">{element}</span>
    <span className={`sb-key ${caps ? "on" : ""}`}>CAP</span><span className={`sb-key ${num ? "on" : ""}`}>NUM</span>
  </footer>;
}
