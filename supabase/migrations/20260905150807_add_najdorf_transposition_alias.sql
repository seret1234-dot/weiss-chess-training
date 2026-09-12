-- Preserve the canonical display name while adding a deterministic common
-- transposition spelling to the separate search-only ECO catalog.

update public.master_game_opening_search_catalog
set search_text = search_text || ' najdrof'
where eco_code between 'B90' and 'B99'
  and search_text not like '%najdrof%';
