import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const all = (await files(root)).filter((path) => !path.endsWith(`${sep}sw.js`));
const worker = await readFile(join(root, "sw.js"), "utf8");
const missing = all.map((path) => `./${relative(root, path).split(sep).join("/")}`).filter((path) => !worker.includes(JSON.stringify(path)));
const manifest = JSON.parse(await readFile(join(root, "manifest.webmanifest"), "utf8"));
if (missing.length) throw new Error(`Service worker does not precache: ${missing.join(", ")}`);
if (manifest.display !== "standalone" || manifest.icons?.length < 2) throw new Error("PWA manifest is incomplete.");
console.log(`PWA verified: ${all.length} assets precached, standalone manifest valid.`);
