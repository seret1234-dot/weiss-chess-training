# Weiss Chess migration-history reconciliation

## Source state

The Production `public` schema was originally provisioned partly outside the
tracked migration directory. The active baseline
`migrations/20261030000000_synthetic_production_schema_baseline.sql` is a
schema-only `pg_dump` of Production project `lahzgtcpbshmzsqoqswf` taken for
release candidate `709feadbeeb6766b42591fec074bdc40bf4089c7`.

- SHA-256: `7654a52b5e3507eba931709dbb7a546a6ca423d5e513fbb0b9d63e316b038e27`
- Scope: `public` schema DDL only: tables, constraints, indexes, functions,
  triggers, policies, privileges, and default privileges.
- Excluded: table data, customer records, Auth identities, passwords, tokens,
  credentials, Storage objects, and application content rows.
- Auth and other Supabase-managed schemas are intentionally not recreated by
  this migration. A Supabase local stack or Branch provisions them.
- The snapshot needed one verified precondition that `pg_dump --schema public`
  omits: `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`. Production
  has `pg_trgm` 1.6 in `public`; the statement restores the exact prerequisite
  for indexes using `public.gin_trgm_ops` in a fresh Supabase database.

The executable chain is intentionally only:

1. `20261030000000_synthetic_production_schema_baseline.sql`
2. `20261030201607_auto_chunk_started_progress.sql`
3. `20261031095131_focused_theme_mastery.sql`

## Historical migration mapping

Every previous migration remains byte-for-byte unchanged in
`migrations-archive/`; it is documentation/provenance, not an active migration
input. All are represented in the baseline schema. Production migration history
contained the following corresponding entries when this reconciliation was
prepared:

| Archived source | Production migration record | Mapping |
| --- | --- | --- |
| `20260711183000_weekly_adaptive_tests.sql` | `20260711183000 weekly_adaptive_tests` | exact version/name |
| `20260713_create_subscriptions.sql` | `20260713 create_subscriptions` | exact version/name |
| `20260715000000_image_to_position_quota.sql` | `20260715000000 image_to_position_quota` | exact version/name |
| `20260715190000_ai_coach_quota.sql` | `20260715190000 ai_coach_quota` | exact version/name |
| `20260729_add_curriculum_progress.sql` | none | schema existed outside registry; absorbed by baseline |
| `20260811_add_training_goals.sql` | `20260811 add_training_goals` | exact version/name; failed on the branch because its prerequisite table was untracked |
| `20260905135700_master_games_flexible_search.sql` | `20260905135700 master_games_flexible_search` | exact version/name |
| `20260905144157_harden_master_game_search_catalog_grants.sql` | `20260905144157 harden_master_game_search_catalog_grants` | exact version/name |
| `20260905144655_optimize_master_game_flexible_search.sql` | `20260905144655 optimize_master_game_flexible_search` | exact version/name |
| `20260905145031_use_indexed_master_game_player_candidates.sql` | `20260905145031 use_indexed_master_game_player_candidates` | exact version/name |
| `20260905145655_preselect_master_games_before_scoring.sql` | `20260905145655 preselect_master_games_before_scoring` | exact version/name |
| `20260905145957_slim_master_game_search_projection.sql` | `20260905145957 slim_master_game_search_projection` | exact version/name |
| `20260905150348_branch_master_game_search_by_player_orientation.sql` | `20260905150348 branch_master_game_search_by_player_orientation` | exact version/name |
| `20260905150635_reject_short_reverse_player_prefixes.sql` | `20260905150635 reject_short_reverse_player_prefixes` | exact version/name |
| `20260905150807_add_najdorf_transposition_alias.sql` | `20260905150807 add_najdorf_transposition_alias` | exact version/name |
| `20260905151142_index_opening_only_master_game_search.sql` | `20260905151142 index_opening_only_master_game_search` | exact version/name |
| `20260905151522_dispatch_opening_only_master_game_search.sql` | `20260905151522 dispatch_opening_only_master_game_search` | exact version/name |
| `20260905151904_slim_opening_only_master_game_search.sql` | `20260905151904 slim_opening_only_master_game_search` | exact version/name |
| `20260905152118_stop_after_opening_only_fast_path.sql` | `20260905152118 stop_after_opening_only_fast_path` | exact version/name |
| `20260905160640_optimize_master_game_opening_search_covering_index.sql` | `20260905160640 optimize_master_game_opening_search_covering_index` | exact version/name |
| `20260905171821_optimize_master_game_general_metadata_search.sql` | `20260905171821 optimize_master_game_general_metadata_search` | exact version/name |
| `20260905173019_infer_general_search_year_token.sql` | `20260905173019 infer_general_search_year_token` | exact version/name |
| `20260905184451_secure_user_master_games_library.sql` | `20260905184451 secure_user_master_games_library` | exact version/name |
| `20260905215331_secure_user_opening_library.sql` | `20260905215331 secure_user_opening_library` | exact version/name |
| `20260907152647_affiliate_program.sql` | `20260907205645 affiliate_program` | same logical migration, version drift |
| `20260907222728_affiliate_verified_pending_eligibility.sql` | `20260907231129 affiliate_verified_pending_eligibility` | same logical migration, version drift |
| `20260908093540_affiliate_checkout_decision_preview.sql` | `20260908102055 affiliate_checkout_decision_preview` | same logical migration, version drift |
| `20260909171217_chess_voice_quota.sql` | `20260909220938 chess_voice_quota` | same logical migration, version drift |
| `20260911124113_auto_training_chunk_allowance.sql` | `20260911143055 auto_training_chunk_allowance` | same logical migration, version drift |

## Production ledger proposal — review only

Do **not** execute this section without separate approval and a verified backup.

1. Export and retain the Production `public` schema and
   `supabase_migrations.schema_migrations` ledger, then record their checksums.
2. Re-run a no-data schema comparison between Production and the active baseline.
   It must show no DDL difference before any ledger operation.
3. In a scheduled maintenance window, use `supabase migration repair` only to
   replace the historical ledger entries above with the single applied version
   `20261030000000`. Never run the baseline SQL against Production.
4. Run `supabase db push --dry-run`; it must report only the two approved
   October migrations as pending. Stop on any other entry or schema diff.
5. Apply the October migrations only in their separately approved production
   rollout. Validate RLS, API grants, and application persistence afterward.

Rollback for a ledger-only error is to restore the captured historical versions
with `supabase migration repair --status applied`; no schema DDL should have run.
If any DDL runs unexpectedly, stop, block deployment, and restore from the
verified database backup under the established Production incident procedure.
