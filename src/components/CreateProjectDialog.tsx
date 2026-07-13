import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { desktop } from "../platform";
import type { CreateProjectInput, ProjectPayload, ProjectType } from "../types";

const templates: Array<[ProjectType, string]> = [
  ["feature-film", "Feature Film"], ["short-film", "Short Film"], ["television-pilot", "Television Pilot"],
  ["television-episode", "Television Episode"], ["limited-series", "Limited Series"], ["stage-play", "Stage Play"],
  ["audio-drama", "Audio Drama"], ["commercial", "Commercial"], ["documentary", "Documentary"],
  ["youtube-documentary", "YouTube Documentary"], ["micro-drama-series", "Micro-Drama Series"],
  ["general-script", "General Script"], ["blank-writing-project", "Blank Writing Project"],
];

export function CreateProjectDialog({ onClose, onCreated, defaultAuthor, defaultFolder, webMode }: { onClose(): void; onCreated(value: ProjectPayload): void; defaultAuthor: string; defaultFolder: string; webMode: boolean }) {
  const [form, setForm] = useState<CreateProjectInput>({ parentPath: defaultFolder, title: "", projectType: "feature-film", author: defaultAuthor });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = async () => {
    const path = await desktop.chooseFolder("Choose where Olukotan should create the project");
    if (path) setForm((value) => ({ ...value, parentPath: path }));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (!form.parentPath) { setError("Choose a project location."); return; }
    setBusy(true);
    try { onCreated(await desktop.createProject(form)); } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="presentation">
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      <p className="eyebrow">New project</p><h2 id="create-title">Give your story a home</h2>
      <p className="modal-intro">Olukotan will create an ordinary folder that stays readable with or without the app.</p>
      <form onSubmit={submit}>
        <label>Project title<input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="The Reception Center" /></label>
        <div className="form-row">
          <label>Project type<select value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value as ProjectType })}>{templates.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Author<input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Your name" /></label>
        </div>
        <label>Project location<div className="path-picker"><input readOnly value={form.parentPath} placeholder="Choose a local or synced folder"/><button type="button" className="secondary" onClick={choose}><FolderOpen size={17}/> Choose</button></div></label>
        <p className="hint">{webMode ? "The first copy stays offline on this device. Drive sync occurs only when you explicitly connect it." : "Google Drive works through Drive for Desktop: choose a folder inside “My Drive”."}</p>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</button></div>
      </form>
    </section>
  </div>;
}

