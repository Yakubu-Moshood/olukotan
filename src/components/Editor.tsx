import { ArrowLeft, ChevronLeft, ChevronRight, Cloud, FileText, FolderOpen, PanelLeftClose, PanelRightClose, Save, Search, Settings, WifiOff } from "lucide-react";
import { useMemo, useRef } from "react";
import { approximatePageCount, scenesFromFountain, wordCount } from "../lib/screenplay";
import type { ProjectPayload } from "../types";

export function Editor({ project, content, dirty, saving, message, onChange, onSave, onHome, onReveal }: {
  project: ProjectPayload; content: string; dirty: boolean; saving: boolean; message: string;
  onChange(value: string): void; onSave(): void; onHome(): void; onReveal(): void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const scenes = useMemo(() => scenesFromFountain(content), [content]);
  const pages = approximatePageCount(content);
  const jump = (line: number) => {
    const area = editor.current; if (!area) return;
    const lines = area.value.split(/\r?\n/); const index = lines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0);
    area.focus(); area.setSelectionRange(index, index); area.scrollTop = Math.max(0, (line - 4) * 24);
  };
  return <div className="studio">
    <header className="app-bar"><div className="app-left"><button className="icon-button" onClick={onHome} aria-label="Back to home"><ArrowLeft size={19}/></button><span className="mini-wordmark">OLUKOTAN</span><span className="divider"/><div><strong>{project.manifest.title}</strong><small>{dirty ? "Unsaved changes" : message || "Saved locally"}</small></div></div>
      <div className="app-actions"><span className="offline"><WifiOff size={15}/> Offline</span><button className="secondary compact" onClick={onSave} disabled={!dirty || saving || project.readOnly}><Save size={16}/>{saving ? "Saving…" : "Save"}</button><button className="icon-button"><Settings size={19}/></button></div>
    </header>
    <aside className="left-sidebar"><div className="panel-heading"><span>Scenes</span><button className="icon-button"><PanelLeftClose size={17}/></button></div><div className="scene-search"><Search size={15}/><input placeholder="Search scenes" aria-label="Search scenes"/></div>
      <nav className="scene-list" aria-label="Scene navigator">{scenes.length ? scenes.map((scene) => <button key={`${scene.line}-${scene.heading}`} onClick={() => jump(scene.line)}><span>{scene.number}</span><strong>{scene.heading}</strong></button>) : <p>Your scene headings will appear here.<br/><br/>Try: <strong>INT. ROOM - DAY</strong></p>}</nav>
      <button className="folder-link" onClick={onReveal}><FolderOpen size={16}/> Open project folder</button>
    </aside>
    <main className="writing-area"><div className="editor-toolbar"><select aria-label="Screenplay element" defaultValue="general"><option value="general">General text</option><option>Scene heading</option><option>Action</option><option>Character</option><option>Dialogue</option><option>Parenthetical</option><option>Transition</option></select><span/><button className="icon-button"><ChevronLeft size={17}/></button><strong>Page 1 of {pages}</strong><button className="icon-button"><ChevronRight size={17}/></button></div>
      {project.readOnly && <div className="read-only">Read-only mode — this folder cannot be written to. Your original files are unchanged.</div>}
      <div className="page-wrap"><div className="paper"><textarea ref={editor} value={content} onChange={(e) => onChange(e.target.value)} readOnly={project.readOnly} spellCheck aria-label="Screenplay editor" /></div></div>
    </main>
    <aside className="right-sidebar"><div className="panel-heading"><span>Project</span><button className="icon-button"><PanelRightClose size={17}/></button></div><div className="inspector-section"><p className="eyebrow">Document</p><h3><FileText size={17}/> Screenplay</h3><dl><div><dt>Format</dt><dd>Fountain</dd></div><div><dt>Page size</dt><dd>{project.manifest.pageSize}</dd></div><div><dt>Language</dt><dd>{project.manifest.language}</dd></div><div><dt>Scenes</dt><dd>{scenes.length}</dd></div><div><dt>Words</dt><dd>{wordCount(content).toLocaleString()}</dd></div></dl></div>
      <div className="ownership-note"><Cloud size={19}/><strong>Stored on your device</strong><p>{project.projectPath}</p></div>
    </aside>
    <footer className="status-bar"><span>{message || (dirty ? "Editing" : "All changes saved")}</span><span>{wordCount(content).toLocaleString()} words · {pages} {pages === 1 ? "page" : "pages"} · UTF-8</span></footer>
  </div>;
}

