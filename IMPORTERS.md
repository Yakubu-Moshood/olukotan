# Importers

Supported: **Final Draft (.fdx)** and **Fountain (.fountain, .spmd, .txt)**, from Home → *Import a screenplay*.

Every import parses into the neutral element model, shows a preview (scenes, characters, dual dialogue, revision sets and warnings), and creates a new project only after confirmation. The original file is never modified. A failed import leaves nothing behind.

## FDX mapping

| Final Draft | Olukotan |
| --- | --- |
| Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, General | same element |
| Cast List, New Act, End of Act and other types | General Text, with a warning |
| `Text Style` Bold / Italic / Underline / AllCaps | Fountain `**`, `*`, `_`, upper case |
| `Number` on scene headings | manual scene numbers |
| `SceneProperties` Summary / Color / Title | scene summary, colour, tag |
| `DualDialogue` | dual dialogue group (stored as Fountain `^`) |
| `ScriptNote` | Note element |
| `Revisions` and `RevisionID` | revision sets and per-element marks |
| `StartsNewPage` | page break |
| `TitlePage` | title-page fields, mapped by alignment |

Everything else (ElementSettings, SmartType, HeaderAndFooter, PageLayout and so on) is kept as a template and written back on FDX export.

Fixtures and tests: `src/lib/__fixtures__/sample.fdx`, `src/lib/fdx.test.ts`, `src/lib/importers.test.ts`.
