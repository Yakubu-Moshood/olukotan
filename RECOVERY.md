# Recovery

Changed editor text is mirrored to `recovery/unsaved.fountain` after a short idle interval. This snapshot is full UTF-8 text, deliberately favouring recoverability over compactness. On open, Olukotan offers recovery only when that file is newer than and differs from `screenplay.fountain`.

Canonical saves are conflict-aware and recoverable: compare the expected modification time, flush a temporary file, retain the previous file as a short-lived backup, replace it, then remove the recovery snapshot. An external modification stops the save. A missing primary screenplay stops project opening and directs the writer to recovery/versions; it is never replaced with a blank file.

Phase 2 should add a dedicated recovery browser, save-both conflict copies, periodic named snapshots, and disk-full fault-injection tests.
