import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, Printer, ZoomIn, ZoomOut } from "lucide-react";
import { Modal, Field } from "./Modal";
import { STATIONERY, type Stationery } from "../../lib/stationery";
import { platform } from "../../platform";

/** File → New from Stationery… (Ctrl+Shift+N): templates with their own formatting. */
export function StationeryDialog({ onChoose, onClose }: { onChoose(template: Stationery): void; onClose(): void }) {
  const [chosen, setChosen] = useState(STATIONERY[0].id);
  return <Modal title="New from Stationery" eyebrow="File" onClose={onClose} width={640} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onChoose(STATIONERY.find((item) => item.id === chosen)!)}>Create…</button></>}>
    <div className="ol-templates" role="radiogroup">{STATIONERY.map((item) => <button key={item.id} role="radio" aria-checked={chosen === item.id} className={chosen === item.id ? "active" : ""} onClick={() => setChosen(item.id)} onDoubleClick={() => onChoose(item)}><strong>{item.name}</strong><small>{item.description}</small></button>)}</div>
  </Modal>;
}

/** File → Save As…: a copy of the project under a new title and location; the copy becomes the open project. */
export function SaveAsDialog({ title, onSave, onClose }: { title: string; onSave(title: string, folder: string): Promise<void>; onClose(): void }) {
  const [name, setName] = useState(`${title} copy`);
  const [folder, setFolder] = useState(platform.kind === "web" ? "This device" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Modal title="Save As" eyebrow="File" onClose={onClose} width={520} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !name.trim() || !folder} onClick={async () => { setBusy(true); setError(""); try { await onSave(name.trim(), folder); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); } }}>{busy ? "Saving…" : "Save"}</button></>}>
    <Field label="Title of the copy"><input autoFocus value={name} onChange={(event) => setName(event.target.value)}/></Field>
    {platform.kind !== "web" && <Field label="Save in" hint="Pick a folder inside Google Drive to keep the copy in Drive."><div className="path-picker"><input readOnly value={folder} placeholder="Choose a folder"/><button type="button" className="secondary" onClick={async () => { const path = await platform.chooseFolder("Save the copy in"); if (path) setFolder(path); }}><FolderOpen size={16}/> Choose</button></div></Field>}
    {error && <div className="error">{error}</div>}
  </Modal>;
}

/** File → Print Preview: the real PDF pages, rendered; print from here. */
export function PrintPreviewDialog({ makePdf, onPrint, onClose }: { makePdf(): Promise<Uint8Array>; onPrint(bytes: Uint8Array): void; onClose(): void }) {
  const [doc, setDoc] = useState<{ numPages: number; getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: object): { promise: Promise<void> } }> } | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { (async () => {
    try {
      const data = await makePdf(); setBytes(data);
      const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"); lib.GlobalWorkerOptions.workerSrc = worker.default;
      setDoc(await lib.getDocument({ data: data.slice() }).promise as never);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  })(); }, []);
  useEffect(() => { if (!doc || !canvas.current) return; let cancelled = false; (async () => {
    const pdfPage = await doc.getPage(page); if (cancelled || !canvas.current) return;
    const ratio = window.devicePixelRatio || 1; const viewport = pdfPage.getViewport({ scale: zoom * 1.3 * ratio });
    const c = canvas.current; c.width = viewport.width; c.height = viewport.height; c.style.width = `${viewport.width / ratio}px`; c.style.height = `${viewport.height / ratio}px`;
    await pdfPage.render({ canvasContext: c.getContext("2d")!, viewport, canvas: c }).promise;
  })(); return () => { cancelled = true; }; }, [doc, page, zoom]);
  return <Modal title="Print Preview" eyebrow="File" onClose={onClose} width={900} className="print-preview" footer={<>
    <button className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17}/></button><span>{doc ? `Page ${page} of ${doc.numPages}` : "Preparing pages…"}</span><button className="icon-button" aria-label="Next page" disabled={!doc || page >= doc.numPages} onClick={() => setPage(page + 1)}><ChevronRight size={17}/></button>
    <button className="icon-button" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.15))}><ZoomOut size={17}/></button><button className="icon-button" aria-label="Zoom in" onClick={() => setZoom(Math.min(2, zoom + 0.15))}><ZoomIn size={17}/></button>
    <span className="spacer"/><button className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={!bytes} onClick={() => bytes && onPrint(bytes)}><Printer size={15}/> Print…</button></>}>
    {error ? <div className="error">{error}</div> : <div className="preview-stage"><canvas ref={canvas} aria-label={`Page ${page}`}/></div>}
  </Modal>;
}

export function AboutDialog({ onClose, onLink }: { onClose(): void; onLink(url: string): void }) {
  return <Modal title="About Olukotan" onClose={onClose} width={440}>
    <p className="ol-about-mark">OLUKOTAN</p>
    <p>A local-first screenwriting studio by Before Light Media. The writer owns the files.</p>
    <p className="hint">Fonts: Courier Prime and Noto Sans Mono (SIL Open Font License). Spelling: en-GB Hunspell dictionary (MIT/BSD). PDF reading: pdf.js (Apache 2.0).</p>
    <button className="link-button" onClick={() => onLink("https://github.com/Yakubu-Moshood/olukotan")}>Source code on GitHub</button>
  </Modal>;
}

const GUIDE: [string, string][] = [
  ["Writing", "Press Enter to move to the next logical element and Tab to cycle element types (Action → Character → Scene Heading …). Ctrl+1 to Ctrl+7 set an element directly. Autocomplete suggests characters, locations and times of day; press Tab or Enter to accept."],
  ["Formatting", "Bold Ctrl+B, Italic Ctrl+I, Underline Ctrl+U. Format → Elements changes indents and spacing for an element type; Format → Alignment/Spacing/Space Before change only the current paragraph."],
  ["Pages", "Pages match the printed PDF exactly. Page numbers and (MORE)/(CONT'D) are added automatically (Document → Mores and Continueds)."],
  ["Production", "Production → Scene Numbers numbers scenes; Lock Pages freezes page breaks so changes create A-pages; Revision Mode marks every change with the active revision set."],
  ["Structure", "View → Index Cards and Beat Board help outline. Tools → Show Navigator lists scenes with page counts; drag to reorder."],
  ["Co-writing", "Tools → CollaboWriter → Start a Session shares a code. A partner chooses Join a Session and enters it. Set up the co-writing service in Tools → Options → Co-writing."],
  ["Your files", "Each project is a normal folder with a Fountain text file. Save it inside your Google Drive folder to keep it in Drive. File → Backup makes a ZIP copy any time."],
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  return <Modal title="Olukotan Help" onClose={onClose} width={640}>
    {GUIDE.map(([title, body]) => <section key={title} className="ol-help"><h3>{title}</h3><p>{body}</p></section>)}
  </Modal>;
}

/** File → Restore from Auto-Backup…: the timed copies in the project's versions folder, newest first. */
export function RestoreBackupDialog({ projectPath, onRestore, onOpenFolder, onClose }: { projectPath: string; onRestore(name: string, when: string): Promise<void>; onOpenFolder(): void; onClose(): void }) {
  const [items, setItems] = useState<{ name: string; modifiedAt: number }[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void (platform.listVersions?.(projectPath) ?? Promise.resolve([])).then((list) => { setItems(list); setChosen(list[0]?.name ?? ""); }).catch((reason) => setError(String(reason))); }, [projectPath]);
  const label = (at: number) => new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const pick = items?.find((item) => item.name === chosen);
  return <Modal title="Restore from Auto-Backup" eyebrow="File" onClose={onClose} width={520} footer={<><button className="secondary" onClick={onOpenFolder}><FolderOpen size={16}/> Show project folder</button><span style={{ flex: 1 }}/><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!pick} onClick={async () => { if (!pick) return; try { await onRestore(pick.name, label(pick.modifiedAt)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}>Restore</button></>}>
    <p className="hint">Olukotan keeps a copy of your script automatically while you write in the project's “versions” folder (change how often in Tools → Options). Restoring replaces the script on screen; Edit → Undo brings your current version back.</p>
    {items === null ? <p>Loading…</p> : items.length === 0 ? <p>No automatic backups yet. The first one is made after you've been writing for a while.</p> :
      <div className="ol-templates" role="radiogroup">{items.map((item) => <button key={item.name} role="radio" aria-checked={chosen === item.name} className={chosen === item.name ? "active" : ""} onClick={() => setChosen(item.name)}><strong>{label(item.modifiedAt)}</strong></button>)}</div>}
    {error && <div className="error">{error}</div>}
  </Modal>;
}
