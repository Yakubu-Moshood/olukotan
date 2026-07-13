import { Clock3, FilePlus2, FolderOpen, HardDrive, HelpCircle, Import, MoreHorizontal, Pin, RotateCcw, Settings } from "lucide-react";
import type { RecentProject } from "../types";
import { CloudSyncPanel } from "./CloudSyncPanel";

const labels: Record<string,string> = { local: "Local folder", "google-drive": "Google Drive", onedrive: "OneDrive", dropbox: "Dropbox", external: "External drive", unknown: "Unknown location" };

export function Home({ recents, onCreate, onOpen, onOpenRecent, onRemove, onPin, onReveal, onSettings, webMode, drive }: {
  recents: RecentProject[]; onCreate(): void; onOpen(): void; onOpenRecent(path: string): void;
  onRemove(id: string): void; onPin(item: RecentProject): void; onReveal(path: string): void; onSettings(): void;
  webMode: boolean; drive: { configured: boolean; connected: boolean; busy: boolean; message: string; onConnect(): void; onSync(): void };
}) {
  return <main className="home">
    <header className="home-header"><div className="wordmark">OLUKOTAN</div><button className="icon-button" aria-label="Settings" onClick={onSettings}><Settings size={20}/></button></header>
    <section className="hero"><p className="eyebrow">Local-first writing studio</p><h1>Your stories.<br/><em>Your files.</em></h1><p>Write, organise and protect your work—without surrendering control of it.</p>
      <div className="hero-actions"><button className="primary large" onClick={onCreate}><FilePlus2 size={19}/> Create new project</button><button className="secondary large" onClick={onOpen}><FolderOpen size={19}/> {webMode ? "Open or sync project" : "Open project"}</button></div>
    </section>
    <section className="quick-grid">
      <button className="quick-card" disabled><Import/><span><strong>Import a document</strong><small>Fountain and Final Draft arrive in Phase 3</small></span></button>
      <button className="quick-card" disabled><RotateCcw/><span><strong>Recover unsaved work</strong><small>Recovery is offered when a project opens</small></span></button>
      <button className="quick-card" disabled><HelpCircle/><span><strong>Help and guides</strong><small>Read the included documentation</small></span></button>
    </section>
    {webMode && <CloudSyncPanel {...drive} onSettings={onSettings}/>} 
    <section className="recent-section"><div className="section-title"><div><p className="eyebrow">Continue writing</p><h2>Recent projects</h2></div><Clock3 size={21}/></div>
      {recents.length === 0 ? <div className="empty-state"><div className="empty-icon"><HardDrive/></div><h3>No recent projects yet</h3><p>Create a project or open an existing Olukotan folder. Nothing is uploaded.</p></div> :
      <div className="recent-grid">{recents.map((item) => <article className="project-card" key={item.projectId} onDoubleClick={() => onOpenRecent(item.path)}>
        <div className="project-card-top"><span className="storage-pill"><HardDrive size={13}/>{labels[item.storageMode] ?? "Folder"}</span><div className="card-menu"><button className="icon-button" title={item.pinned ? "Unpin" : "Pin"} onClick={() => onPin(item)}><Pin size={16} fill={item.pinned ? "currentColor" : "none"}/></button><button className="icon-button" title="Remove from recents" onClick={() => onRemove(item.projectId)}><MoreHorizontal size={18}/></button></div></div>
        <button className="card-main" onClick={() => onOpenRecent(item.path)}><h3>{item.title}</h3><p>{item.projectType.replaceAll("-", " ")}</p><small>{item.pageCount} {item.pageCount === 1 ? "page" : "pages"}</small></button>
        <div className="card-footer"><span title={item.path}>{item.path}</span><button onClick={() => onReveal(item.path)}>Reveal</button></div>
      </article>)}</div>}
    </section>
    <footer className="home-footer"><span>The writer owns the files.</span><span>Offline by design · Telemetry off</span></footer>
  </main>;
}

