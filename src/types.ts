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

export type ScreenplayPreset = "spec-script" | "shooting-script" | "uk-screenplay" | "us-screenplay" | "custom";
export type SceneNumberingMode = "automatic" | "manual" | "locked";
export type SceneNumberPosition = "left" | "right" | "both";

export interface ScreenplaySettings {
  preset: ScreenplayPreset;
  sceneNumbers: {
    enabled: boolean;
    mode: SceneNumberingMode;
    position: SceneNumberPosition;
    showInEditor: boolean;
    showInExport: boolean;
    showInPrint: boolean;
  };
  pageNumbers: {
    enabled: boolean;
    position: "top-right" | "top-centre" | "bottom-right";
    startOnPage: 1 | 2 | "custom";
    customStartPage: number;
    firstVisibleNumber: number;
  };
  continueds: {
    character: "automatic" | "manual" | "off";
    dialogueMore: boolean;
    dialogueContinued: boolean;
    sceneContinued: "off" | "bottom" | "top-and-bottom";
  };
  capitalisation: {
    sceneHeadings: boolean;
    characters: boolean;
    transitions: boolean;
    shots: boolean;
  };
  revisions: {
    enabled: boolean;
    activeSetId: string | null;
    showMarks: boolean;
  };
  pagination: {
    pageSize: "A4" | "US Letter";
    viewMode: "page" | "continuous";
  };
}

export interface SceneMetadata {
  sceneId: string;
  number?: string;
  numberingMode?: SceneNumberingMode;
  locked?: boolean;
  intExt?: string;
  location?: string;
  timeOfDay?: string;
  summary?: string;
  status?: "Draft" | "Needs Rewrite" | "Locked" | "Ready" | "Omitted" | "Production" | "Shot";
  colour?: string;
  tags?: string[];
  omitted?: boolean;
}

export interface ProjectData {
  schemaVersion: 1;
  screenplaySettings: ScreenplaySettings;
  scenes: SceneMetadata[];
}

export const defaultScreenplaySettings = (): ScreenplaySettings => ({
  preset: "spec-script",
  sceneNumbers: { enabled: false, mode: "automatic", position: "both", showInEditor: true, showInExport: true, showInPrint: true },
  pageNumbers: { enabled: true, position: "top-right", startOnPage: 2, customStartPage: 1, firstVisibleNumber: 1 },
  continueds: { character: "automatic", dialogueMore: true, dialogueContinued: true, sceneContinued: "off" },
  capitalisation: { sceneHeadings: true, characters: true, transitions: true, shots: true },
  revisions: { enabled: false, activeSetId: null, showMarks: true },
  pagination: { pageSize: "A4", viewMode: "page" },
});

export const defaultProjectData = (): ProjectData => ({ schemaVersion: 1, screenplaySettings: defaultScreenplaySettings(), scenes: [] });

export function migrateProjectData(value?: Partial<ProjectData>): ProjectData {
  const defaults = defaultProjectData();
  const settings = value?.screenplaySettings;
  return {
    schemaVersion: 1,
    scenes: Array.isArray(value?.scenes) ? value.scenes : [],
    screenplaySettings: {
      ...defaults.screenplaySettings, ...settings,
      sceneNumbers: { ...defaults.screenplaySettings.sceneNumbers, ...settings?.sceneNumbers },
      pageNumbers: { ...defaults.screenplaySettings.pageNumbers, ...settings?.pageNumbers },
      continueds: { ...defaults.screenplaySettings.continueds, ...settings?.continueds },
      capitalisation: { ...defaults.screenplaySettings.capitalisation, ...settings?.capitalisation },
      revisions: { ...defaults.screenplaySettings.revisions, ...settings?.revisions },
      pagination: { ...defaults.screenplaySettings.pagination, ...settings?.pagination },
    },
  };
}

export type StorageMode = "local" | "google-drive" | "onedrive" | "dropbox" | "external" | "unknown";

export interface ProjectPayload {
  manifest: ProjectManifest;
  screenplay: string;
  projectPath: string;
  readOnly: boolean;
  modifiedAt: number;
  recovery?: { content: string; modifiedAt: number };
  projectData?: ProjectData;
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
