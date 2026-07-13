# Testing

Run frontend checks:

```powershell
npm.cmd test
npm.cmd run build
```

Run Rust tests and the desktop build once the stable MSVC Rust toolchain is installed:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
npm.cmd run tauri:build
```

Current automated tests cover Fountain scene detection, page/word baseline calculations, Windows-safe folder naming, Unicode preservation, and synced-folder detection in Rust. Manual Phase 1 checks should create a project on a local path, edit/save/reopen it, simulate an unsaved recovery file, edit Fountain externally to trigger conflict prevention, and open a read-only project.

Required later suites include importer fixtures, FDX/Fountain round trips, autosave fault injection, file conflicts, recovery, pagination, and end-to-end Windows tests.
