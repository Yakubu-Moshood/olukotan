# Exporters

Phase 1 saves the canonical screenplay directly as Fountain. Formal export commands begin in Phase 2 with PDF and in Phase 3 with structured FDX.

Exporters must read from a neutral screenplay model, never mutate the open project, write to a temporary file before commit, preserve Unicode, and record honest loss warnings. FDX round trips must retain core elements; Fountain round trips should avoid cosmetic or destructive rewrites.
