import { useCallback, useEffect, useRef, useState } from "react";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { Editor } from "./components/Editor";
import { Home } from "./components/Home";
import { ImportDialog } from "./components/ImportDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { googleDrive } from "./google-drive";
import { platform } from "./platform";
import { migrateProjectData, type AppSettings, type ProjectData, type ProjectPayload, type RecentProject } from "./types";
import type { Stationery } from "./lib/stationery";
import { synchroniseSceneMetadata } from "./lib/screenplay-production";
import { parseFountain, serializeFountain } from "./lib/screenplay-elements";

const defaultSettings: AppSettings = { defaultProjectFolder: "", defaultAuthor: "", theme: "system", autosaveSeconds: 5, googleClientId: "", driveSyncEnabled: false };
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }

export default function App() {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [template, setTemplate] = useState<Stationery | null>(null);
  const [joinCode, setJoinCode] = useState<string | undefined>(undefined);
  const [editorKey, setEditorKey] = useState(0);
  const [settings, setSettings] = useState(defaultSettings);
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const contentRef = useRef(content); contentRef.current = content;
  const projectDataRef = useRef<ProjectData>(migrateProjectData());

  const refresh = useCallback(async () => { try { setRecents(await platform.recents()); } catch { setRecents([]); } }, []);
  useEffect(() => { void refresh(); void platform.settings().then((value) => setSettings({ ...defaultSettings, ...value })).catch(() => undefined); }, [refresh]);

  const enterProject = (value: ProjectPayload, join?: string) => {
    setJoinCode(join); setEditorKey((key) => key + 1);
    setDirty(false); setMessage("");
    if (value.recovery && window.confirm("Olukotan found newer unsaved work. Restore it now?")) {
      value.screenplay = value.recovery.content; setDirty(true); setMessage("Recovered unsaved work — save to keep it");
    } else if (value.recovery) { void platform.discardRecovery(value.projectPath); }
    value.projectData = migrateProjectData(value.projectData); projectDataRef.current = value.projectData;
    setProject(value); setContent(value.screenplay); setCreateOpen(false);
  };

  const syncDrive = async () => {
    if (!settings.googleClientId) { setSettingsOpen(true); return; }
    setDriveBusy(true); setDriveMessage("Connecting securely…");
    try {
      const remoteProjects = await googleDrive.pull(settings.googleClientId); setDriveConnected(true);
      let added = 0, updated = 0, conflicts = 0;
      for (const remote of remoteProjects) {
        try {
          const local = await platform.openProject(remote.projectPath);
          if (local.screenplay === remote.screenplay) { await platform.importProject(remote); continue; }
          if (remote.modifiedAt > local.modifiedAt && window.confirm(`Google Drive has a newer copy of “${remote.manifest.title}”. Replace this device's offline copy?`)) {
            await platform.importProject(remote); updated++;
          } else conflicts++;
        } catch { await platform.importProject(remote); added++; }
      }
      await refresh(); setDriveMessage(remoteProjects.length ? `${added} added, ${updated} updated${conflicts ? `, ${conflicts} kept local` : ""}.` : "Connected. No Olukotan projects are in Drive yet.");
    } catch (reason) { setDriveMessage(errorText(reason)); }
    finally { setDriveBusy(false); }
  };

  const openFolder = async () => {
    if (platform.kind === "web") {
      if (!settings.driveSyncEnabled || !settings.googleClientId) { setSettingsOpen(true); return; }
      await syncDrive(); return;
    }
    try { const path = await platform.chooseFolder("Open an Olukotan project folder"); if (path) enterProject(await platform.openProject(path)); }
    catch (reason) { window.alert(errorText(reason)); }
  };
  const openRecent = async (path: string) => { try { enterProject(await platform.openProject(path)); } catch (reason) { window.alert(errorText(reason)); } };

  const save = useCallback(async () => {
    if (!project || !dirty || project.readOnly) return;
    setSaving(true); setMessage("");
    try {
      const modifiedAt = await platform.save(project.projectPath, contentRef.current, project.modifiedAt, projectDataRef.current);
      let savedProject: ProjectPayload = { ...project, screenplay: contentRef.current, projectData: projectDataRef.current, modifiedAt, recovery: undefined,
        manifest: { ...project.manifest, updatedAt: new Date(modifiedAt).toISOString() } };
      setProject(savedProject); setDirty(false); setMessage(platform.kind === "web" ? "Saved offline on this device" : "Saved locally");
      if (platform.kind === "web" && settings.driveSyncEnabled && googleDrive.connected) {
        setMessage("Saved offline · Syncing to Drive…");
        try { savedProject = await googleDrive.push(settings.googleClientId, project, contentRef.current); await platform.importProject(savedProject); setProject(savedProject); setMessage("Saved offline and synced to Drive"); }
        catch (reason) { setMessage("Saved offline · Drive sync needs attention"); window.alert(errorText(reason)); }
      }
      void refresh();
    } catch (reason) { setMessage("Save stopped"); window.alert(errorText(reason)); }
    finally { setSaving(false); }
  }, [project, dirty, refresh, settings.driveSyncEnabled, settings.googleClientId]);

  useEffect(() => {
    if (!project || !dirty || project.readOnly) return;
    const recoveryTimer = window.setTimeout(() => { void platform.recover(project.projectPath, contentRef.current).then(() => setMessage("Recovery copy updated")); }, 1500);
    const saveTimer = window.setTimeout(() => { void save(); }, settings.autosaveSeconds * 1000);
    return () => { clearTimeout(recoveryTimer); clearTimeout(saveTimer); };
  }, [content, dirty, project, save, settings.autosaveSeconds]);

  useEffect(() => {
    // The editor's File menu also handles Ctrl+S; only act when nothing else has.
    const handler = (event: KeyboardEvent) => { if (event.defaultPrevented) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [save]);

  const pickFolder = async (title: string) => platform.kind === "web" ? "This device" : (settings.defaultProjectFolder || await platform.chooseFolder(title));
  /** Creates a project from given content (template, Save As copy, shared session) and opens it. */
  const createWith = async (title: string, folder: string, screenplay: string, data: ProjectData, join?: string) => {
    const created = await platform.createProject({ parentPath: folder, title, projectType: project?.manifest.projectType ?? "feature-film", author: settings.defaultAuthor || project?.manifest.author || "" });
    const modifiedAt = await platform.save(created.projectPath, screenplay, created.modifiedAt, data);
    await refresh();
    enterProject({ ...created, screenplay, projectData: data, modifiedAt }, join);
  };
  const applyTemplate = async (value: ProjectPayload) => {
    if (!template) return enterProject(value);
    const data = migrateProjectData(value.projectData);
    if (template.elementStyles) data.elementStyles = template.elementStyles;
    if (template.sceneHeadingSpacing) data.screenplaySettings.pagination.sceneHeadingSpacing = template.sceneHeadingSpacing;
    const prepared = synchroniseSceneMetadata(parseFountain(`Title: ${value.manifest.title}\nAuthor: ${value.manifest.author}\n\n${template.fountain}`), data);
    const screenplay = serializeFountain(prepared.document);
    const modifiedAt = await platform.save(value.projectPath, screenplay, value.modifiedAt, prepared.projectData);
    setTemplate(null);
    enterProject({ ...value, screenplay, projectData: prepared.projectData, modifiedAt });
  };

  if (project) return <Editor key={editorKey} project={project} joinCode={joinCode} settings={settings} recents={recents}
    onSettingsChange={async (value) => { await platform.saveSettings(value); setSettings(value); }}
    onNew={() => { setProject(null); setCreateOpen(true); }}
    onNewFromTemplate={(value) => { setTemplate(value); setProject(null); setCreateOpen(true); }}
    onOpen={() => { setProject(null); void openFolder(); }}
    onOpenRecent={(path) => void openRecent(path)}
    onSaveAs={async (title, folder, screenplay, data) => { await createWith(title, folder, screenplay, data); }}
    onRevert={() => { void platform.discardRecovery(project.projectPath); void platform.openProject(project.projectPath).then((value) => { value.recovery = undefined; enterProject(value); }); }}
    onExit={() => { setProject(null); void refresh(); }}
    onJoinSession={async (code) => {
      try { const folder = await pickFolder("Where should the shared script be kept?"); if (!folder) return; await createWith(`Shared script ${code}`, folder, "", migrateProjectData(), code); }
      catch (reason) { window.alert(errorText(reason)); }
    }} content={content} dirty={dirty} saving={saving} message={message}
    onChange={(value) => { setContent(value); setDirty(true); setMessage(""); }} onSave={() => void save()}
    onProjectDataChange={(value) => { projectDataRef.current = value; setProject((current) => current ? { ...current, projectData: value } : current); setDirty(true); setMessage(""); }}
    onExported={(entry) => { setProject((current) => current ? { ...current, manifest: { ...current.manifest, exportHistory: [...current.manifest.exportHistory, entry] } } : current); void platform.recordExport(project.projectPath, entry); setMessage(`Exported ${entry.format.toUpperCase()}`); }}
    onHome={() => { if (!dirty || window.confirm("Leave the editor? Your recovery copy will remain available.")) { setProject(null); void refresh(); } }}
    onReveal={() => void platform.reveal(project.projectPath)} />;

  const webMode = platform.kind === "web";
  return <><Home recents={recents} onCreate={() => setCreateOpen(true)} onImport={() => setImportOpen(true)} onOpen={() => void openFolder()} onOpenRecent={(path) => void openRecent(path)}
    onRemove={(id) => void platform.removeRecent(id).then(refresh)} onPin={(item) => void platform.pinRecent(item.projectId, !item.pinned).then(refresh)} onReveal={(path) => void platform.reveal(path)} onSettings={() => setSettingsOpen(true)} webMode={webMode}
    drive={{ configured: settings.driveSyncEnabled && Boolean(settings.googleClientId), connected: driveConnected, busy: driveBusy, message: driveMessage, onConnect: () => void syncDrive(), onSync: () => void syncDrive() }} />
    {createOpen && <CreateProjectDialog onClose={() => { setCreateOpen(false); setTemplate(null); }} onCreated={(value) => void applyTemplate(value)} defaultAuthor={settings.defaultAuthor} defaultFolder={settings.defaultProjectFolder || (webMode ? "This device" : "")} webMode={webMode}/>} 
    {importOpen && <ImportDialog onClose={() => setImportOpen(false)} defaultAuthor={settings.defaultAuthor} defaultFolder={settings.defaultProjectFolder || (webMode ? "This device" : "")} onImported={(value) => { setImportOpen(false); enterProject(value); void refresh(); }}/>}
    {settingsOpen && <SettingsDialog initial={settings} onClose={() => setSettingsOpen(false)} webMode={webMode} onSave={async (value) => { await platform.saveSettings(value); setSettings(value); setSettingsOpen(false); }}/>}</>;
}
