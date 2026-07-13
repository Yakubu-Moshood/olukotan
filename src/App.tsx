import { useCallback, useEffect, useRef, useState } from "react";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { Editor } from "./components/Editor";
import { Home } from "./components/Home";
import { SettingsDialog } from "./components/SettingsDialog";
import { googleDrive } from "./google-drive";
import { platform } from "./platform";
import type { AppSettings, ProjectPayload, RecentProject } from "./types";

const defaultSettings: AppSettings = { defaultProjectFolder: "", defaultAuthor: "", theme: "system", autosaveSeconds: 5, googleClientId: "", driveSyncEnabled: false };
function errorText(reason: unknown) { return reason instanceof Error ? reason.message : String(reason); }

export default function App() {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [project, setProject] = useState<ProjectPayload | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const contentRef = useRef(content); contentRef.current = content;

  const refresh = useCallback(async () => { try { setRecents(await platform.recents()); } catch { setRecents([]); } }, []);
  useEffect(() => { void refresh(); void platform.settings().then((value) => setSettings({ ...defaultSettings, ...value })).catch(() => undefined); }, [refresh]);

  const enterProject = (value: ProjectPayload) => {
    setDirty(false); setMessage("");
    if (value.recovery && window.confirm("Olukotan found newer unsaved work. Restore it now?")) {
      value.screenplay = value.recovery.content; setDirty(true); setMessage("Recovered unsaved work — save to keep it");
    } else if (value.recovery) { void platform.discardRecovery(value.projectPath); }
    setProject(value); setContent(value.screenplay); setCreateOpen(false);
  };

  const syncDrive = async () => {
    if (!settings.googleClientId) { setSettingsOpen(true); return; }
    setDriveBusy(true); setDriveMessage("Connecting securely…");
    try {
      const remoteProjects = await googleDrive.pull(settings.googleClientId); setDriveConnected(true);
      let added = 0, updated = 0, conflicts = 0;
      for (const remote of remoteProjects) {
        try {
          const local = await platform.openProject(remote.projectPath);
          if (local.screenplay === remote.screenplay) { await platform.importProject(remote); continue; }
          if (remote.modifiedAt > local.modifiedAt && window.confirm(`Google Drive has a newer copy of “${remote.manifest.title}”. Replace this device's offline copy?`)) {
            await platform.importProject(remote); updated++;
          } else conflicts++;
        } catch { await platform.importProject(remote); added++; }
      }
      await refresh(); setDriveMessage(remoteProjects.length ? `${added} added, ${updated} updated${conflicts ? `, ${conflicts} kept local` : ""}.` : "Connected. No Olukotan projects are in Drive yet.");
    } catch (reason) { setDriveMessage(errorText(reason)); }
    finally { setDriveBusy(false); }
  };

  const openFolder = async () => {
    if (platform.kind === "web") {
      if (!settings.driveSyncEnabled || !settings.googleClientId) { setSettingsOpen(true); return; }
      await syncDrive(); return;
    }
    try { const path = await platform.chooseFolder("Open an Olukotan project folder"); if (path) enterProject(await platform.openProject(path)); }
    catch (reason) { window.alert(errorText(reason)); }
  };
  const openRecent = async (path: string) => { try { enterProject(await platform.openProject(path)); } catch (reason) { window.alert(errorText(reason)); } };

  const save = useCallback(async () => {
    if (!project || !dirty || project.readOnly) return;
    setSaving(true); setMessage("");
    try {
      const modifiedAt = await platform.save(project.projectPath, contentRef.current, project.modifiedAt);
      let savedProject: ProjectPayload = { ...project, screenplay: contentRef.current, modifiedAt, recovery: undefined,
        manifest: { ...project.manifest, updatedAt: new Date(modifiedAt).toISOString() } };
      setProject(savedProject); setDirty(false); setMessage(platform.kind === "web" ? "Saved offline on this device" : "Saved locally");
      if (platform.kind === "web" && settings.driveSyncEnabled && googleDrive.connected) {
        setMessage("Saved offline · Syncing to Drive…");
        try { savedProject = await googleDrive.push(settings.googleClientId, project, contentRef.current); await platform.importProject(savedProject); setProject(savedProject); setMessage("Saved offline and sy…46526 tokens truncated…714b5d03812acc24c318f549614536e"

[[package]]
name = "writeable"
version = "0.6.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1ffae5123b2d3fc086436f8834ae3ab053a283cfac8fe0a0b8eaae044768a4c4"

[[package]]
name = "wry"
version = "0.55.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "186f9871daa55fd9c016578b810d149de58367113db7fb72b462d2323ce19514"
dependencies = [
 "base64 0.22.1",
 "block2",
 "cookie",
 "crossbeam-channel",
 "dirs",
 "dom_query",
 "dpi",
 "dunce",
 "gdkx11",
 "gtk",
 "http",
 "javascriptcore-rs",
 "jni",
 "libc",
 "ndk",
 "objc2",
 "objc2-app-kit",
 "objc2-core-foundation",
 "objc2-foundation",
 "objc2-ui-kit",
 "objc2-web-kit",
 "once_cell",
 "percent-encoding",
 "raw-window-handle",
 "sha2",
 "soup3",
 "tao-macros",
 "thiserror 2.0.18",
 "url",
 "webkit2gtk",
 "webkit2gtk-sys",
 "webview2-com",
 "windows",
 "windows-core 0.61.2",
 "windows-version",
 "x11-dl",
]

[[package]]
name = "x11"
version = "2.21.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "502da5464ccd04011667b11c435cb992822c2c0dbde1770c988480d312a0db2e"
dependencies = [
 "libc",
 "pkg-config",
]

[[package]]
name = "x11-dl"
version = "2.21.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "38735924fedd5314a6e548792904ed8c6de6636285cb9fec04d5b1db85c1516f"
dependencies = [
 "libc",
 "once_cell",
 "pkg-config",
]

[[package]]
name = "yoke"
version = "0.8.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "709fe23a0424b6a435d82152b1bd3fdfb0833487d5fa90d05d42762a9891fef5"
dependencies = [
 "stable_deref_trait",
 "yoke-derive",
 "zerofrom",
]

[[package]]
name = "yoke-derive"
version = "0.8.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "de844c262c8848816172cef550288e7dc6c7b7814b4ee56b3e1553f275f1858e"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.118",
 "synstructure",
]

[[package]]
name = "zerocopy"
version = "0.8.54"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b7cbbc0a705a0fd05cc3676525980d2bf5a9bc4adac6d6475209a7887cf59d19"
dependencies = [
 "zerocopy-derive",
]

[[package]]
name = "zerocopy-derive"
version = "0.8.54"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e2e817b7b52d0c7358d3246da9d69935ebb18116b2b102b4230dac079b4862f5"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.118",
]

[[package]]
name = "zerofrom"
version = "0.1.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0ec05a11813ea801ff6d75110ad09cd0824ddba17dfe17128ea0d5f68e6c5272"
dependencies = [
 "zerofrom-derive",
]

[[package]]
name = "zerofrom-derive"
version = "0.1.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "11532158c46691caf0f2593ea8358fed6bbf68a0315e80aae9bd41fbade684a1"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.118",
 "synstructure",
]

[[package]]
name = "zerotrie"
version = "0.2.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0f9152d31db0792fa83f70fb2f83148effb5c1f5b8c7686c3459e361d9bc20bf"
dependencies = [
 "displaydoc",
 "yoke",
 "zerofrom",
]

[[package]]
name = "zerovec"
version = "0.11.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "90f911cbc359ab6af17377d242225f4d75119aec87ea711a880987b18cd7b239"
dependencies = [
 "yoke",
 "zerofrom",
 "zerovec-derive",
]

[[package]]
name = "zerovec-derive"
version = "0.11.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "625dc425cab0dca6dc3c3319506e6593dcb08a9f387ea3b284dbd52a92c40555"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.118",
]

[[package]]
name = "zmij"
version = "1.0.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "29666d0abbfad1e3dc4dcf6144730dd3a3ab225bbbdac83319345b1b44ccfc1b"
