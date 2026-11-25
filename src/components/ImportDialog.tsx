import { useRef, useState } from "react";
import { AlertTriangle, FileUp, FolderOpen, X } from "lucide-react";
import { platform } from "../platform";
import { IMPORT_ACCEPT, importScreenplayBytes, importedFountain, type ImportPreview } from "../lib/importers";
import type { ProjectPayload } from "../types";

/** Guided import: choose a file, preview what was recognised, then create a new project from it. */
export function ImportDialog({ onClose, onImported, defaultFolder, defaultAuthor }: {
  onClose(): void; onImported(project: ProjectPayload): void; defaultFolder: string; defaultAuthor: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState(defaultAuthor);
  const [folder, setFolder] = useState(defaultFolder);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const webMode = platform.kind === "web";

  const read = async (file?: File) => {
    if (!file) return;
    setError(""); setPreview(null);
    try {
      setReading(true);
      const result = await importScreenplayBytes(file.name, new Uint8Array(await file.arrayBuffer()));
      setPreview(result); setTitle(result.title); if (result.author) setAuthor(result.author);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setReading(false); }
  };

  const create = async () => {
    if (!preview) return;
    if (!folder) { setError("Choose where the new project folder should be created."); return; }
    setBusy(true); setError("");
    try {
      const created = await platform.createProject({ parentPath: folder, title: title.trim() || preview.title, projectType: "feature-film", author });
      const screenplay = importedFountain(preview);
      const modifiedAt = await platform.save(created.projectPath, screenplay, created.modifiedAt, preview.projectData);
      onImported({ ...created, screenplay, projectData: preview.projectData, modifiedAt });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  };

  // Only name revision colours the script actually uses; Final Draft lists all 19 by default.
  const usedRevisionIds = new Set(preview?.document.elements.map((element) => element.metadata?.revisionSet).filter(Boolean));
  const usedRevisions = (preview?.projectData.revisionSets ?? []).filter((set) => usedRevisionIds.has(set.id)).map((set) => set.name.replace(/\s*\(mm\/dd\/yyyy\)/u, ""));
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
    <p className="eyebrow">Import</p><h2 id="import-title">Import a screenplay</h2>
    <p className="modal-intro">Final Draft (.fdx), Word (.docx), PDF and Fountain files become a new Olukotan project. Your original file is never changed.</p>
    <input ref={input} type="file" accept={IMPORT_ACCEPT} hidden aria-label="Screenplay file" onChange={(event) => void read(event.target.files?.[0])}/>
    <button className="secondary" onClick={() => input.current?.click()}><FileUp size={17}/> {reading ? "Reading…" : preview ? `Change file (${preview.fileName})` : "Choose file…"}</button>
    {preview && <div className="import-preview">
      <dl>
        <div><dt>Format</dt><dd>{{ fdx: "Final Draft", fountain: "Fountain", docx: "Word", pdf: "PDF" }[preview.format]}</dd></div>
        <div><dt>Scenes</dt><dd>{preview.stats.scenes}</dd></div>
        <div><dt>Characters</dt><dd>{preview.stats.characters}</dd></div>
        {preview.stats.dualDialogue > 0 && <div><dt>Dual dialogue</dt><dd>{preview.stats.dualDialogue}</dd></div>}
        {usedRevisions.length > 0 && <div><dt>Revisions</dt><dd>{usedRevisions.join(", ")}</dd></div>}
      </dl>
      {preview.sceneHeadings.length > 0 && <ol className="import-scenes">{preview.sceneHeadings.slice(0, 6).map((heading, index) => <li key={index}>{heading}</li>)}{preview.sceneHeadings.length > 6 && <li className="more">…and {preview.sceneHeadings.length - 6} more</li>}</ol>}
      {preview.warnings.map((warning) => <p className="import-warning" key={warning}><AlertTriangle size={14}/> {warning}</p>)}
      <label>Project title<input value={title} onChange={(event) => setTitle(event.target.value)}/></label>
      <label>Author<input value={author} onChange={(event) => setAuthor(event.target.value)}/></label>
      {!webMode && <label>Project location<div className="path-picker"><input readOnly value={folder} placeholder="Choose a local or Google Drive folder"/><button type="button" className="secondary" onClick={async () => { const path = await platform.chooseFolder("Choose where to create the imported project"); if (path) setFolder(path); }}><FolderOpen size={17}/> Choose</button></div></label>}
      {preview.format === "fdx" && <p className="hint">Final Draft settings Olukotan doesn't edit (element styles, SmartType lists, header and footer) are kept and written back when you export FDX.</p>}
    </div>}
    {error && <div className="error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!preview || busy} onClick={() => void create()}>{busy ? "Importing…" : "Create project"}</button></div>
  </section></div>;
}
