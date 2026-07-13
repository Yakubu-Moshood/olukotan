import { projectFolderName } from "./lib/screenplay";
import type { ProjectManifest, ProjectPayload } from "./types";

declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient(config: { client_id: string; scope: string; callback(response: { access_token?: string; error?: string }): void }): { requestAccessToken(options?: { prompt?: string }): void };
      revoke(token: string, done: () => void): void;
    } } };
  }
}

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
let accessToken = "";

interface DriveFile { id: string; name: string; mimeType?: string; modifiedTime?: string }

async function loadIdentity() {
  if (window.google?.accounts.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-olukotan-google]');
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); return; }
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.dataset.olukotanGoogle = "true";
    script.onload = () => resolve(); script.onerror = () => reject(new Error("Google sign-in could not be loaded. Your offline copy is still safe.")); document.head.append(script);
  });
}

async function authorise(clientId: string): Promise<string> {
  if (accessToken) return accessToken;
  if (!clientId.trim()) throw new Error("Add a Google OAuth client ID in Settings before connecting Drive.");
  await loadIdentity();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({ client_id: clientId.trim(), scope: "https://www.googleapis.com/auth/drive.file",
      callback: (response) => { if (response.access_token) { accessToken = response.access_token; resolve(accessToken); } else reject(new Error(response.error || "Google Drive access was not granted.")); } });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

async function driveFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path.startsWith("http") ? path : `${API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } });
  if (!response.ok) { if (response.status === 401) accessToken = ""; throw new Error(`Google Drive could not complete the request (${response.status}). Your local copy was not changed.`); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function list(q: string): Promise<DriveFile[]> {
  const result = await driveFetch<{ files: DriveFile[] }>(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000`); return result.files;
}

async function createMetadata(name: string, mimeType: string, parents: string[], appProperties?: Record<string,string>): Promise<DriveFile> {
  return driveFetch("/files?fields=id,name,mimeType", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType, parents, appProperties }) });
}

async function ensureRoot(create: boolean): Promise<DriveFile | undefined> {
  const found = (await list("trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='olukotanRoot' and value='true' }"))[0];
  if (found || !create) return found;
  return createMetadata("Olukotan Projects", "application/vnd.google-apps.folder", ["root"], { olukotanRoot: "true" });
}

async function uploadText(folderId: string, name: string, mimeType: string, content: string) {
  const existing = (await list(`trashed=false and '${folderId}' in parents and name='${name.replaceAll("'", "\\'")}'`))[0];
  const file = existing ?? await createMetadata(name, mimeType, [folderId]);
  await driveFetch(`${UPLOAD}/files/${file.id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": `${mimeType}; charset=utf-8` }, body: content });
}

async function downloadText(id: string): Promise<string> {
  const response = await fetch(`${API}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`A Google Drive project file could not be downloaded (${response.status}).`); return response.text();
}

export const googleDrive = {
  get connected() { return Boolean(accessToken); },
  async connect(clientId: string) { await authorise(clientId); },
  disconnect() { const token = accessToken; accessToken = ""; if (token && window.google?.accounts.oauth2) window.google.accounts.oauth2.revoke(token, () => undefined); },
  async push(clientId: string, project: ProjectPayload, screenplay: string) {
    await authorise(clientId); const root = (await ensureRoot(true))!;
    const existingFolder = (await list(`trashed=false and '${root.id}' in parents and mimeType='application/vnd.google-apps.folder' and appProperties has { key='olukotanProjectId' and value='${project.manifest.projectId}' }`))[0];
    const folder = existingFolder ?? await createMetadata(projectFolderName(project.manifest.title), "application/vnd.google-apps.folder", [root.id], { olukotanProjectId: project.manifest.projectId });
    if (existingFolder) {
      const remoteFiles = await list(`trashed=false and '${folder.id}' in parents`);
      const remoteManifestFile = remoteFiles.find((file) => file.name === "olukotan-project.json");
      if (remoteManifestFile) {
        const remoteManifest = JSON.parse(await downloadText(remoteManifestFile.id)) as ProjectManifest;
        if (Date.parse(remoteManifest.updatedAt) > Date.parse(project.manifest.updatedAt)) {
          throw new Error("Google Drive contains a newer version of this project. Sync from Drive before uploading; your local copy remains safe.");
        }
      }
    }
    const manifest: ProjectManifest = { ...project.manifest, updatedAt: new Date().toISOString(), storageMode: "google-drive" };
    await uploadText(folder.id, "olukotan-project.json", "application/json", JSON.stringify(manifest, null, 2));
    await uploadText(folder.id, "screenplay.fountain", "text/plain", screenplay);
    return { ...project, manifest, screenplay, modifiedAt: Date.parse(manifest.updatedAt), recovery: undefined } satisfies ProjectPayload;
  },
  async pull(clientId: string): Promise<ProjectPayload[]> {
    await authorise(clientId); const root = await ensureRoot(false); if (!root) return [];
    const folders = await list(`trashed=false and '${root.id}' in parents and mimeType='application/vnd.google-apps.folder'`);
    const projects: ProjectPayload[] = [];
    for (const folder of folders) {
      const files = await list(`trashed=false and '${folder.id}' in parents`);
      const manifestFile = files.find((file) => file.name === "olukotan-project.json"); const screenplayFile = files.find((file) => file.name === "screenplay.fountain");
      if (!manifestFile || !screenplayFile) continue;
      try {
        const manifest = JSON.parse(await downloadText(manifestFile.id)) as ProjectManifest; if (manifest.application !== "Olukotan" || manifest.schemaVersion !== 1) continue;
        manifest.storageMode = "google-drive"; const screenplay = await downloadText(screenplayFile.id);
        projects.push({ manifest, screenplay, projectPath: `browser://${manifest.projectId}/${projectFolderName(manifest.title)}`, readOnly: false, modifiedAt: Date.parse(manifest.updatedAt) || Date.now() });
      } catch { continue; }
    }
    return projects;
  }
};

