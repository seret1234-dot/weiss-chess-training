# Weiss Chess synthetic database bootstrap

`production-public-schema.sql` is a schema-only snapshot of the Production
`public` schema taken for release candidate
`709feadbeeb6766b42591fec074bdc40bf4089c7`. It deliberately contains no
application rows, Auth identities, credentials, tokens, or secrets.

The historical project was initially provisioned outside the tracked migration
directory. Therefore an empty Supabase branch cannot replay the existing
incremental migrations by themselves. For a fresh environment, load this
snapshot against Supabase-managed schemas first, then treat all tracked
migrations through `20260911124113_auto_training_chunk_allowance.sql` as
already represented by the snapshot. Apply only migrations that postdate the
snapshot:

1. `20261030201607_auto_chunk_started_progress.sql`
2. `20261031095131_focused_theme_mastery.sql`

Never load this snapshot or replay old migrations into Production. A
schema-history reconciliation is a separate, reviewed operation.
