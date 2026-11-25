import { X } from "lucide-react";
import type { SceneRow } from "../lib/scene-index";
import { SCENE_COLOURS } from "../lib/scene-index";
import type { SceneMetadata } from "../types";

const STATUSES: NonNullable<SceneMetadata["status"]>[] = ["Draft", "Needs Rewrite", "Ready", "Locked", "Production", "Shot", "Omitted"];

/** Tools → Show Scene Properties: title, summary, colour, status and facts for the scene at the cursor. */
export function ScenePropertiesPanel({ row, meta, onChange, onClose }: { row?: SceneRow; meta?: SceneMetadata; onChange(patch: Partial<SceneMetadata>): void; onClose(): void }) {
  return <aside className="scene-properties" aria-label="Scene Properties">
    <header><strong>Scene Properties</strong><button className="icon-button" aria-label="Hide Scene Properties" onClick={onClose}><X size={15}/></button></header>
    {!row ? <p className="hint">Put the cursor in a scene to see its properties.</p> : <>
      <p className="sp-heading">{row.number ? `${row.number}. ` : ""}{row.heading}</p>
      <dl><div><dt>Page</dt><dd>{row.page ?? "–"}</dd></div><div><dt>Length</dt><dd>{row.length} pg</dd></div><div><dt>Words</dt><dd>{row.words}</dd></div></dl>
      <label>Title<input value={meta?.tags?.[0] ?? ""} placeholder="Short scene title" onChange={(event) => onChange({ tags: event.target.value ? [event.target.value, ...(meta?.tags?.slice(1) ?? [])] : meta?.tags?.slice(1) })}/></label>
      <label>Summary<textarea rows={5} value={meta?.summary ?? ""} placeholder="What happens in this scene?" onChange={(event) => onChange({ summary: event.target.value || undefined })}/></label>
      <label>Status<select value={meta?.status ?? "Draft"} onChange={(event) => onChange({ status: event.target.value as SceneMetadata["status"], omitted: event.target.value === "Omitted" })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      <div className="sp-colours" role="radiogroup" aria-label="Scene colour">{[undefined, ...SCENE_COLOURS].map((colour) => <button key={colour ?? "none"} role="radio" aria-checked={meta?.colour === colour} aria-label={colour ?? "No colour"} className="colour-swatch" style={{ background: colour ?? "#fff" }} onClick={() => onChange({ colour })}/>)}</div>
      <p className="sp-cast"><strong>Characters:</strong> {row.characters.join(", ") || "—"}</p>
    </>}
  </aside>;
}
