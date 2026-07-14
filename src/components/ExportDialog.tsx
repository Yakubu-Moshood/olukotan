
import { useState } from "react";
import { downloadExport, exportScreenplay, type ExportOptions } from "../lib/exporters";
import type { ProjectData, ProjectPayload, ExportFormat } from "../types";
import type { ScreenplayDocument } from "../lib/screenplay-elements";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" }, { value: "fdx", label: "Final Draft (.fdx)" },
  { value: "docx", label: "Microsoft Word (.docx)" }, { value: "rtf", label: "Rich Text Format (.rtf)" },
  { value: "fountain", label: "Fountain" }, { value: "txt", label: "Plain Text" },
  { value: "md", label: "Markdown" }, { value: "html", label: "HTML" },
];

export function ExportDialog({ project, document, projectData, onClose, onExported }: {
  project: ProjectPayload; document: ScreenplayDocument; projectData: ProjectData; onClose(): void;
  onExported(entry: { format: ExportFormat; path: string; exportedAt: string }): void;
}) {
  const defaults = projectData.screenplaySettings.exportDefaults;
  const [format, setFormat] = useState<ExportFormat>(defaults.format);
  const [fileName, setFileName] = useState(project.manifest.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "screenplay");
  const [options, setOptions] = useState<ExportOptions>({ ...defaults });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const patch = (key: keyof ExportOptions, value: boolean) => setOptions((current) => ({ ...current, [key]: value }));
  const run = async () => { setBusy(true); setError(""); try { const exported = await exportScreenplay(format, { project, document, projectData, options }); downloadExport(fileName, exported); onExported({ format, path: `Downloads/${fileName}.${exported.extension}`, exportedAt: new Date().toISOString() }); onClose(); } catch (reason) { setError(`Olukotan could not export this screenplay. ${reason instanceof Error ? reason.message : String(reason)}`); } finally { setBusy(false); } };
  return <div className="settings-backdrop" onMouseDown={onClose}><section className="export-dialog" role="dialog" aria-modal="true" aria-label="Export screenplay" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">File export</p><h2>Export Screenplay</h2></div><button className="icon-button" aria-label="Close export" onClick={onClose}>Ã—</button></header>
    <div className="export-form"><label>Format<select aria-label="Export format" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>{FORMATS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Destination<input value="Downloads" readOnly aria-label="Export destination"/></label><label>Filename<input value={fileName} onChange={(event) => setFileName(event.target.value.replace(/[<>:\"/\\|?*]/g, ""))} aria-label="Export filename"/></label>
      <fieldset><legend>Include</legend>
        <label className="check-label"><input type="checkbox" checked={options.includeTitlePage} onChange={(event) => patch("includeTitlePage", event.target.checked)}/><span>Title Page</span></label>
        <label className="check-label"><input type="checkbox" checked={options.includeSceneNumbers} onChange={(event) => patch("includeSceneNumbers", event.target.checked)}/><span>Scene Numbers</span></label>
        <label className="check-label"><input type="checkbox" checked={options.includePageNumbers} disabled={format !== "pdf"} onChange={(event) => patch("includePageNumbers", event.target.checked)}/><span>Page Numbers</span></label>
        <label className="check-label"><input type="checkbox" checked={options.includeScriptNotes} disabled={!(["fdx", "html", "fountain"].includes(format))} onChange={(event) => patch("includeScriptNotes", event.target.checked)}/><span>Script Notes</span></label>
        <label className="check-label"><input type="checkbox" checked={false} disabled/><span>Revision Marks â€” unavailable</span></label>
        <label className="check-label"><input type="checkbox" checked={options.includeOmittedScenes} onChange={(event) => patch("includeOmittedScenes", event.target.checked)}/><span>Omitted Scenes</span></label>
      </fieldset>{error && <p className="export-error" role="alert">{error}</p>}
    </div><footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !fileName.trim()} onClick={() => void run()}>{busy ? "Exportingâ€¦" : `Export ${FORMATS.find((item) => item.value === format)?.label}`}</button></footer>
  </section></div>;
}

