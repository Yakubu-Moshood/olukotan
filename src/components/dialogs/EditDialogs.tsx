import { useMemo, useState } from "react";
import { Modal, Check, Field } from "./Modal";
import { findAll, type FindOptions, type Match } from "../../lib/find";
import { ELEMENT_LABELS, type ScreenplayElement, type ScreenplayElementType } from "../../lib/screenplay-elements";
import type { SceneRow } from "../../lib/scene-index";

const SEARCHABLE: ScreenplayElementType[] = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general", "note"];

/** Edit → Find… (Ctrl+F): find, replace, replace all; stays open while you work. */
export function FindDialog({ elements, initialQuery, onFind, onReplace, onReplaceAll, onClose }: {
  elements: ScreenplayElement[]; initialQuery: string;
  onFind(options: FindOptions, backwards: boolean): Match | undefined;
  onReplace(options: FindOptions, replacement: string): boolean;
  onReplaceAll(options: FindOptions, replacement: string): number;
  onClose(): void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [types, setTypes] = useState<ScreenplayElementType[]>([]);
  const [status, setStatus] = useState("");
  const options: FindOptions = { query, matchCase, wholeWord, types };
  const count = useMemo(() => findAll(elements, options).length, [elements, query, matchCase, wholeWord, types]);
  const find = (backwards = false) => { const match = onFind(options, backwards); setStatus(match ? "" : `“${query}” wasn't found.`); };
  return <Modal title="Find" eyebrow="Edit" onClose={onClose} modeless width={430}>
    <form onSubmit={(event) => { event.preventDefault(); find(); }}>
      <Field label="Find what"><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setStatus(""); }}/></Field>
      <Field label="Replace with"><input value={replacement} onChange={(event) => setReplacement(event.target.value)}/></Field>
      <div className="ol-row"><Check label="Match case" checked={matchCase} onChange={setMatchCase}/><Check label="Whole word" checked={wholeWord} onChange={setWholeWord}/></div>
      <Field label="Look in"><select value={types[0] ?? ""} onChange={(event) => setTypes(event.target.value ? [event.target.value as ScreenplayElementType] : [])}><option value="">All elements</option>{SEARCHABLE.map((type) => <option key={type} value={type}>{ELEMENT_LABELS[type]}</option>)}</select></Field>
      <p className="ol-status" role="status">{status || (query ? `${count} match${count === 1 ? "" : "es"} in the script` : "")}</p>
      <div className="ol-actions wrap">
        <button type="button" className="secondary" disabled={!query} onClick={() => find(true)}>Find Previous</button>
        <button className="primary" disabled={!query}>Find Next</button>
        <button type="button" className="secondary" disabled={!query} onClick={() => { if (!onReplace(options, replacement)) find(); else find(); }}>Replace</button>
        <button type="button" className="secondary" disabled={!query || !count} onClick={() => { const n = onReplaceAll(options, replacement); setStatus(`Replaced ${n} occurrence${n === 1 ? "" : "s"}.`); }}>Replace All</button>
      </div>
    </form>
  </Modal>;
}

/** Edit → Go To… (Ctrl+G): jump to a page, scene number or bookmark. */
export function GoToDialog({ pages, scenes, bookmarks, onPage, onScene, onBookmark, onClose }: {
  pages: string[]; scenes: SceneRow[]; bookmarks: { id: string; name: string }[];
  onPage(label: string): void; onScene(row: SceneRow): void; onBookmark(id: string): void; onClose(): void;
}) {
  const [mode, setMode] = useState<"page" | "scene" | "bookmark">("page");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const go = () => {
    if (mode === "page") { const label = pages.find((page) => page.toLowerCase() === value.trim().toLowerCase()); if (!label) { setError(`There is no page ${value}. Pages run 1–${pages.at(-1)}.`); return; } onPage(label); }
    if (mode === "scene") { const row = scenes.find((scene) => (scene.number ?? String(scene.ordinal)).toLowerCase() === value.trim().toLowerCase()); if (!row) { setError(`There is no scene ${value}.`); return; } onScene(row); }
    if (mode === "bookmark") { if (!value) { setError("Choose a bookmark."); return; } onBookmark(value); }
    onClose();
  };
  return <Modal title="Go To" eyebrow="Edit" onClose={onClose} width={400} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={go}>Go</button></>}>
    <div className="ol-segmented" role="radiogroup">{(["page", "scene", "bookmark"] as const).map((item) => <button key={item} role="radio" aria-checked={mode === item} className={mode === item ? "active" : ""} onClick={() => { setMode(item); setValue(""); setError(""); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {mode === "bookmark"
      ? <Field label="Bookmark"><select autoFocus value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose…</option>{bookmarks.map((bookmark) => <option key={bookmark.id} value={bookmark.id}>{bookmark.name}</option>)}</select></Field>
      : <Field label={mode === "page" ? `Page (1–${pages.at(-1)})` : "Scene number"}><input autoFocus value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} onKeyDown={(event) => event.key === "Enter" && go()}/></Field>}
    {error && <div className="error" role="alert">{error}</div>}
  </Modal>;
}
