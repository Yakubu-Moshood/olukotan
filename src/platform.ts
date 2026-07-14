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
