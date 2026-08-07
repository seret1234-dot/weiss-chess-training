# Verified Lichess tactics runtime integration

The only runtime corpus for Pattern Tactics is
`public/data/verified-lichess-tactics-v1/final-v5`. It is generated from the
approved local candidate corpora by
`node scripts/build-verified-lichess-runtime-corpus.mjs` and is intentionally
separate from the original Lichess CSV and all legacy Pattern Tactics data.

## Approved runtime inventory

| Stage | Focused courses | Exercises | Mixed contributors |
| --- | ---: | ---: | ---: |
| M1 | 25 | 2,457 | 25 |
| M2 | 12 | 1,450 | 12 |
| Total | 37 | 3,907 | 37 stage-specific contributions |

Every focused exercise has a stable `exerciseId`, `sourcePuzzleId`, displayed
FEN, strict stored solution line, canonical theme key and label, structural
verification result, individual engine approval, and provenance. Source puzzle
IDs are unique across all focused courses. Mixed M1 and M2 are built only from
the same approved focused records; no legacy, raw-tag, unavailable, or
unreviewed source pool is a runtime fallback.

## Fail-closed policy

Focused courses with fewer than 20 approved exercises, and every M3/M4 tactic
course, remain unavailable. Mixed Pattern Tactics is available only for M1 and
M2 because those are the only final approved mixed pools. This prevents a
route, scheduler decision, or source-load failure from selecting legacy data.

## Reproducibility checks

Run `node scripts/test-verified-lichess-runtime.mjs` to replay all 3,907 strict
solution lines, verify provenance and engine/structural status, verify focused
manifest/chunk totals, and verify cross-course identity uniqueness. The existing
Pattern Tactics curriculum test additionally verifies that unavailable courses
remain fail-closed and that the mixed selector uses canonical theme identity.
