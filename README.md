# Olukotan

Olukotan is a local-first Windows writing studio. The governing principle is simple: **the writer owns the files**. A project is an ordinary folder; its canonical screenplay is readable UTF-8 Fountain, and no account or internet connection is required.

This repository contains the Phase 0–1 milestone: a Tauri 2 desktop shell, React/TypeScript interface, Rust file service, SQLite recent-project index, project creation/opening, a basic Fountain editor, explicit save, autosave, recovery, read-only detection, synced-folder labelling, and File Explorer integration.

## Requirements

- Windows 10 or 11
- Node.js 20 or newer
- Rust stable MSVC toolchain (`rustup default stable-msvc`)
- Microsoft C++ Build Tools and WebView2 Runtime

## Development

```powershell
npm.cmd install
npm.cmd run tauri:dev
```

The web interface alone can be checked with `npm.cmd run dev`. It cannot access real folders outside the Tauri desktop process.

## Build the Windows installer

```powershell
npm.cmd install
npm.cmd run tauri:build
```

Tauri writes NSIS/MSI bundles beneath `src-tauri\target\release\bundle`.

## Build a standalone portable executable

```powershell
npm.cmd run tauri:portable
```

The result is `src-tauri\target\release\olukotan.exe`. Unlike `tauri:dev`, it embeds the web interface and does not need a localhost development server, npm, or an open terminal when launched.

## Project storage

Choose any writable folder when creating a project. Olukotan creates a named child folder containing `olukotan-project.json`, `screenplay.fountain`, supporting Markdown/JSON files, and recovery/export/version folders. SQLite is an expendable application index, never the sole copy of creative work.

For Google Drive, install Google Drive for Desktop and choose a folder inside its locally mounted “My Drive” directory. OneDrive and Dropbox folders work the same way. Saving never depends on storage detection.

## Current import support

Document import is intentionally deferred to Phase 3. The home screen labels it accordingly; no unverified conversion is claimed. Fountain and structured FDX import/export are the first planned formats.

## Known limitations

- The Phase 1 editor is a safe plain-text Fountain editor, not the structured screenplay editor or professional pagination engine planned for Phase 2.
- Import, PDF/FDX export, title pages, dual-dialogue tooling, configurable settings, and advanced recovery browsing are not implemented yet.
- External-change detection prevents a save when the file timestamp changed, but the compare/save-both interface is future work.
- The current milestone targets Windows only.

See `ARCHITECTURE.md`, `PROJECT_FORMAT.md`, and `ROADMAP.md`.
