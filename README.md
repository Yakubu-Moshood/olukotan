# Olukotan

Olukotan is a local-first Windows writing studio. The governing principle is simple: **the writer owns the files**. A project is an ordinary folder; its canonical screenplay is readable UTF-8 Fountain, and no account or internet connection is required.

Olukotan is a professional screenwriting app with Final Draft–level features: a structured screenplay editor, industry-standard pagination, Final Draft (FDX) import and export, a scene Navigator, Index Cards, a Beat Board, and production tools (revisions, locked pages, A-scenes, omitted scenes and reports). It runs as a Tauri 2 Windows desktop app and as an installable web app on the same code.

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

## Feature overview

- **Editor:** Final Draft–style elements and Tab/Enter flow, Ctrl+1–7 element shortcuts, character and scene autocomplete, automatic CONT'D, title page editor.
- **Pagination:** Courier 12 pt geometry (US Letter 54 lines, A4 58 lines), (MORE)/(CONT'D) dialogue breaks, sentence-aware action splits, scene-heading keep-with-next, optional scene CONTINUED, dual dialogue. The editor page view, PDF and reports share one paginator, so page counts always agree.
- **PDF:** Courier Prime with a Noto Sans Mono fallback, so Yoruba underdots, tone marks and ₦ print correctly. Both fonts are SIL OFL; licences are in `public/fonts`.
- **Final Draft:** FDX import keeps text styles, scene numbers, summaries, colours, dual dialogue, script notes, revisions and the title page. FD settings Olukotan doesn't edit are kept and written back on export.
- **Structure:** Navigator with pages, eighths, summaries, colours, search and drag-to-reorder; Index Cards; Beat Board.
- **Production:** revision sets in the standard colour order with margin marks; locked pages with A-pages and combined labels; locked scene numbers with A-scenes; omit/restore scenes; scene, character and location reports with CSV export.

## Menus

Full desktop menu bar: **File** (New, New from Stationery, Open, Close, Save, Save As, Save As PDF, Export, Backup, Revert, Print Preview, Print, Email, Register Script, Recent File, Exit), **Edit** (Undo/Redo, Cut/Copy/Paste, Clear, Select All, Select Scene, Find & Replace, Go To, Find Selection), **View** (Normal/Page, Index Cards, Beat Board, toolbar/ruler/status bar, zoom, focus mode, full screen), **Format** (Elements, Font, Alignment, Spacing, Space Before, Leading, Page Break, Dual Dialogue), **Document** (Page Layout, Header and Footer, Mores and Continueds, Title Page, SmartType, Macros, Bookmarks, ScriptNotes, labels, new scenes, Send to Script), **Tools** (Spelling en-GB, Thesaurus, Speech Control, Assign Voices, Reports, Names Database, Reformat, Format Assistant, ScriptCompare, Navigator, Scene Properties, CollaboWriter, Customize, Options), **Production** (Scene Numbers, Edit Scene Number, Omit Scene, Revisions, Revision Mode, Mark/Clear Revised, Lock Pages, Unlock A Pages, Unlock All Pages, Locking Tools), **Window** (split views) and **Help**.

Live co-writing uses a Supabase project (Tools → Options → Co-writing). The thesaurus uses the free Datamuse service and needs internet; everything else works offline.

## Known limitations

- Fonts outside Latin/Latin Extended fall back to "?" in PDF.
- Revision page colours are shown in the app; printed PDFs use white paper with a revision header and marks.
- FDX import keeps Final Draft's own settings for round trips, but Olukotan's editor uses its own element formatting.
- Desktop packaging currently targets Windows.

See `ARCHITECTURE.md`, `PROJECT_FORMAT.md`, and `ROADMAP.md`.
