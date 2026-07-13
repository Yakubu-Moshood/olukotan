# Importers

Importers are not included in Phase 1. The planned order is Fountain, Final Draft FDX, plain text, Markdown, DOCX, RTF, HTML, ODT, and text-based PDF.

Every importer must retain the original source, parse into a neutral element model, calculate per-element confidence, show a preview and warnings, and commit only after confirmation. Unknown or low-confidence content becomes General Text rather than being silently forced into screenplay structure. Import failure must leave the project unchanged and record a diagnostic without unnecessary script excerpts.

Fixture coverage planned for Phase 3 includes simple FDX, dual dialogue, revisions, notes, malformed XML, Fountain round trips, DOCX screenplay/prose, RTF, text PDF, empty and large documents, and Yoruba names with diacritics.
