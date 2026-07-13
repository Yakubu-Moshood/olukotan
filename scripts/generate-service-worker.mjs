import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = new URL("../dist/", import.meta.url);
const rootPath = root.pathname.replace(/^\/(.:\/)/, "$1");

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]));
  return nested.flat();
}

const assets = (await files(rootPath)).filter((path) => !path.endsWith(`${sep}sw.js`)).map((path) => `./${relative(rootPath, path).split(sep).join("/")}`);
const worker = `const CACHE = "olukotan-shell-v2";
const SHELL = ${JSON.stringify(assets, null, 2)};
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  }).catch(() => request.mode === "navigate" ? caches.match("./index.html") : Response.error())));
});
`;
await writeFile(join(rootPath, "sw.js"), worker, "utf8");
console.log(`Precached ${assets.length} Olukotan PWA assets.`);
