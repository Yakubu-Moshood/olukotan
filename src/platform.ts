import type { AppSettings, CreateProjectInput, ExportFormat, ProjectData, ProjectPayload, RecentProject } from "./types";
import { webStore } from "./web-store";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface OlukotanPlatform {
  kind: "desktop" | "web";
  chooseFolder(title: string): Promise<string | null>;
  createProject(input: CreateProjectInput): Promise<ProjectPayload>;
  openProject(path: string): Promise<ProjectPayload>;
  save(path: string, content: string, expectedModifiedAt: number, projectData: ProjectData): Promise<number>;
  recover(path: string, content: string): Promise<void>;
  discardRecovery(path: string): Promise<void>;
  recents(): Promise<RecentProject[]>;
  removeRecent(id: string): Promise<void>;
  pinRecent(id: string, pinned: boolean): Promise<void>;
  settings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  reveal(path: string): Promise<void>;
  importProject(payload: ProjectPayload): Promise<void>;
  recordExport(path: string, entry: { format: ExportFormat; path: string; exportedAt: string }): Promise<void>;
}

const defaults: AppSettings = { defaultProjectFolder: "This device", defaultAuthor: "", theme: "system", autosaveSeconds: 5, googleClientId: "", driveSyncEnabled: false };

const webPlatform: OlukotanPlatform = {
  kind: "web",
  async chooseFolder() { return "This device"; },
  createProject: (input) => webStore.create(input), openProject: (path) => webStore.open(path),
  save: (path, content, _expectedModifiedAt, projectData) => webStore.save(path, content, projectData), recover: (path, content) => webStore.recovery(path, content),
  async discardRecovery(path) { webStore.discardRecovery(path); }, recents: () => webStore.recents(),
  removeRecent: (id) => webStore.remove(id), pinRecent: (id, pinned) => webStore.pin(id, pinned),
  async settings() { return { ...defaults, ...(await webStore.settings()) }; }, saveSettings: (value) => webStore.saveSettings(value),
  reveal: (path) => webStore.exportProject(path), importProject: (payload) => webStore.importProject(payload),
  recordExport: (path, entry) => webStore.recordExport(path, entry),
};

const desktopPlatform: OlukotanPlatform = {
  kind: "desktop",
  async chooseFolder(title) { const { open } = await import("@tauri-apps/plugin-dialog"); const result = await open({ directory: true, multiple: false, title }); return typeof result === "string" ? result : null; },
  async createProject(input) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("create_project", { parentPath: input.parentPath, title: input.title, projectType: input.projectType, author: input.author }); },
  async openProject(projectPath) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("open_project", { projectPath }); },
  async save(projectPath, content, expectedModifiedAt, projectData) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("save_screenplay", { projectPath, content, expectedModifiedAt, projectData }); },
  async recover(projectPath, content) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("write_recovery", { projectPath, content }); },
  async discardRecovery(projectPath) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("discard_recovery", { projectPath }); },
  async recents() { const { invoke } = await import("@tauri-apps/api/core"); return invoke("recent_projects"); },
  async removeRecent(projectId) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("remove_recent", { projectId }); },
  async pinRecent(projectId, pinned) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("pin_recent", { projectId, pinned }); },
  async settings() { const { invoke } = await import("@tauri-apps/api/core"); return { ...defaults, ...await invoke<AppSettings>("get_settings") }; },
  async saveSettings(settings) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("save_settings", { settings }); },
  async reveal(projectPath) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("reveal_in_explorer", { projectPath }); },
  async importProject() { throw new Error("Drive import is available in the web companion."); },
  async recordExport(projectPath, entry) { const { invoke } = await import("@tauri-apps/api/core"); return invoke("record_export", { projectPath, entry }); },
};

export const platform = isTauri ? desktopPlatform : webPlatform;
export const desktop = platform;

/** Saves a generated file. Desktop: native Save dialog (any folder, including Google Drive). Web: browser download. Returns where it went, or null if cancelled. */
export async function saveFileAs(fileName: string, data: Uint8Array | string, filterName: string, extensions: string[]): Promise<string | null> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: fileName, filters: [{ name: filterName, extensions }] });
    if (!path) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_export_file", { path, data: Array.from(bytes) });
    return path;
  }
  const blob = new Blob([bytes as BlobPart]);
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  return `Downloads/${fileName}`;
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("open_external", { url }); return; }
  window.open(url, "_blank", "noopener");
}

/** Closes the app window (desktop). Returns false on the web, where the caller should go home instead. */
export async function closeAppWindow(): Promise<boolean> {
  if (!isTauri) return false;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close(); return true;
}

export async function toggleFullscreen(): Promise<void> {
  if (isTauri) { const { getCurrentWindow } = await import("@tauri-apps/api/window"); const win = getCurrentWindow(); await win.setFullscreen(!(await win.isFullscreen())); return; }
  if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
}

/** Sets the window's title bar text (desktop) and the document title (web). */
export async function setWindowTitle(title: string): Promise<void> {
  document.title = title;
  if (!isTauri) return;
  try { const { getCurrentWindow } = await import("@tauri-apps/api/window"); await getCurrentWindow().setTitle(title); } catch { /* title is cosmetic */ }
}
