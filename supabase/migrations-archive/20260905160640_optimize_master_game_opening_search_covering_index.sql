-- The opening-only RPC first resolves fuzzy text against the 500-row ECO
-- catalog, then needs only these narrow columns while counting/ranking matching
-- games. Keeping them in the ECO index avoids cold heap reads across the 68 MB
-- master_games table; full display rows are still fetched by primary key only
-- after the 30-row page is selected.
create index concurrently if not exists master_games_opening_search_cover_idx
on public.master_games (eco)
include (id, white, year, result);
