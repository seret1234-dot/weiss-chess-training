# Weiss Chess synthetic database bootstrap

`../migrations/20261030000000_synthetic_production_schema_baseline.sql` is a
schema-only snapshot of the Production
`public` schema taken for release candidate
`709feadbeeb6766b42591fec074bdc40bf4089c7`. It deliberately contains no
application rows, Auth identities, credentials, tokens, or secrets.

The historical project was initially provisioned outside the tracked migration
directory. The original incremental files are retained byte-for-byte in
`../migrations-archive/` and are deliberately not executable. A fresh
environment runs exactly the active migration chain:

1. `20261030201607_auto_chunk_started_progress.sql`
2. `20261031095131_focused_theme_mastery.sql`

The mapping and the separate, reviewed Production ledger proposal are in
`../MIGRATION_HISTORY_RECONCILIATION.md`. Never run this baseline migration or
replay archived migrations into Production.
