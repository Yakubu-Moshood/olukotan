import { useState } from "react";
import { Modal, Check, Field } from "./Modal";
import { ELEMENT_SPECS } from "../../lib/pagination";
import { ELEMENT_LABELS, type ScreenplayElementType } from "../../lib/screenplay-elements";
import type { ElementStyle, ProjectData } from "../../types";

const FORMATTABLE: ScreenplayElementType[] = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general"];

/** Format → Elements… (Ctrl+Shift+E): indents, spacing, alignment and style for each element type. */
export function ElementsDialog({ projectData, initialType, onSave, onClose }: { projectData: ProjectData; initialType: ScreenplayElementType; onSave(styles: ProjectData["elementStyles"], sceneHeadingSpacing: 1 | 2): void; onClose(): void }) {
  const [styles, setStyles] = useState<Partial<Record<string, ElementStyle>>>(() => structuredClone(projectData.elementStyles ?? {}));
  const [type, setType] = useState<ScreenplayElementType>(FORMATTABLE.includes(initialType) ? initialType : "action");
  const [sceneSpacing, setSceneSpacing] = useState<1 | 2>(projectData.screenplaySettings.pagination.sceneHeadingSpacing ?? 2);
  const base = ELEMENT_SPECS[type];
  const style = styles[type] ?? {};
  const patch = (value: Partial<ElementStyle>) => setStyles({ ...styles, [type]: { ...style, ...value } });
  const left = style.left ?? base.left, right = style.right ?? base.right;
  const before = style.spaceBefore ?? (type === "scene-heading" ? sceneSpacing : base.before);
  const valid = right - left >= 1;
  return <Modal title="Elements" eyebrow="Format" onClose={onClose} width={720} footer={<>
    <button className="secondary" onClick={() => { const next = { ...styles }; delete next[type]; setStyles(next); }}>Reset {ELEMENT_LABELS[type]}</button>
    <span className="spacer"/><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!valid} onClick={() => onSave(styles, sceneSpacing)}>Apply</button></>}>
    <div className="ol-split">
      <nav className="ol-list" aria-label="Element type">{FORMATTABLE.map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{ELEMENT_LABELS[item]}{styles[item] && Object.keys(styles[item]!).length ? " •" : ""}</button>)}</nav>
      <div>
        <h3>{ELEMENT_LABELS[type]}</h3>
        <div className="ol-grid2">
          <Field label="Left indent (inches from page edge)"><input type="number" step="0.05" min="0.5" max="7" value={left} onChange={(event) => patch({ left: Number(event.target.value) })}/></Field>
          <Field label="Right indent (inches from page edge)"><input type="number" step="0.05" min="1.5" max="8" value={right} onChange={(event) => patch({ right: Number(event.target.value) })}/></Field>
          <Field label="Space before (blank lines)"><select value={before} onChange={(event) => type === "scene-heading" && !style.spaceBefore ? setSceneSpacing(Number(event.target.value) as 1 | 2) : patch({ spaceBefore: Number(event.target.value) })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Line spacing"><select value={style.spacing ?? 1} onChange={(event) => patch({ spacing: Number(event.target.value) as 1 | 1.5 | 2 })}><option value={1}>Single</option><option value={1.5}>1.5 lines</option><option value={2}>Double</option></select></Field>
          <Field label="Alignment"><select value={style.align ?? base.align} onChange={(event) => patch({ align: event.target.value as ElementStyle["align"] })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></Field>
        </div>
        <div className="ol-row"><Check label="ALL CAPS" checked={!!style.caps} onChange={(caps) => patch({ caps })}/><Check label="Bold" checked={!!style.bold} onChange={(bold) => patch({ bold })}/><Check label="Italic" checked={!!style.italic} onChange={(italic) => patch({ italic })}/><Check label="Underline" checked={!!style.underline} onChange={(underline) => patch({ underline })}/></div>
        {!valid && <div className="error">The right indent must be at least 1 inch to the right of the left indent.</div>}
        <div className="ol-ruler-preview" aria-hidden><div className="page"><div className="text" style={{ marginLeft: `${((left - 0) / 8.5) * 100}%`, width: `${((right - left) / 8.5) * 100}%`, textAlign: style.align ?? base.align, fontWeight: style.bold ? 700 : 400, fontStyle: style.italic ? "italic" : "normal", textDecoration: style.underline ? "underline" : "none", textTransform: style.caps ? "uppercase" : "none" }}>{type === "character" ? "TOLU" : type === "parenthetical" ? "(quietly)" : type === "transition" ? "CUT TO:" : type === "scene-heading" ? "INT. ỌJÀ MARKET - NIGHT" : "Rain hammers the tin roofs as she counts the doors."}</div></div></div>
        <p className="hint">Changes apply to every {ELEMENT_LABELS[type].toLowerCase()} in this script, in the editor, PDF and page count.</p>
      </div>
    </div>
  </Modal>;
}

/** Format → Font…: script font and size, plus bold/italic/underline for the current selection. */
export function FontDialog({ projectData, onSave, onStyle, onClose }: { projectData: ProjectData; onSave(font: { family: string; size: number }): void; onStyle(style: "bold" | "italic" | "underline"): void; onClose(): void }) {
  const [family, setFamily] = useState(projectData.font?.family ?? "Courier Prime");
  const [size, setSize] = useState(projectData.font?.size ?? 12);
  return <Modal title="Font" eyebrow="Format" onClose={onClose} width={460} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave({ family, size })}>Apply</button></>}>
    <Field label="Font" hint="PDFs always use Courier Prime (embedded, so every reader sees the same pages).">
      <select value={family} onChange={(event) => setFamily(event.target.value)}><option>Courier Prime</option><option>Courier New</option><option>Courier</option></select></Field>
    <Field label="Size (points)" hint="12 pt is the industry standard; other sizes change the page count.">
      <select value={size} onChange={(event) => setSize(Number(event.target.value))}>{[10, 11, 12, 13, 14].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
    <div className="ol-preview" style={{ fontFamily: `"${family}", "Courier New", monospace`, fontSize: `${size}pt` }}>INT. ỌJÀ MARKET - NIGHT</div>
    <Field label="Style of selected text"><div className="ol-row">
      <button className="secondary" onClick={() => onStyle("bold")}><b>Bold</b></button><button className="secondary" onClick={() => onStyle("italic")}><i>Italic</i></button><button className="secondary" onClick={() => onStyle("underline")}><u>Underline</u></button></div></Field>
  </Modal>;
}
