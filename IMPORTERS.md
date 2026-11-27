# Importers

Supported: **Final Draft (.fdx)**, **Word (.docx)**, **PDF** and **Fountain (.fountain, .spmd, .txt)**, from Home → *Import a screenplay*.

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

## Word (.docx)

Elements are recognised in this order of trust:
1. **Paragraph style names.** Final Draft, Fade In, WriterDuet and most templates name styles "Scene Heading", "Character", "Dialogue" and so on.
2. **Indentation:** paragraph indents, plus leading tabs and spaces in hand-formatted scripts.
3. **Text only:** plain paragraphs are read like Fountain, and the preview carries a warning.

Bold, italic, underline and all-caps runs are kept. Old binary `.doc` files must be re-saved as `.docx` first.

## PDF

Uses the PDF text layer and the position of each line: action, character, parenthetical, dialogue and transition are told apart by their indent from the action margin (taken from the scene headings). Wrapped lines are joined back into paragraphs. Page numbers, margin scene numbers, (MORE), CONTINUED and repeated (CONT'D) cues are removed, and speeches split across pages are rejoined. A title page is detected and gives the title and author.

Limitations: scanned PDFs (images with no text layer) need OCR and are refused with an explanation. Emphasis isn't read from PDFs.

Tests: `src/lib/document-import.test.ts` covers style-based, indented and plain DOCX fixtures, a DOCX round trip, and a multi-page PDF round trip through Olukotan's own renderer.
