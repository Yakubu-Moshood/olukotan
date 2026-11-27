import { useRef, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import type { Beat } from "../types";
import { SCENE_COLOURS, type SceneRow } from "../lib/scene-index";

const CARD_W = 220, CARD_H = 130;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `beat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Free-form Beat Board: brainstorm story beats as cards on a canvas, drag them
 * around, colour them and link them to scenes. Double-click empty space to add.
 */
export function BeatBoard({ beats, scenes, onChange, onCreateScene, onJump }: {
  beats: Beat[]; scenes: SceneRow[];
  onChange(beats: Beat[]): void;
  onCreateScene(beat: Beat): void;
  onJump(row: SceneRow): void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [local, setLocal] = useState<Beat[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const current = local ?? beats;

  const add = (x = 40 + (current.length % 5) * (CARD_W + 20), y = 40 + Math.floor(current.length / 5) * (CARD_H + 20)) => {
    const beat: Beat = { id: newId(), title: "New beat", x, y };
    onChange([...current, beat]); setSelected(beat.id);
  };
  const patch = (id: string, value: Partial<Beat>) => onChange(current.map((beat) => beat.id === id ? { ...beat, ...value } : beat));
  const remove = (id: string) => { onChange(current.filter((beat) => beat.id !== id)); setSelected(null); };

  const point = (event: React.PointerEvent) => { const rect = board.current!.getBoundingClientRect(); return { x: event.clientX - rect.left + board.current!.scrollLeft, y: event.clientY - rect.top + board.current!.scrollTop }; };

  return <div className="beat-board-wrap">
    <div className="beat-toolbar"><button className="secondary compact" onClick={() => add()}><Plus size={15}/> Add beat</button><span>Double-click the board to add a beat · drag cards to arrange · link a beat to a scene or turn it into one</span></div>
    <div ref={board} className="beat-board" aria-label="Beat Board" onDoubleClick={(event) => { if (event.target === board.current) { const p = point(event as unknown as React.PointerEvent); add(Math.max(0, p.x - CARD_W / 2), Math.max(0, p.y - 20)); } }}
      onPointerMove={(event) => { const state = drag.current; if (!state) return; const p = point(event); state.moved = true; setLocal(current.map((beat) => beat.id === state.id ? { ...beat, x: Math.max(0, p.x - state.dx), y: Math.max(0, p.y - state.dy) } : beat)); }}
      onPointerUp={() => { if (drag.current?.moved && local) onChange(local); drag.current = null; setLocal(null); }}>
      {current.map((beat) => {
        const linked = scenes.filter((scene) => beat.sceneIds?.includes(scene.sceneId));
        return <article key={beat.id} className={`beat-card ${selected === beat.id ? "selected" : ""}`} style={{ left: beat.x, top: beat.y, width: CARD_W, borderTopColor: beat.colour ?? "#bd4d31" }}
          onPointerDown={(event) => { setSelected(beat.id); if ((event.target as HTMLElement).closest("input,textarea,button,select")) return; const p = point(event); drag.current = { id: beat.id, dx: p.x - beat.x, dy: p.y - beat.y, moved: false }; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); }}>
          <input className="beat-title" aria-label="Beat title" defaultValue={beat.title} onBlur={(event) => event.target.value !== beat.title && patch(beat.id, { title: event.target.value })}/>
          <textarea className="beat-body" aria-label="Beat description" rows={3} defaultValue={beat.body ?? ""} placeholder="What happens…" onBlur={(event) => (event.target.value || undefined) !== beat.body && patch(beat.id, { body: event.target.value || undefined })}/>
          {linked.length > 0 && <div className="beat-links">{linked.map((scene) => <button key={scene.sceneId} onClick={() => onJump(scene)} title={scene.heading}><Link2 size={11}/> {scene.number ?? scene.ordinal}</button>)}</div>}
          {selected === beat.id && <div className="beat-actions">
            <div className="colour-row">{SCENE_COLOURS.map((colour) => <button key={colour} className="colour-swatch" aria-label={`Colour ${colour}`} style={{ background: colour }} onClick={() => patch(beat.id, { colour })}/>)}</div>
            <select aria-label="Link to scene" value="" onChange={(event) => { const id = event.target.value; if (id) patch(beat.id, { sceneIds: [...new Set([...(beat.sceneIds ?? []), id])] }); }}>
              <option value="">Link to scene…</option>{scenes.map((scene) => <option key={scene.sceneId} value={scene.sceneId}>{scene.number ?? scene.ordinal}. {scene.heading}</option>)}
            </select>
            <div className="beat-buttons"><button className="secondary compact" onClick={() => onCreateScene(beat)}>Make scene</button><button className="icon-button" aria-label="Delete beat" onClick={() => remove(beat.id)}><Trash2 size={15}/></button></div>
          </div>}
        </article>;
      })}
      {!current.length && <p className="beat-empty">Your Beat Board is empty. Double-click anywhere to add the first beat.</p>}
    </div>
  </div>;
}
