import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal, Check, Field } from "./Modal";
import type { Beat, Bookmark, HeaderFooter, Macro, MoresContinuedsText, ProjectData, ScreenplaySettings, SmartTypeLists } from "../../types";
import { ELEMENT_LABELS, type ScreenplayElement, type ScreenplayElementType } from "../../lib/screenplay-elements";
import { visibleText } from "../../lib/rich-text";

/** Document → Page Layout…: paper, margins, header/footer position and the leading "cheat". */
export function PageLayoutDialog({ projectData, onSave, onClose }: { projectData: ProjectData; onSave(pageSize: "A4" | "US Letter", layout: NonNullable<ProjectData["pageLayout"]>): void; onClose(): void }) {
  const [pageSize, setPageSize] = useState(projectData.screenplaySettings.pagination.pageSize);
  const [layout, setLayout] = useState({ top: 1, bottom: 1, headerFromTop: 0.5, footerFromBottom: 0.5, linesAdjust: 0, ...projectData.pageLayout });
  const set = (key: keyof typeof layout, value: number) => setLayout({ ...layout, [key]: value });
  return <Modal title="Page Layout" eyebrow="Document" onClose={onClose} width={520} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(pageSize, layout)}>Apply</button></>}>
    <Field label="Paper size"><select value={pageSize} onChange={(event) => setPageSize(event.target.value as "A4" | "US Letter")}><option>US Letter</option><option>A4</option></select></Field>
    <div className="ol-grid2">
      <Field label="Top margin (in)"><input type="number" step="0.05" min="0.5" max="2" value={layout.top} onChange={(event) => set("top", Number(event.target.value))}/></Field>
      <Field label="Bottom margin (in)"><input type="number" step="0.05" min="0.5" max="2" value={layout.bottom} onChange={(event) => set("bottom", Number(event.target.value))}/></Field>
      <Field label="Header from top (in)"><input type="number" step="0.05" min="0.2" max="1" value={layout.headerFromTop} onChange={(event) => set("headerFromTop", Number(event.target.value))}/></Field>
      <Field label="Footer from bottom (in)"><input type="number" step="0.05" min="0.2" max="1" value={layout.footerFromBottom} onChange={(event) => set("footerFromBottom", Number(event.target.value))}/></Field>
    </div>
    <Field label="Leading (lines per page)" hint="Tighter fits a little more on each page; Looser fits less. Studios notice big changes.">
      <select value={layout.linesAdjust} onChange={(event) => set("linesAdjust", Number(event.target.value))}><option value={-2}>Loosest (−2 lines)</option><option value={-1}>Looser (−1 line)</option><option value={0}>Regular</option><option value={1}>Tighter (+1 line)</option><option value={2}>Tightest (+2 lines)</option></select></Field>
  </Modal>;
}

/** Document → Header and Footer…: left/centre/right text with page, title, date and revision fields. */
export function HeaderFooterDialog({ projectData, onSave, onClose }: { projectData: ProjectData; onSave(value: HeaderFooter): void; onClose(): void }) {
  const [value, setValue] = useState<HeaderFooter>(() => projectData.headerFooter ?? { header: { left: "", center: "", right: "{page}." }, footer: { left: "", center: "", right: "" }, showOnFirstPage: false });
  const part = (which: "header" | "footer") => <fieldset className="ol-fieldset"><legend>{which === "header" ? "Header" : "Footer"}</legend><div className="ol-grid3">
    {(["left", "center", "right"] as const).map((slot) => <Field key={slot} label={slot === "center" ? "Centre" : slot[0].toUpperCase() + slot.slice(1)}><input value={value[which][slot]} onChange={(event) => setValue({ ...value, [which]: { ...value[which], [slot]: event.target.value } })}/></Field>)}
  </div></fieldset>;
  return <Modal title="Header and Footer" eyebrow="Document" onClose={onClose} width={620} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value)}>Apply</button></>}>
    {part("header")}{part("footer")}
    <Check label="Show on the first page" checked={value.showOnFirstPage} onChange={(showOnFirstPage) => setValue({ ...value, showOnFirstPage })}/>
    <p className="hint">Fields you can type: <code>{"{page}"}</code> page number, <code>{"{pages}"}</code> page count, <code>{"{title}"}</code>, <code>{"{author}"}</code>, <code>{"{date}"}</code>, <code>{"{revision}"}</code> (e.g. “Blue Revision – 25/11/2026”).</p>
  </Modal>;
}

/** Document → Mores and Continueds…: (MORE)/(CONT'D) for dialogue, CONT'D for repeated speakers, and scene CONTINUEDs. */
export function MoresContinuedsDialog({ projectData, onSave, onClose }: { projectData: ProjectData; onSave(continueds: ScreenplaySettings["continueds"], texts: MoresContinuedsText): void; onClose(): void }) {
  const [continueds, setContinueds] = useState(projectData.screenplaySettings.continueds);
  const [texts, setTexts] = useState<MoresContinuedsText>({ more: "(MORE)", contd: "(CONT'D)", sceneBottom: "(CONTINUED)", sceneTop: "CONTINUED:", ...projectData.moresContinueds });
  return <Modal title="Mores and Continueds" eyebrow="Document" onClose={onClose} width={560} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(continueds, texts)}>Apply</button></>}>
    <fieldset className="ol-fieldset"><legend>Dialogue breaking across pages</legend>
      <Check label="Show (MORE) at the bottom of the page" checked={continueds.dialogueMore} onChange={(dialogueMore) => setContinueds({ ...continueds, dialogueMore })}/>
      <Check label="Show (CONT'D) on the character at the top of the next page" checked={continueds.dialogueContinued} onChange={(dialogueContinued) => setContinueds({ ...continueds, dialogueContinued })}/>
      <div className="ol-grid2"><Field label="MORE text"><input value={texts.more} onChange={(event) => setTexts({ ...texts, more: event.target.value })}/></Field><Field label="CONT'D text"><input value={texts.contd} onChange={(event) => setTexts({ ...texts, contd: event.target.value })}/></Field></div>
    </fieldset>
    <fieldset className="ol-fieldset"><legend>Same character speaking again after action</legend>
      <Field label="Character continued"><select value={continueds.character} onChange={(event) => setContinueds({ ...continueds, character: event.target.value as typeof continueds.character })}><option value="automatic">Add (CONT'D) automatically</option><option value="manual">Only where I type it</option><option value="off">Never</option></select></Field>
    </fieldset>
    <fieldset className="ol-fieldset"><legend>Scenes breaking across pages</legend>
      <Field label="Scene continueds"><select value={continueds.sceneContinued} onChange={(event) => setContinueds({ ...continueds, sceneContinued: event.target.value as typeof continueds.sceneContinued })}><option value="off">Off</option><option value="bottom">Bottom of page only</option><option value="top-and-bottom">Top and bottom</option></select></Field>
      <div className="ol-grid2"><Field label="Bottom text"><input value={texts.sceneBottom} onChange={(event) => setTexts({ ...texts, sceneBottom: event.target.value })}/></Field><Field label="Top text"><input value={texts.sceneTop} onChange={(event) => setTexts({ ...texts, sceneTop: event.target.value })}/></Field></div>
    </fieldset>
  </Modal>;
}

const SMART_LISTS: [keyof SmartTypeLists, string][] = [["characters", "Characters"], ["extensions", "Character extensions"], ["sceneIntros", "Scene intros"], ["locations", "Locations"], ["times", "Times of day"], ["transitions", "Transitions"]];

/** Document → SmartType… (Ctrl+Shift+L): the autocomplete lists, editable, with "rebuild from script". */
export function SmartTypeDialog({ lists, collected, onSave, onClose }: { lists: SmartTypeLists; collected: SmartTypeLists; onSave(lists: SmartTypeLists): void; onClose(): void }) {
  const [value, setValue] = useState(lists);
  const [tab, setTab] = useState<keyof SmartTypeLists>("characters");
  return <Modal title="SmartType" eyebrow="Document" onClose={onClose} width={620} footer={<>
    <button className="secondary" onClick={() => setValue({ ...value, [tab]: [...new Set([...value[tab], ...collected[tab]])].sort() })}>Add all from script</button>
    <span className="spacer"/><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value)}>Save</button></>}>
    <div className="ol-split">
      <nav className="ol-list">{SMART_LISTS.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label} <small>{value[key].length}</small></button>)}</nav>
      <Field label="One per line — these appear as you type" hint="Names you type in the script are suggested automatically too."><textarea rows={14} value={value[tab].join("\n")} onChange={(event) => setValue({ ...value, [tab]: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}/></Field>
    </div>
  </Modal>;
}

const MACRO_KEYS = ["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9", "Alt+0"];
const MACRO_TYPES: ScreenplayElementType[] = ["action", "character", "dialogue", "parenthetical", "scene-heading", "transition", "shot", "general"];

/** Document → Macros…: Alt+number inserts saved text (optionally switching element type). */
export function MacrosDialog({ macros, onSave, onClose }: { macros: Macro[]; onSave(macros: Macro[]): void; onClose(): void }) {
  const [value, setValue] = useState<Macro[]>(() => MACRO_KEYS.map((key) => macros.find((macro) => macro.key === key) ?? { id: key, key, text: "" }));
  const update = (index: number, patch: Partial<Macro>) => setValue(value.map((macro, i) => i === index ? { ...macro, ...patch } : macro));
  return <Modal title="Macros" eyebrow="Document" onClose={onClose} width={640} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value.filter((macro) => macro.text.trim()))}>Save</button></>}>
    <table className="ol-table"><thead><tr><th>Keys</th><th>Text to insert</th><th>Change element to</th></tr></thead>
      <tbody>{value.map((macro, index) => <tr key={macro.key}><td><kbd>{macro.key}</kbd></td><td><input aria-label={`Macro ${macro.key} text`} value={macro.text} placeholder="e.g. CONTINUOUS" onChange={(event) => update(index, { text: event.target.value })}/></td>
        <td><select aria-label={`Macro ${macro.key} element`} value={macro.elementType ?? ""} onChange={(event) => update(index, { elementType: event.target.value || undefined })}><option value="">Keep current</option>{MACRO_TYPES.map((type) => <option key={type} value={type}>{ELEMENT_LABELS[type]}</option>)}</select></td></tr>)}</tbody></table>
  </Modal>;
}

/** Document → Bookmarks…: jump to, rename or remove bookmarks. */
export function BookmarksDialog({ bookmarks, elements, onGo, onSave, onClose }: { bookmarks: Bookmark[]; elements: ScreenplayElement[]; onGo(bookmark: Bookmark): void; onSave(bookmarks: Bookmark[]): void; onClose(): void }) {
  const [value, setValue] = useState(bookmarks);
  return <Modal title="Bookmarks" eyebrow="Document" onClose={onClose} width={560} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(value)}>Save</button></>}>
    {!value.length && <p className="hint">No bookmarks yet. Put the cursor somewhere and choose Document → Insert Bookmark (Ctrl+M).</p>}
    <table className="ol-table"><tbody>{value.map((bookmark, index) => { const element = elements.find((item) => item.id === bookmark.elementId); return <tr key={bookmark.id}>
      <td><input aria-label="Bookmark name" value={bookmark.name} onChange={(event) => setValue(value.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}/></td>
      <td className="muted">{element ? visibleText(element.text).slice(0, 40) : "(text was deleted)"}</td>
      <td><button className="secondary compact" disabled={!element} onClick={() => { onSave(value); onGo(bookmark); }}>Go</button></td>
      <td><button className="icon-button" aria-label={`Delete ${bookmark.name}`} onClick={() => setValue(value.filter((_, i) => i !== index))}><Trash2 size={15}/></button></td></tr>; })}</tbody></table>
  </Modal>;
}

/** Document → ScriptNotes…: every note in the script, with go-to and delete. */
export function ScriptNotesDialog({ elements, onGo, onDelete, onClose }: { elements: ScreenplayElement[]; onGo(index: number): void; onDelete(index: number): void; onClose(): void }) {
  const notes = elements.map((element, index) => ({ element, index })).filter(({ element }) => element.type === "note");
  return <Modal title="ScriptNotes" eyebrow="Document" onClose={onClose} width={560}>
    {!notes.length && <p className="hint">No notes yet. Choose Document → Insert ScriptNote (Ctrl+J) to add one after the current paragraph.</p>}
    <ul className="ol-notes">{notes.map(({ element, index }) => <li key={element.id}><p>{visibleText(element.text) || <em>(empty note)</em>}</p><div><button className="secondary compact" onClick={() => onGo(index)}>Go to</button><button className="icon-button" aria-label="Delete note" onClick={() => onDelete(index)}><Trash2 size={15}/></button></div></li>)}</ul>
    <p className="hint">Notes never print unless you tick “Include script notes” when exporting.</p>
  </Modal>;
}

/** Document → Send to Script (Ctrl+Shift+C): turn Beat Board beats into scenes at the cursor. */
export function SendToScriptDialog({ beats, onSend, onClose }: { beats: Beat[]; onSend(beats: Beat[]): void; onClose(): void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  return <Modal title="Send to Script" eyebrow="Document" onClose={onClose} width={480} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!chosen.length} onClick={() => onSend(beats.filter((beat) => chosen.includes(beat.id)))}>Send {chosen.length || ""} to script</button></>}>
    {!beats.length && <p className="hint">The Beat Board is empty. Add beats in View → Beat Board first.</p>}
    {beats.map((beat) => <Check key={beat.id} label={`${beat.title}${beat.body ? ` — ${beat.body.slice(0, 60)}` : ""}`} checked={chosen.includes(beat.id)} onChange={(on) => setChosen(on ? [...chosen, beat.id] : chosen.filter((id) => id !== beat.id))}/>)}
  </Modal>;
}
