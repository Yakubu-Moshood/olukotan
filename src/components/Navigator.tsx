import { useMemo, useState } from "react";
import { GripVertical, Search } from "lucide-react";
import { SCENE_COLOURS, type SceneRow } from "../lib/scene-index";

/**
 * Scene navigator: number, heading, page, length in eighths, summary and colour.
 * Drag a scene to reorder the script; click to jump; double-click to edit its summary.
 */
export function Navigator({ rows, activeSceneId, onJump, onMove, onUpdate }: {
  rows: SceneRow[]; activeSceneId?: string;
  onJump(row: SceneRow): void;
  onMove(sceneId: string, beforeSceneId: string | null): void;
  onUpdate(sceneId: string, patch: { summary?: string; colour?: string }): void;
}) {
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.heading, row.summary, row.number, ...row.characters].some((value) => value?.toLocaleLowerCase().includes(q)));
  }, [rows, query]);

  return <>
    <div className="scene-search"><Search size={15}/><input placeholder="Search scenes, characters, summaries" aria-label="Search scenes" value={query} onChange={(event) => setQuery(event.target.value)}/></div>
    <nav className="scene-list navigator" aria-label="Scene navigator">
      {filtered.length ? filtered.map((row) => <div key={row.sceneId}
        className={`navigator-row ${row.sceneId === activeSceneId ? "active" : ""} ${dragging === row.sceneId ? "dragging" : ""} ${row.omitted ? "omitted" : ""}`}
        draggable={!query} onDragStart={(event) => { setDragging(row.sceneId); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", row.sceneId); }}
        onDragEnd={() => setDragging(null)} onDragOver={(event) => { if (dragging) event.preventDefault(); }}
        onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id && id !== row.sceneId) onMove(id, row.sceneId); setDragging(null); }}>
        <span className="navigator-colour" style={{ background: row.colour ?? "transparent" }}/>
        <GripVertical size={13} className="navigator-grip" aria-hidden/>
        <button className="navigator-main" onClick={() => onJump(row)} onDoubleClick={() => setEditing(row.sceneId)} aria-label={`Scene ${row.number ?? row.ordinal}: ${row.heading}`}>
          <span className="navigator-number">{row.number ?? ""}</span>
          <span className="navigator-text"><strong>{row.omitted ? "OMITTED" : row.heading}</strong>{row.summary && editing !== row.sceneId && <small>{row.summary}</small>}</span>
          <span className="navigator-meta"><span title="Page">p.{row.page ?? "–"}</span><span title="Length in eighths of a page">{row.length}</span></span>
        </button>
        {editing === row.sceneId && <div className="navigator-editor" onClick={(event) => event.stopPropagation()}>
          <textarea autoFocus rows={3} defaultValue={row.summary ?? ""} placeholder="Scene summary" aria-label="Scene summary"
            onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onUpdate(row.sceneId, { summary: event.currentTarget.value.trim() || undefined }); setEditing(null); } }}
            onBlur={(event) => { onUpdate(row.sceneId, { summary: event.currentTarget.value.trim() || undefined }); setEditing(null); }}/>
          <div className="colour-row" role="radiogroup" aria-label="Scene colour">
            {[undefined, ...SCENE_COLOURS].map((colour) => <button key={colour ?? "none"} role="radio" aria-checked={row.colour === colour} aria-label={colour ?? "No colour"} className="colour-swatch" style={{ background: colour ?? "#fff" }} onMouseDown={(event) => { event.preventDefault(); onUpdate(row.sceneId, { colour }); }}/>)}
          </div>
        </div>}
      </div>) : <p>{rows.length ? "No scenes match your search." : <>Your scene headings will appear here.<br/><br/>Start typing: <strong>INT.</strong></>}</p>}
      {dragging && !query && <div className="navigator-drop-end" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onMove(event.dataTransfer.getData("text/plain"), null); setDragging(null); }}>Move to end</div>}
    </nav>
  </>;
}

/** Index-card view of the script: one card per scene, drag to reorder. */
export function IndexCards({ rows, onJump, onMove, onUpdate }: {
  rows: SceneRow[]; onJump(row: SceneRow): void; onMove(sceneId: string, beforeSceneId: string | null): void;
  onUpdate(sceneId: string, patch: { summary?: string; colour?: string }): void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  return <div className="index-cards" aria-label="Index cards">
    {rows.map((row) => <article key={row.sceneId} className={`index-card ${dragging === row.sceneId ? "dragging" : ""}`} style={{ borderTopColor: row.colour ?? "#d8d2c6" }}
      draggable onDragStart={(event) => { setDragging(row.sceneId); event.dataTransfer.setData("text/plain", row.sceneId); }} onDragEnd={() => setDragging(null)}
      onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id && id !== row.sceneId) onMove(id, row.sceneId); setDragging(null); }}>
      <header><span>{row.number ?? row.ordinal}</span><button onClick={() => onJump(row)} title="Go to scene">{row.omitted ? "OMITTED" : row.heading}</button></header>
      <textarea aria-label={`Summary for ${row.heading}`} defaultValue={row.summary ?? ""} placeholder="What happens in this scene?" onBlur={(event) => { if ((event.currentTarget.value.trim() || undefined) !== row.summary) onUpdate(row.sceneId, { summary: event.currentTarget.value.trim() || undefined }); }}/>
      <footer><span>p.{row.page ?? "–"} · {row.length}</span><span>{row.characters.slice(0, 3).join(", ")}{row.characters.length > 3 ? "…" : ""}</span></footer>
    </article>)}
    {!rows.length && <p className="empty-cards">Add scene headings to build your index cards.</p>}
  </div>;
}
