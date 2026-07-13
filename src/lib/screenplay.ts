export interface Scene { heading: string; line: number; number: number }

const SCENE_HEADING = /^\s*(?:\.?)(INT\.?|EXT\.?|INT\.\/EXT\.?|EXT\.\/INT\.?|I\/E\.?)\s+.+/i;

export function scenesFromFountain(text: string): Scene[] {
  return text.split(/\r?\n/).reduce<Scene[]>((scenes, raw, index) => {
    const line = raw.trim();
    if (SCENE_HEADING.test(line)) scenes.push({ heading: line.replace(/^\./, ""), line: index, number: scenes.length + 1 });
    return scenes;
  }, []);
}

export function approximatePageCount(text: string): number {
  const explicitPages = text.split(/^===\s*$/m).length;
  const estimated = Math.max(1, Math.ceil(text.split(/\r?\n/).length / 55));
  return Math.max(explicitPages, estimated);
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function projectFolderName(title: string): string {
  const safe = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/[. ]+$/g, "");
  return safe || "Untitled Project";
}

