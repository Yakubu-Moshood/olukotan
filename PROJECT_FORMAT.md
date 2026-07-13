# Olukotan project format

An Olukotan project is a normal UTF-8 directory. A minimal reconstructable project needs:

```text
Project Name/
  olukotan-project.json
  screenplay.fountain
  recovery/
```

Phase 1 also creates `treatment.md`, `synopsis.md`, `notes.md`, `characters.json`, `locations.json`, `structure.json`, `decisions.json`, and the `research`, `attachments`, `versions`, and `exports` folders.

## Manifest

`olukotan-project.json` is UTF-8 JSON. Required Phase 1 fields are `schemaVersion` (currently `1`), `application` (`Olukotan`), UUID `projectId`, title, project type, author, timestamps, `primaryDocument` (`screenplay.fountain`), storage label, language, page size, screenplay standard, revision state, and import/export history arrays.

An unknown schema is rejected rather than guessed. Missing optional supporting files can be recreated safely; a missing primary screenplay is never silently replaced.

## Canonical screenplay

`screenplay.fountain` is the canonical creative document. It uses UTF-8 and standard Fountain syntax. A third-party text editor can recover and edit it without Olukotan. SQLite is never authoritative.

## Recovery

`recovery/unsaved.fountain` is a full, readable snapshot of unsaved editor text. When it is newer than and differs from the screenplay, Olukotan offers to restore it during open.
