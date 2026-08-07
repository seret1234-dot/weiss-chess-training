# Verified Lichess Tactics Autopilot

## Project goal

Build a local, independently verified M1 and TRUE-M2 tactics candidate corpus from
the read-only Lichess source index. The corpus will not be connected to the live
application until it has passed individual engine validation and a combined
cross-course audit.

## Accepted decisions

- The original Lichess CSV is read-only. The reusable master index is the normal
  source for all later work.
- Exact-symmetry V3 families are the only accepted symmetry families for curation.
  They are diversity tools, not proof of semantic correctness or tactical soundness.
- A focused course must teach the learner move's actual primary tactical idea.
  Existing geometry, reward collection, direct mates, and different-primary
  mechanisms are excluded.
- Hanging Piece is the intentional exception: M1 teaches the learner to capture a
  loose piece already present in the displayed position.
- X-Ray is metadata-only for this release. Trapped Piece and Overload are
  unavailable. M3/M4 are out of scope for this run.

## Completed stages

- Reusable master source index and metadata sidecar.
- Atomic taxonomy, structural classification, and V3 exact-symmetry families.
- Individually validated candidate work for Queen Promotion, Knight
  Underpromotion, En Passant, Zwischencheck, Capture Zwischenzug, and Hanging
  Piece M1.
- Core focused-motif onset audit, using the existing atomic structural spool.
- Strict Discovered Check structural validator: the learner must move the unique
  blocker and reveal a distinct friendly slider as the checker. Genuine double
  checks are excluded from the Discovered Check course.

## Current stage

Commit and stabilize the core motif-onset audit infrastructure, then implement
dedicated fail-closed causal validators for the remaining core themes.

## Pending themes

1. Discovered Check
2. Deflection
3. Removal/Decoy relationship clarification
4. Decoy / Attraction
5. Interference
6. Clearance Sacrifice
7. File, Rank, Diagonal, and Square Clearance

## Safety rules

- Never use a raw Lichess tag as semantic proof.
- Replay the complete stored line legally and retain exact piece identity where a
  causal sequence requires it.
- Keep candidate source data, spools, engine outputs, checkpoints, reports, and
  local corpora ignored and untracked.
- Do not weaken a validator merely to reach a course threshold.
- A final retained record is individually engine-validated; family membership
  cannot validate a different record.

## Engine rules

- Stockfish 18, one thread, 64 MB hash, MultiPV 3, fixed depth 14, no time cutoff.
- Depth 16 is reserved for close, unstable, or ambiguous results.
- Reject unsound learner moves, weak stored defenses, incidental motifs,
  cleanup-only exercises, direct-mate-primary non-mates, and unsafe equivalent
  alternatives.

## Corpus rules

- M1 final cap: 100 exercises, normally five chunks of 20.
- TRUE M2 final cap: 160 exercises, normally eight chunks of 20.
- A focused course requires at least 20 individually approved exercises.
- Candidate selection balances exact-symmetry families, rating, pieces, targets,
  checking status, board region, material, tactical result, and defense shape.
- A source puzzle normally belongs to one focused primary course; verified
  secondary motifs are metadata only.

## Runtime and deployment restrictions

Do not push, deploy, alter Production, integrate local candidate corpora into the
runtime, modify Supabase, restore the old stash, or write to the source CSV.

## Stop conditions

Set `needsHumanReview` in the local status file and stop only for source/index
integrity failure, unresolved classifier/reference disagreement, a fundamental
engine/curriculum conflict, a required policy decision, completion of every local
M1/M2 corpus plus cross-course audit, the point where runtime integration is next,
or any action requiring push/deploy/Supabase/stash mutation.

## Recovery and resume

Read this file and `.local-verified-lichess-tactics-v1/tactics-autopilot-status.json`.
Before resuming a long stage, reconcile durable output identities with its
checkpoint, confirm the old writer is gone, and update the status file atomically.
Never append to an unreconciled output or start a second writer.
