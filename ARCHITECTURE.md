# Architecture

## Boundaries

- `src/`: React UI, strict TypeScript models, screenplay metadata utilities.
- `src-tauri/src/storage.rs`: validated project-folder operations, portable-file reads, recoverable writes, conflict checks.
- `src-tauri/src/database.rs`: disposable SQLite index for recents and application settings.
- `src-tauri/src/lib.rs`: small Tauri command surface. The UI never receives unrestricted filesystem access.

The Rust layer owns operating-system access. React owns presentation and transient editing state. Future importers should produce a neutral screenplay document model before writing Fountain; they should not couple parsing to UI components.

## Save transaction

1. React writes changed text to `recovery/unsaved.fountain` after 1.5 seconds.
2. After five seconds idle, or on Ctrl+S, Rust compares the on-disk modification time with the value observed at open/save.
3. If it differs, saving stops and neither copy is overwritten.
4. Otherwise Rust flushes a temporary file, rotates the previous file through a backup, installs the new file, and updates the manifest timestamp.
5. The recovery file is removed only after the canonical screenplay succeeds.

## Extensibility decisions

- `schemaVersion` gates future manifest migrations.
- `primaryDocument` permits later multiple-document support without moving the screenplay into SQLite.
- Storage-provider detection is advisory.
- AI is absent and will remain an optional provider service after the core is stable.
- macOS support should require platform packaging and reveal-folder adaptations, not a rewrite of the project model.
