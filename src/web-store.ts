import { approximatePageCount, projectFolderName } from "./lib/screenplay";
import type { AppSettings, CreateProjectInput, ProjectManifest, ProjectPayload, RecentProject } from "./types";

const DB_NAME = "olukotan-web";
const PROJECTS = "projects";
const SETTINGS = "settings";

interface StoredProject { payload: ProjectPayload; pinned: boolean; lastOpenedAt: string }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "payload.manifest.projectId" });
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage could not be opened."));
  });
}

async function request<T>(mode: IDBTransactionMode, store: string, action: (value: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const operation = action(transaction.objectStore(store));
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("Browser storage operation failed."));
    transaction.oncomplete = () => db.close();
  });
}

function recentFromStored(value: StoredProject): RecentProject {
  const { manifest, screenplay, projectPath } = value.payload;
  return { projectId: manifest.projectId, title: manifest.title, projectType: manifest.projectType, path: projectPath,
    storageMode: manifest.storageMode, lastOpenedAt: value.lastOpenedAt, modifiedAt: manifest.updatedAt,
    pinned: value.pinned, pageCount: approximatePageCount(screenplay) };
}

export const webStore = {
  async create(input: CreateProjectInput): Promise<ProjectPayload> {
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    const manifest: ProjectManifest = { schemaVersion: 1, application: "Olukotan", projectId: id, title: input.title.trim(),
      projectType: input.projectType, author: input.author.trim(), createdAt: now, updatedAt: now,
      primaryDocument: "screenplay.fountain", storageMode: "local", language: "en-GB", pageSize: "A4",
      screenplayStandard: "industry-standard", revisionMode: false, currentRevisionSet: null, importHistory: [], exportHistory: [] };
    const screenplay = `Title: ${manifest.title}\nAuthor: ${manifest.author}\nDraft date: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date())}\n\n`;
    const payload: ProjectPayload = { manifest, screenplay, projectPath: `browser://${id}/${projectFolderName(manifest.title)}`, readOnly: false, modifiedAt: Date.now() };
    await this.importProject(payload); return payload;
  },
  async importProject(payload: ProjectPayload): Promise<void> {
    const existing = await request<StoredProject | undefined>("readonly", PROJECTS, (store) => store.get(payload.manifest.projectId));
    await request<IDBValidKey>("readwrite", PROJECTS, (store) => store.put({ payload, pinned: existing?.pinned ?? false, lastOpenedAt: new Date().toISOString() }));
  },
  async open(path: string): Promise<ProjectPayload> {
    const id = path.replace(/^browser:\/\//, "").split("/")[0];
    const stored = await request<StoredProject | undefined>("readonly", PROJECTS, (store) => store.get(id));
    if (!stored) throw new Error("This offline project is not available on this device. Connect Google Drive to restore it.");
    stored.lastOpenedAt = new Date().toISOString();
    await request<IDBValidKey>("readwrite", PROJECTS, (store) => store.put(stored));
    const payload = structuredClone(stored.payload);
    const savedRecovery = localStorage.getItem(`olukotan-recovery:${path}`);
    if (savedRecovery) {
      try { const recovery = JSON.parse(savedRecovery) as { content: string; modifiedAt: number }; if (recovery.modifiedAt > payload.modifiedAt && recovery.content !== payload.screenplay) payload.recovery = recovery; } catch { localStorage.removeItem(`olukotan-recovery:${path}`); }
    }
    return payload;
  },
  async save(path: string, content: string): Promise<number> {
    const id = path.replace(/^browser:\/\//, "").split("/")[0];
    const stored = await request<StoredProject | undefined>("readonly", PROJECTS, (store) => store.get(id));
    if (!stored) throw new Error("The local project copy is missing.");
    const modifiedAt = Date.now(); stored.payload.screenplay = content; stored.payload.modifiedAt = modifiedAt;
    stored.payload.manifest.updatedAt = new Date(modifiedAt).toISOString(); stored.lastOpenedAt = stored.payload.manifest.updatedAt;
    await request<IDBValidKey>("readwrite", PROJECTS, (store) => store.put(stored)); localStorage.removeItem(`olukotan-recovery:${path}`); return modifiedAt;
  },
  async recents(): Promise<RecentProject[]> {
    const values = await request<StoredProject[]>("readonly", PROJECTS, (store) => store.getAll());
    return values.map(recentFromStored).sort((a,b) => Number(b.pinned)-Number(a.pinned) || b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  },
  async remove(id: string) { await request<undefined>("readwrite", PROJECTS, (store) => store.delete(id)); },
  async pin(id: string, pinned: boolean) {
    const stored = await request<StoredProject | undefined>("readonly", PROJECTS, (store) => store.get(id)); if (!stored) return;
    stored.pinned = pinned; await request<IDBValidKey>("readwrite", PROJECTS, (store) => store.put(stored));
  },
  async settings(): Promise<AppSettings | undefined> { return request<AppSettings | undefined>("readonly", SETTINGS, (store) => store.get("application")); },
  async saveSettings(value: AppSettings) { await request<IDBValidKey>("readwrite", SETTINGS, (store) => store.put(value, "application")); },
  async recovery(path: string, content: string) { localStorage.setItem(`olukotan-recovery:${path}`, JSON.stringify({ content, modifiedAt: Date.now() })); },
  discardRecovery(path: string) { localStorage.removeItem(`olukotan-recovery:${path}`); },
  async exportProject(path: string) {
    const project = await this.open(path); const blob = new Blob([project.screenplay], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${projectFolderName(project.manifest.title)}.fountain`; link.click(); URL.revokeObjectURL(link.href);
  }
};

