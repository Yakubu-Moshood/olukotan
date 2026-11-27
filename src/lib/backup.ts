import type { ProjectData, ProjectManifest } from "../types";
import { zip } from "./exporters";

/** File → Backup: one ZIP with the screenplay, its project data and the manifest. Restorable by hand. */
export function backupArchive(manifest: ProjectManifest, screenplay: string, projectData: ProjectData): Uint8Array {
  return zip({
    "screenplay.fountain": screenplay,
    "olukotan-project.json": JSON.stringify(manifest, null, 2),
    "project-data.json": JSON.stringify(projectData, null, 2),
    "README.txt": `Olukotan backup of “${manifest.title}”, made ${new Date().toLocaleString("en-GB")}.\nThe screenplay is plain Fountain text and opens in any text editor.\n`,
  });
}

export function backupFileName(title: string, now = new Date()) {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `${title.replace(/[<>:"/\\|?*]/gu, "")} backup ${stamp}.zip`;
}
