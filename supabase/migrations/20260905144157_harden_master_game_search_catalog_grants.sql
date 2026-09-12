-- Supabase projects may retain broad table default privileges in the public
-- schema. These two catalogs are read-only runtime lookup data.

revoke all on table public.master_game_opening_search_catalog
  from public, anon, authenticated;

revoke all on table public.master_game_player_search_catalog
  from public, anon, authenticated;

grant select on table public.master_game_opening_search_catalog
  to anon, authenticated;

grant select on table public.master_game_player_search_catalog
  to anon, authenticated;
