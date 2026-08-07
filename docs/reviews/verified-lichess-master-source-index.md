# Verified Lichess reusable source index

The legal master index and metadata sidecar are local, ignored, reproducible source-layer artifacts. They never alter the original Lichess CSV, public datasets, runtime routes, or user progress.

- `scripts/build-verified-lichess-master-index.mjs` validates each full source line and writes only the compact legal source record.
- `scripts/build-verified-lichess-master-metadata-sidecar.mjs` performs a separate metadata-only sequential CSV pass. It does not construct chess positions, replay moves, run an engine, or rewrite the master index.
- Resume is checkpointed, durable-output checked, and refuses a changed source fingerprint. Completion compares sidecar IDs and row order with the legal master index.

The sidecar supplies source-row identity, RatingDeviation, Popularity, NbPlays, and OpeningTags for downstream candidate subsets.
