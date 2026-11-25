/** Update check against the public GitHub releases of Olukotan. No keys or sign-in involved. */
export const RELEASES_API = "https://api.github.com/repos/Yakubu-Moshood/olukotan/releases/latest";
export const RELEASES_PAGE = "https://github.com/Yakubu-Moshood/olukotan/releases/latest";

export interface UpdateInfo { version: string; downloadUrl: string; pageUrl: string; publishedAt?: string }

/** Compares dotted versions numerically ("0.1.12" > "0.1.9"). */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (value: string) => value.replace(/^v/u, "").split(/[.+-]/u).map((part) => Number.parseInt(part, 10) || 0);
  const a = parts(candidate), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return false;
}

interface Release { tag_name: string; html_url: string; published_at?: string; assets?: { name: string; browser_download_url: string }[] }

/** Returns the newer release, or null when this copy is up to date. Throws when GitHub can't be reached. */
export async function checkForUpdate(currentVersion: string, fetcher: typeof fetch = fetch): Promise<UpdateInfo | null> {
  const response = await fetcher(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  if (response.status === 404) return null; // no releases published yet
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = await response.json() as Release;
  if (!isNewer(release.tag_name, currentVersion)) return null;
  const installer = release.assets?.find((asset) => /setup\.exe$/iu.test(asset.name));
  return { version: release.tag_name.replace(/^v/u, ""), downloadUrl: installer?.browser_download_url ?? release.html_url, pageUrl: release.html_url, publishedAt: release.published_at };
}
