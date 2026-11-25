import { useEffect, useMemo, useRef, useState } from "react";
import type NSpell from "nspell";
import { Pause, Play, Square } from "lucide-react";
import { Modal, Check, Field } from "./Modal";
import { findMisspellings, loadSpellChecker, type Misspelling } from "../../lib/spelling";
import { lookUpWord, type ThesaurusResult } from "../../lib/thesaurus";
import { availableVoices, NARRATOR, ScriptReader, speechLines, type SpeechLine } from "../../lib/speech";
import { NAME_ORIGINS, searchNames, type NameGender } from "../../lib/names-db";
import { checkFormat, type FormatIssue } from "../../lib/format-assistant";
import { compareScripts, type DiffEntry } from "../../lib/compare";
import { importScreenplayBytes, IMPORT_ACCEPT } from "../../lib/importers";
import { ELEMENT_LABELS, type ScreenplayElement, type ScreenplayElementType } from "../../lib/screenplay-elements";
import { visibleText } from "../../lib/rich-text";
import type { AppSettings, ToolbarPrefs, VoiceAssignment } from "../../types";
import type { Menu } from "../MenuBar";
import { shortcutItems } from "../MenuBar";

/** Tools → Spelling… (Ctrl+D): steps through misspelt words with suggestions (British English). */
export function SpellingDialog({ elements, customWords, knownNames, onSelect, onReplace, onAddWord, onClose }: {
  elements: ScreenplayElement[]; customWords: string[]; knownNames: string[];
  onSelect(miss: Misspelling): void; onReplace(miss: Misspelling, replacement: string, all: boolean): void; onAddWord(word: string): void; onClose(): void;
}) {
  const [spell, setSpell] = useState<NSpell | null>(null);
  const [error, setError] = useState("");
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [replacement, setReplacement] = useState("");
  useEffect(() => { loadSpellChecker().then(setSpell).catch(() => setError("The dictionary couldn't be loaded.")); }, []);
  const custom = useMemo(() => new Set([...customWords, ...knownNames, ...ignored].map((word) => word.toLocaleLowerCase("en-GB"))), [customWords, knownNames, ignored]);
  const misses = useMemo(() => (spell ? findMisspellings(spell, elements, custom) : []).filter((miss) => !skipped.has(`${miss.index}:${miss.start}`)), [spell, elements, custom, skipped]);
  const current = misses[0];
  const suggestions = useMemo(() => (spell && current ? spell.suggest(current.word).slice(0, 8) : []), [spell, current]);
  useEffect(() => { if (current) { onSelect(current); setReplacement(suggestions[0] ?? current.word); } }, [current?.index, current?.start, current?.word]);
  return <Modal title="Spelling" eyebrow="Tools · British English" onClose={onClose} modeless width={460}>
    {error && <div className="error">{error}</div>}
    {!spell && !error && <p className="hint">Loading the British English dictionary…</p>}
    {spell && !current && <p className="ol-message">✓ No spelling mistakes found. Character names and Yoruba words with tone marks are skipped.</p>}
    {current && <>
      <p className="ol-context">{visibleText(elements[current.index].text).slice(Math.max(0, current.start - 30), current.start)}<mark>{current.word}</mark>{visibleText(elements[current.index].text).slice(current.end, current.end + 30)}</p>
      <Field label="Change to"><input autoFocus value={replacement} onChange={(event) => setReplacement(event.target.value)}/></Field>
      <div className="ol-chips">{suggestions.map((word) => <button key={word} className={replacement === word ? "active" : ""} onClick={() => setReplacement(word)}>{word}</button>)}{!suggestions.length && <span className="hint">No suggestions.</span>}</div>
      <div className="ol-actions wrap">
        <button className="secondary" onClick={() => setSkipped(new Set([...skipped, `${current.index}:${current.start}`]))}>Ignore</button>
        <button className="secondary" onClick={() => setIgnored(new Set([...ignored, current.word]))}>Ignore All</button>
        <button className="secondary" onClick={() => onAddWord(current.word)}>Add to Dictionary</button>
        <button className="secondary" onClick={() => onReplace(current, replacement, true)}>Change All</button>
        <button className="primary" onClick={() => onReplace(current, replacement, false)}>Change</button>
      </div>
      <p className="hint">{misses.length} word{misses.length === 1 ? "" : "s"} to check.</p>
    </>}
  </Modal>;
}

/** Tools → Thesaurus… (Ctrl+Shift+D): synonyms for the selected word (online). */
export function ThesaurusDialog({ initialWord, onReplace, onClose }: { initialWord: string; onReplace(word: string): void; onClose(): void }) {
  const [word, setWord] = useState(initialWord);
  const [result, setResult] = useState<ThesaurusResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const look = async (value = word) => { if (!value.trim()) return; setState("loading"); try { setResult(await lookUpWord(value)); setState("idle"); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setState("error"); } };
  useEffect(() => { if (initialWord) void look(initialWord); }, []);
  const list = (title: string, words: string[]) => words.length ? <section><h4>{title}</h4><div className="ol-chips">{words.map((item) => <button key={item} onClick={() => onReplace(item)} title="Replace the selected word">{item}</button>)}</div></section> : null;
  return <Modal title="Thesaurus" eyebrow="Tools" onClose={onClose} modeless width={480}>
    <form className="ol-row" onSubmit={(event) => { event.preventDefault(); void look(); }}><input aria-label="Word" autoFocus value={word} onChange={(event) => setWord(event.target.value)}/><button className="primary">Look up</button></form>
    {state === "loading" && <p className="hint">Looking up “{word}”…</p>}
    {state === "error" && <div className="error">{error}</div>}
    {result && state === "idle" && <>{list("Synonyms", result.synonyms)}{list("Similar meaning", result.related)}{list("Opposites", result.antonyms)}{!result.synonyms.length && !result.related.length && <p className="hint">Nothing found for “{word}”.</p>}<p className="hint">Click a word to replace the selection in your script.</p></>}
  </Modal>;
}

/** Tools → Speech Control…: read the script aloud, one voice per character. */
export function SpeechDialog({ elements, activeIndex, sceneRange, voices, onLine, onAssign, onClose }: {
  elements: ScreenplayElement[]; activeIndex: number; sceneRange: [number, number]; voices: Record<string, VoiceAssignment>;
  onLine(line: SpeechLine | null): void; onAssign(): void; onClose(): void;
}) {
  const [rate, setRate] = useState(1);
  const [readCues, setReadCues] = useState(false);
  const [state, setState] = useState<"stopped" | "playing" | "paused">("stopped");
  const reader = useRef<ScriptReader | null>(null);
  useEffect(() => () => reader.current?.stop(), []);
  const supported = typeof speechSynthesis !== "undefined";
  const play = (from: number, to: number) => {
    reader.current?.stop();
    reader.current = new ScriptReader(voices, (line) => { onLine(line); if (!line) setState("stopped"); }, rate);
    reader.current.play(speechLines(elements, from, to, readCues)); setState("playing");
  };
  return <Modal title="Speech Control" eyebrow="Tools" onClose={() => { reader.current?.stop(); onClose(); }} modeless width={440}>
    {!supported && <div className="error">This system has no text-to-speech voices available.</div>}
    <div className="ol-actions wrap" style={{ justifyContent: "flex-start" }}>
      <button className="primary" disabled={!supported} onClick={() => play(activeIndex, elements.length)}><Play size={14}/> From cursor</button>
      <button className="secondary" disabled={!supported} onClick={() => play(sceneRange[0], sceneRange[1])}><Play size={14}/> This scene</button>
      <button className="secondary" disabled={!supported} onClick={() => play(0, elements.length)}><Play size={14}/> Whole script</button>
    </div>
    <div className="ol-actions" style={{ justifyContent: "flex-start" }}>
      <button className="secondary" disabled={state === "stopped"} onClick={() => { if (state === "paused") { reader.current?.resume(); setState("playing"); } else { reader.current?.pause(); setState("paused"); } }}><Pause size={14}/> {state === "paused" ? "Resume" : "Pause"}</button>
      <button className="secondary" disabled={state === "stopped"} onClick={() => reader.current?.stop()}><Square size={14}/> Stop</button>
    </div>
    <Field label={`Speed: ${rate.toFixed(1)}×`}><input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={(event) => setRate(Number(event.target.value))}/></Field>
    <Check label="Read character names aloud" checked={readCues} onChange={setReadCues}/>
    <button className="link-button" onClick={onAssign}>Assign voices to characters…</button>
  </Modal>;
}

/** Tools → Assign Voices…: pick a system voice, speed and pitch for each character and the narrator. */
export function VoicesDialog({ characters, voices, onSave, onClose }: { characters: string[]; voices: Record<string, VoiceAssignment>; onSave(value: Record<string, VoiceAssignment>): void; onClose(): void }) {
  const [value, setValue] = useState(voices);
  const [systemVoices, setSystemVoices] = useState(availableVoices());
  useEffect(() => { if (typeof speechSynthesis === "undefined") return; const update = () => setSystemVoices(availableVoices()); speechSynthesis.addEventListener("voiceschanged", update); return () => speechSynthesis.removeEventListener("voiceschanged", update); }, []);
  const test = (who: string) => { const assignment = value[who] ?? {}; const utterance = new SpeechSynthesisUtterance(who === NARRATOR ? "The rain hammers the tin roofs." : `This is ${who}.`); const voice = systemVoices.find((item) => item.name === assignment.voice); if (voice) utterance.voice = voice; utterance.rate = assignment.rate ?? 1; utterance.pitch = assignment.pitch ?? 1; speechSynthesis.cancel(); speechSynthesis.speak(utterance); };
  const set = (who: string, patch: VoiceAssignment) => setValue({ ...value, [who]: { ...value[who], ...patch } });
  return <Modal title="Assign Voices" eyebrow="Tools" onClose={onClose} width={720} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value)}>Save</button></>}>
    {!systemVoices.length && <p className="hint">No voices found. On Windows, add voices in Settings → Time & language → Speech.</p>}
    <table className="ol-table"><thead><tr><th>Speaker</th><th>Voice</th><th>Speed</th><th>Pitch</th><th/></tr></thead><tbody>
      {[NARRATOR, ...characters].map((who) => <tr key={who}><td><strong>{who}</strong></td>
        <td><select aria-label={`Voice for ${who}`} value={value[who]?.voice ?? ""} onChange={(event) => set(who, { voice: event.target.value || undefined })}><option value="">System default</option>{systemVoices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>)}</select></td>
        <td><input aria-label={`Speed for ${who}`} type="number" min="0.5" max="2" step="0.1" value={value[who]?.rate ?? 1} onChange={(event) => set(who, { rate: Number(event.target.value) })}/></td>
        <td><input aria-label={`Pitch for ${who}`} type="number" min="0" max="2" step="0.1" value={value[who]?.pitch ?? 1} onChange={(event) => set(who, { pitch: Number(event.target.value) })}/></td>
        <td><button className="secondary compact" onClick={() => test(who)}>Test</button></td></tr>)}
    </tbody></table>
  </Modal>;
}

/** Tools → Names Database…: browse names by origin and gender; insert one as a character. */
export function NamesDialog({ onInsert, onClose }: { onInsert(name: string): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("");
  const [gender, setGender] = useState<NameGender | "">("");
  const results = useMemo(() => searchNames(query, origin || undefined, gender || undefined), [query, origin, gender]);
  return <Modal title="Names Database" eyebrow="Tools" onClose={onClose} width={620}>
    <div className="ol-grid3"><Field label="Starts with"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)}/></Field>
      <Field label="Origin"><select value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="">All origins</option>{NAME_ORIGINS.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Gender"><select value={gender} onChange={(event) => setGender(event.target.value as NameGender | "")}><option value="">Any</option><option value="female">Female</option><option value="male">Male</option><option value="unisex">Unisex</option></select></Field></div>
    <p className="hint">{results.length} names. Click one to insert it as a character at the cursor.</p>
    <div className="ol-names">{results.slice(0, 400).map((entry) => <button key={`${entry.origin}-${entry.gender}-${entry.name}`} onClick={() => onInsert(entry.name)} title={`${entry.origin} · ${entry.gender}`}>{entry.name}<small>{entry.origin}</small></button>)}</div>
  </Modal>;
}

const REFORMAT_TYPES: ScreenplayElementType[] = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "shot", "general"];

/** Tools → Reformat…: change the element type of the selected paragraphs, or step through them one by one. */
export function ReformatDialog({ range, elements, onApply, onStep, onClose }: { range: [number, number]; elements: ScreenplayElement[]; onApply(type: ScreenplayElementType, range: [number, number]): void; onStep(index: number): void; onClose(): void }) {
  const [cursor, setCursor] = useState(range[0]);
  const many = range[1] > range[0];
  return <Modal title="Reformat" eyebrow="Tools" onClose={onClose} modeless width={460}>
    <p className="hint">{many ? `${range[1] - range[0] + 1} paragraphs selected. Click an element to change them all.` : "Step through paragraphs and click the element each one should be."}</p>
    {!many && <p className="ol-context"><strong>{ELEMENT_LABELS[elements[cursor]?.type ?? "action"]}:</strong> {visibleText(elements[cursor]?.text ?? "").slice(0, 120)}</p>}
    <div className="ol-chips">{REFORMAT_TYPES.map((type, index) => <button key={type} onClick={() => { if (many) onApply(type, range); else { onApply(type, [cursor, cursor]); const next = Math.min(elements.length - 1, cursor + 1); setCursor(next); onStep(next); } }}>{ELEMENT_LABELS[type]} <kbd>{index + 1 === 8 ? 0 : index + 1}</kbd></button>)}</div>
    {!many && <div className="ol-actions"><button className="secondary" disabled={cursor === 0} onClick={() => { setCursor(cursor - 1); onStep(cursor - 1); }}>Previous</button><button className="secondary" disabled={cursor >= elements.length - 1} onClick={() => { setCursor(cursor + 1); onStep(cursor + 1); }}>Next</button></div>}
  </Modal>;
}

/** Tools → Format Assistant…: lists formatting problems, with Go To and Fix. */
export function FormatAssistantDialog({ elements, onGo, onFix, onClose }: { elements: ScreenplayElement[]; onGo(index: number): void; onFix(issue: FormatIssue): void; onClose(): void }) {
  const issues = useMemo(() => checkFormat(elements), [elements]);
  return <Modal title="Format Assistant" eyebrow="Tools" onClose={onClose} modeless width={560}>
    {!issues.length && <p className="ol-message">✓ No formatting problems found.</p>}
    <ul className="ol-issues">{issues.map((issue, i) => <li key={`${issue.index}-${i}`}><span>{issue.message}</span><span className="ol-issue-actions"><button className="secondary compact" onClick={() => onGo(issue.index)}>Go to</button>{issue.fix && <button className="primary compact" onClick={() => onFix(issue)}>Fix</button>}</span></li>)}</ul>
  </Modal>;
}

/** Tools → ScriptCompare…: compare with another draft; optionally mark differences as revised. */
export function ScriptCompareDialog({ elements, onGo, onMarkRevised, onClose }: { elements: ScreenplayElement[]; onGo(index: number): void; onMarkRevised(indices: number[]): void; onClose(): void }) {
  const [diff, setDiff] = useState<DiffEntry[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const load = async (file?: File) => { if (!file) return; setError(""); try { const preview = await importScreenplayBytes(file.name, new Uint8Array(await file.arrayBuffer())); setName(file.name); setDiff(compareScripts(elements, preview.document.elements)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const marks = diff?.filter((entry) => entry.currentIndex !== undefined).map((entry) => entry.currentIndex!) ?? [];
  return <Modal title="ScriptCompare" eyebrow="Tools" onClose={onClose} width={720} footer={diff ? <><button className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={!marks.length} onClick={() => onMarkRevised(marks)}>Mark {marks.length} changes as revised</button></> : undefined}>
    <input ref={input} type="file" hidden accept={IMPORT_ACCEPT} onChange={(event) => void load(event.target.files?.[0])}/>
    <div className="ol-row"><button className="secondary" onClick={() => input.current?.click()}>Choose the draft to compare with…</button>{name && <span className="hint">Comparing with {name}</span>}</div>
    {error && <div className="error">{error}</div>}
    {diff && <>
      <p className="hint">{diff.filter((d) => d.kind === "added").length} added · {diff.filter((d) => d.kind === "removed").length} removed · {diff.filter((d) => d.kind === "changed").length} changed (this script compared with {name}).</p>
      <ul className="ol-diff">{diff.map((entry, i) => <li key={i} className={entry.kind}><span className="tag">{entry.kind}</span><span className="type">{ELEMENT_LABELS[entry.type as ScreenplayElementType] ?? entry.type}</span>
        <span className="text">{entry.kind === "changed" ? <><del>{entry.other}</del> <ins>{entry.current}</ins></> : entry.kind === "added" ? <ins>{entry.current}</ins> : <del>{entry.other}</del>}</span>
        {entry.currentIndex !== undefined && <button className="secondary compact" onClick={() => onGo(entry.currentIndex!)}>Go to</button>}</li>)}</ul>
    </>}
  </Modal>;
}

const TOOLBAR_BUTTONS: [string, string][] = [["new", "New"], ["open", "Open"], ["save", "Save"], ["print", "Print"], ["spelling", "Spelling"], ["cut", "Cut"], ["copy", "Copy"], ["paste", "Paste"], ["undo", "Undo"], ["redo", "Redo"], ["format", "Bold / Italic / Underline"], ["element", "Element list"], ["zoom", "Zoom"], ["views", "View buttons"], ["navigator", "Navigator"], ["properties", "Scene Properties"], ["info", "Script information"], ["help", "Help"]];

/** Tools → Customize…: toolbar buttons, ruler and status bar; full shortcut list. */
export function CustomizeDialog({ prefs, menus, onSave, onClose }: { prefs: ToolbarPrefs; menus: Menu[]; onSave(prefs: ToolbarPrefs): void; onClose(): void }) {
  const [value, setValue] = useState(prefs);
  const [tab, setTab] = useState<"toolbar" | "keys">("toolbar");
  return <Modal title="Customize" eyebrow="Tools" onClose={onClose} width={620} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value)}>Save</button></>}>
    <div className="ol-segmented"><button className={tab === "toolbar" ? "active" : ""} onClick={() => setTab("toolbar")}>Toolbar</button><button className={tab === "keys" ? "active" : ""} onClick={() => setTab("keys")}>Keyboard shortcuts</button></div>
    {tab === "toolbar" && <>
      <div className="ol-row"><Check label="Show toolbar" checked={value.showToolbar} onChange={(showToolbar) => setValue({ ...value, showToolbar })}/><Check label="Show ruler" checked={value.showRuler} onChange={(showRuler) => setValue({ ...value, showRuler })}/><Check label="Show status bar" checked={value.showStatusBar} onChange={(showStatusBar) => setValue({ ...value, showStatusBar })}/></div>
      <fieldset className="ol-fieldset"><legend>Toolbar buttons</legend><div className="ol-grid2">{TOOLBAR_BUTTONS.map(([id, label]) => <Check key={id} label={label} checked={!value.hidden.includes(id)} onChange={(on) => setValue({ ...value, hidden: on ? value.hidden.filter((item) => item !== id) : [...value.hidden, id] })}/>)}</div></fieldset>
    </>}
    {tab === "keys" && <table className="ol-table"><tbody>{shortcutItems(menus).map((item) => <tr key={item.id}><td>{item.label.replace(/…$/u, "")}</td><td><kbd>{item.shortcut}</kbd></td></tr>)}
      {["Ctrl+1 … Ctrl+7, Ctrl+0|Change element type", "Tab / Enter|Next element", "Alt+1 … Alt+0|Run macro"].map((row) => <tr key={row}><td>{row.split("|")[1]}</td><td><kbd>{row.split("|")[0]}</kbd></td></tr>)}</tbody></table>}
  </Modal>;
}

/** Tools → Options…: autosave, spelling, capitalisation, co-writing service and defaults. */
export function OptionsDialog({ settings, sentences, webMode, onSave, onClose }: { settings: AppSettings; sentences: boolean; webMode: boolean; onSave(settings: AppSettings, sentences: boolean): void; onClose(): void }) {
  const [value, setValue] = useState<AppSettings>(settings);
  const [capitalise, setCapitalise] = useState(sentences);
  const [tab, setTab] = useState<"general" | "writing" | "cowriting" | "drive">("general");
  const set = (patch: Partial<AppSettings>) => setValue({ ...value, ...patch });
  return <Modal title="Options" eyebrow="Tools" onClose={onClose} width={640} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value, capitalise)}>Save</button></>}>
    <div className="ol-segmented">{([["general", "General"], ["writing", "Writing"], ["cowriting", "Co-writing"], ...(webMode ? [["drive", "Google Drive"]] : [])] as [typeof tab, string][]).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "general" && <>
      <Field label="Default author"><input value={value.defaultAuthor} onChange={(event) => set({ defaultAuthor: event.target.value })}/></Field>
      <div className="ol-grid2"><Field label="Autosave after (seconds idle)"><input type="number" min="2" max="120" value={value.autosaveSeconds} onChange={(event) => set({ autosaveSeconds: Math.max(2, Number(event.target.value) || 5) })}/></Field>
        <Field label="Theme"><select value={value.theme} onChange={(event) => set({ theme: event.target.value as AppSettings["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></Field>
        <Field label="Default zoom"><select value={value.zoom ?? 100} onChange={(event) => set({ zoom: Number(event.target.value) })}>{[75, 90, 100, 110, 125, 150].map((n) => <option key={n} value={n}>{n}%</option>)}</select></Field></div>
    </>}
    {tab === "writing" && <>
      <Check label="Check spelling as you type (red underlines)" checked={value.spellCheckAsYouType !== false} onChange={(spellCheckAsYouType) => set({ spellCheckAsYouType })}/>
      <Check label="Capitalise the first letter of each sentence" checked={capitalise} onChange={setCapitalise}/>
    </>}
    {tab === "cowriting" && <>
      <p className="hint">Live co-writing uses a Supabase project you own. In supabase.com: create a project (the free plan is enough), then copy the Project URL and the publishable (anon) key from Project Settings → API. Scripts are relayed live between writers and not stored on the server.</p>
      <Field label="Your name (shown to co-writers)"><input value={value.collaboratorName ?? ""} onChange={(event) => set({ collaboratorName: event.target.value })}/></Field>
      <Field label="Supabase project URL"><input placeholder="https://xxxx.supabase.co" value={value.supabaseUrl ?? ""} onChange={(event) => set({ supabaseUrl: event.target.value.trim() })}/></Field>
      <Field label="Supabase publishable (anon) key"><input value={value.supabaseKey ?? ""} onChange={(event) => set({ supabaseKey: event.target.value.trim() })}/></Field>
    </>}
    {tab === "drive" && <>
      <Field label="Google OAuth client ID"><input value={value.googleClientId} onChange={(event) => set({ googleClientId: event.target.value })}/></Field>
      <Check label="Enable Google Drive sync" checked={value.driveSyncEnabled} onChange={(driveSyncEnabled) => set({ driveSyncEnabled })}/>
    </>}
  </Modal>;
}
