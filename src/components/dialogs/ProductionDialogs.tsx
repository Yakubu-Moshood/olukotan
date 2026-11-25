import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal, Check, Field } from "./Modal";
import { nextRevisionSet, STANDARD_REVISION_COLOURS } from "../../lib/revisions";
import type { ProjectData, RevisionSet, ScreenplaySettings } from "../../types";

/** Production → Scene Numbers…: number, renumber, keep existing (A-scenes), position, start number. */
export function SceneNumbersDialog({ settings, onApply, onClose }: { settings: ScreenplaySettings["sceneNumbers"]; onApply(value: ScreenplaySettings["sceneNumbers"], renumber: boolean): void; onClose(): void }) {
  const [value, setValue] = useState(settings);
  const [action, setAction] = useState<"renumber" | "keep">(settings.mode === "locked" ? "keep" : "renumber");
  return <Modal title="Scene Numbers" eyebrow="Production" onClose={onClose} width={500} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onApply({ ...value, enabled: true, mode: action === "keep" ? "locked" : "automatic" }, action === "renumber")}>OK</button></>}>
    <fieldset className="ol-fieldset"><legend>Numbering</legend>
      <label className="ol-check"><input type="radio" checked={action === "renumber"} onChange={() => setAction("renumber")}/><span>Number all scenes in order</span></label>
      <label className="ol-check"><input type="radio" checked={action === "keep"} onChange={() => setAction("keep")}/><span>Keep existing numbers; new scenes get A-numbers (12A, 12B…)</span></label>
      <Field label="Start at"><input type="number" min="1" value={value.startAt} onChange={(event) => setValue({ ...value, startAt: Math.max(1, Number(event.target.value) || 1) })}/></Field>
    </fieldset>
    <Field label="Print numbers"><select value={value.position} onChange={(event) => setValue({ ...value, position: event.target.value as typeof value.position })}><option value="both">Left and right</option><option value="left">Left only</option><option value="right">Right only</option></select></Field>
    <Check label="Show numbers in the editor" checked={value.showInEditor} onChange={(showInEditor) => setValue({ ...value, showInEditor })}/>
  </Modal>;
}

/** Production → Revisions…: revision sets (name, colour, mark, date), the active set, and whether marks show. */
export function RevisionsDialog({ projectData, onSave, onClose }: { projectData: ProjectData; onSave(sets: RevisionSet[], activeSetId: string | null, showMarks: boolean): void; onClose(): void }) {
  const [sets, setSets] = useState(projectData.revisionSets);
  const [active, setActive] = useState(projectData.screenplaySettings.revisions.activeSetId);
  const [showMarks, setShowMarks] = useState(projectData.screenplaySettings.revisions.showMarks);
  const update = (id: string, patch: Partial<RevisionSet>) => setSets(sets.map((set) => set.id === id ? { ...set, ...patch } : set));
  return <Modal title="Revisions" eyebrow="Production" onClose={onClose} width={720} footer={<>
    <button className="secondary" onClick={() => { const set = nextRevisionSet(sets); setSets([...sets, set]); setActive(set.id); }}>Add Revision Set</button><span className="spacer"/>
    <button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(sets, active, showMarks)}>OK</button></>}>
    {!sets.length && <p className="hint">No revision sets yet. Add one, then turn on Production → Revision Mode: every change you make is marked with that set's character in the margin.</p>}
    <table className="ol-table"><thead><tr><th>Active</th><th>Name</th><th>Page colour</th><th>Mark</th><th>Date</th><th/></tr></thead><tbody>
      {sets.map((set) => <tr key={set.id}>
        <td><input type="radio" aria-label={`Make ${set.name} active`} checked={active === set.id} onChange={() => setActive(set.id)}/></td>
        <td><input aria-label="Revision name" value={set.name} onChange={(event) => update(set.id, { name: event.target.value })}/></td>
        <td><select aria-label="Revision colour" value={set.colour} onChange={(event) => update(set.id, { colour: event.target.value })} style={{ background: set.colour }}>{STANDARD_REVISION_COLOURS.map((item) => <option key={item.colour} value={item.colour}>{item.name}</option>)}</select></td>
        <td><input aria-label="Revision mark" maxLength={2} style={{ width: 48 }} value={set.mark} onChange={(event) => update(set.id, { mark: event.target.value || "*" })}/></td>
        <td><input aria-label="Revision date" type="date" value={set.date ?? ""} onChange={(event) => update(set.id, { date: event.target.value })}/></td>
        <td><button className="icon-button" aria-label={`Delete ${set.name}`} onClick={() => { setSets(sets.filter((item) => item.id !== set.id)); if (active === set.id) setActive(null); }}><Trash2 size={15}/></button></td></tr>)}
    </tbody></table>
    <Check label="Show revision marks in the margin" checked={showMarks} onChange={setShowMarks}/>
  </Modal>;
}
