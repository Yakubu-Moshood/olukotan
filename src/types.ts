export type ProjectType =
  | "feature-film" | "short-film" | "television-pilot" | "television-episode"
  | "limited-series" | "stage-play" | "audio-drama" | "commercial"
  | "documentary" | "youtube-documentary" | "micro-drama-series"
  | "general-script" | "blank-writing-project";

export interface ProjectManifest {
  schemaVersion: 1;
  application: "Olukotan";
  projectId: string;
  title: string;
  projectType: ProjectType;
  author: string;
  createdAt: string;
  updatedAt: string;
  primaryDocument: "screenplay.fountain";
  storageMode: StorageMode;
  language: "en-GB";
  pageSize: "A4" | "US Letter";
  screenplayStandard: "industry-standard";
  revisionMode: false;
  currentRevisionSet: null;
  importHistory: unknown[];
  exportHistory: unknown[];
}

export type StorageMode = "local" | "google-drive" | "onedrive" | "dropbox" | "external" | "unknown";

export interface ProjectPayload {
  manifest: ProjectManifest;
  screenplay: string;
  projectPath: string;
  readOnly: boolean;
  modifiedAt: number;
  recovery?: { content: string; modifiedAt: number };
}

export interface RecentProject {
  projectId: string;
  title: string;
  projectType: ProjectType;
  path: string;
  storageMode: StorageMode;
  lastOpenedAt: string;
  modifiedAt: string;
  pinned: boolean;
  pageCount: number;
}

export interface CreateProjectInput {
  parentPath: string;
  title: string;
  projectType: ProjectType;
  author: string;
}

export interface AppSettings {
  defaultProjectFolder: string;
  defaultAuthor: string;
  theme: "system" | "light" | "dark";
  autosaveSeconds: number;
  googleClientId: string;
  driveSyncEnabled: boolean;
}

