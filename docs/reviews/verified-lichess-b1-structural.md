# Verified Lichess B1 structural infrastructure

This package provides a reproducible, read-only structural scan for the Lichess
puzzle CSV. It selects only `promotion`, `underPromotion`, and `enPassant` tags,
replays the complete stored line, reconstructs the learner position after the
first opponent move, and records a resumable local result.

The three validation outcomes are deliberately distinct:

- `STRUCTURALLY_VERIFIED`: the mechanics and, for underpromotion, a concrete
  queen-promotion failure are deterministically proved.
- `ENGINE_REQUIRED`: the record is plausible but queen inferiority or tactical
  soundness depends on best-defense evaluation.
- `REJECTED`: the tag, legal move, or structural tactical centrality fails.

Exact-symmetry family identifiers are only diversity controls. They never
certify semantic correctness, engine soundness, or learner-course eligibility.
Every eventual retained puzzle requires individual validation.

Scanner output, checkpoints, reports, logs, and generated datasets live under
ignored local paths in `audit-reports/verified-lichess-tactics-v1/`.
