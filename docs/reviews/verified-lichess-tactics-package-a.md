# Verified Lichess tactics — Package A methodology

Package A is reproducibility and safety infrastructure only. It reads the
read-only Lichess CSV into a local structural spool, assigns atomic candidate
and structural classifications, records full source-tag coverage, and groups
only complete chess-position symmetries.

`exactSymmetryFamilyId` is derived from complete occupancy, side to move,
castling, en-passant, absolute move squares, and a legally replayed solution
line under chess-valid symmetry transforms. `pedagogicalFamilyId` additionally
separates canonical theme, subtype, and M1-vs-M2 stage.

The rejected V2 relative-geometry output is retained only as a local diagnostic.
It must never drive curation, deduplication, sampling, validation, or Stockfish
workload reduction. Exact-symmetry families are also only duplicate/diversity
grouping; each final learner puzzle still needs individual semantic and engine
validation where applicable.
