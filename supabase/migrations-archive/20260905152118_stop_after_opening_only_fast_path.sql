-- PL/pgSQL RETURN QUERY appends rows but does not exit the function. Exit after
-- the opening-only fast path so the general core is not executed a second time.

create or replace function public.search_master_games_flexible(
  p_q text default '',
  p_player_1 text default '',
  p_player_2 text default '',
  p_opening text default '',
  p_event text default '',
  p_result text default '',
  p_player_1_color text default 'all',
  p_year_from integer default null,
  p_year_to integer default null,
  p_sort text default 'newest',
  p_page_num integer default 1,
  p_page_size integer default 30
)
returns table(
  id bigint,
  slug text,
  title text,
  white text,
  black text,
  result text,
  event text,
  site text,
  year integer,
  opening text,
  eco text,
  description text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if nullif(public.master_game_search_normalize(p_q), '') is null
    and nullif(public.master_game_search_normalize(p_player_1), '') is null
    and nullif(public.master_game_search_normalize(p_player_2), '') is null
    and nullif(public.master_game_search_normalize(p_event), '') is null
    and nullif(public.master_game_search_normalize(p_opening), '') is not null
  then
    return query
      select *
      from public.search_master_games_flexible_opening_only(
        p_opening,
        p_result,
        p_year_from,
        p_year_to,
        p_sort,
        p_page_num,
        p_page_size
      );
    return;
  end if;

  return query
    select *
    from public.search_master_games_flexible_core(
      p_q,
      p_player_1,
      p_player_2,
      p_opening,
      p_event,
      p_result,
      p_player_1_color,
      p_year_from,
      p_year_to,
      p_sort,
      p_page_num,
      p_page_size
    );
end;
$$;

revoke all on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) from public;
grant execute on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;
