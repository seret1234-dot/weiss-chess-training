-- Reduce the 132,365-row corpus to indexed/filter-matched rows before joining
-- candidate scores and running the precise metadata scorer.

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
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  with params as (
    select
      nullif(public.master_game_search_normalize(p_q), '') as query,
      nullif(split_part(public.master_game_search_normalize(p_q), ' ', 1), '') as query_first_token,
      nullif(public.master_game_search_normalize(p_player_1), '') as player_1,
      nullif(public.master_game_search_normalize(p_player_2), '') as player_2,
      nullif(public.master_game_search_normalize(p_opening), '') as opening_query,
      nullif(public.master_game_search_normalize(p_event), '') as event_query,
      nullif(trim(coalesce(p_result, '')), '') as result_filter,
      lower(trim(coalesce(p_player_1_color, 'all'))) as player_1_color,
      lower(trim(coalesce(p_sort, 'newest'))) as sort_mode,
      greatest(coalesce(p_page_num, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 30), 1), 100) as page_size
  ),
  player_1_candidates as materialized (
    select candidates.normalized_name, candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.player_1) candidates
    where p.player_1 is not null
  ),
  player_2_candidates as materialized (
    select candidates.normalized_name, candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.player_2) candidates
    where p.player_2 is not null
  ),
  query_player_candidates as materialized (
    select candidates.normalized_name
    from params p
    cross join lateral public.master_game_player_candidates(p.query_first_token) candidates
    where p.query_first_token is not null
  ),
  opening_candidates as materialized (
    select
      c.eco_code,
      public.master_game_text_match_score(c.search_text, p.opening_query) as score
    from public.master_game_opening_search_catalog c
    cross join params p
    where p.opening_query is not null
      and public.master_game_text_match_score(c.search_text, p.opening_query) > 0
  ),
  query_opening_candidates as materialized (
    select c.eco_code
    from public.master_game_opening_search_catalog c
    cross join params p
    where p.query_first_token is not null
      and public.master_game_text_match_score(c.search_text, p.query_first_token) > 0
  ),
  preselected_games as materialized (
    select mg.*
    from public.master_games mg
    cross join params p
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
      and (
        p.player_1 is null
        or mg.white_norm in (select normalized_name from player_1_candidates)
        or mg.black_norm in (select normalized_name from player_1_candidates)
      )
      and (
        p.player_2 is null
        or mg.white_norm in (select normalized_name from player_2_candidates)
        or mg.black_norm in (select normalized_name from player_2_candidates)
      )
      and (
        p.opening_query is null
        or mg.eco in (select eco_code from opening_candidates)
      )
      and (
        p.query is null
        or mg.white_norm in (select normalized_name from query_player_candidates)
        or mg.black_norm in (select normalized_name from query_player_candidates)
        or lower(coalesce(mg.search_text, '')) like '%' || p.query_first_token || '%'
        or lower(coalesce(mg.event, '')) operator(public.%) p.query_first_token
        or lower(coalesce(mg.site, '')) operator(public.%) p.query_first_token
        or mg.eco in (select eco_code from query_opening_candidates)
      )
  ),
  scored as materialized (
    select
      mg.id,
      mg.slug,
      mg.title,
      mg.white,
      mg.black,
      mg.result,
      mg.event,
      mg.site,
      mg.year,
      coalesce(nullif(mg.opening, ''), oc.display_name) as resolved_opening,
      mg.eco,
      mg.description,
      coalesce(p1_white.score, 0) as p1_white_score,
      coalesce(p1_black.score, 0) as p1_black_score,
      coalesce(p2_white.score, 0) as p2_white_score,
      coalesce(p2_black.score, 0) as p2_black_score,
      public.master_game_text_match_score(
        concat_ws(' ', mg.search_text, oc.search_text, mg.year::text, mg.eco),
        p.query
      ) as query_score,
      coalesce(opening_match.score, 0) as opening_score,
      public.master_game_text_match_score(concat_ws(' ', mg.event, mg.site), p.event_query) as event_score,
      p.*
    from preselected_games mg
    left join public.master_game_opening_search_catalog oc
      on oc.eco_code = mg.eco
    cross join params p
    left join player_1_candidates p1_white
      on p1_white.normalized_name = mg.white_norm
    left join player_1_candidates p1_black
      on p1_black.normalized_name = mg.black_norm
    left join player_2_candidates p2_white
      on p2_white.normalized_name = mg.white_norm
    left join player_2_candidates p2_black
      on p2_black.normalized_name = mg.black_norm
    left join opening_candidates opening_match
      on opening_match.eco_code = mg.eco
    where (
      p.event_query is null
      or lower(coalesce(mg.event, '')) like '%' || p.event_query || '%'
      or lower(coalesce(mg.site, '')) like '%' || p.event_query || '%'
      or lower(coalesce(mg.event, '')) operator(public.%) p.event_query
      or lower(coalesce(mg.site, '')) operator(public.%) p.event_query
    )
  ),
  filtered as materialized (
    select
      s.*,
      (
        s.p1_white_score + s.p1_black_score
        + s.p2_white_score + s.p2_black_score
        + s.query_score + s.opening_score + s.event_score
      ) as relevance_score
    from scored s
    where
      (
        s.player_1 is null
        or (
          s.player_2 is null
          and (
            (s.player_1_color = 'white' and s.p1_white_score > 0)
            or (s.player_1_color = 'black' and s.p1_black_score > 0)
            or (s.player_1_color not in ('white', 'black') and (s.p1_white_score > 0 or s.p1_black_score > 0))
          )
        )
        or (
          s.player_2 is not null
          and (
            (s.player_1_color = 'white' and s.p1_white_score > 0 and s.p2_black_score > 0)
            or (s.player_1_color = 'black' and s.p1_black_score > 0 and s.p2_white_score > 0)
            or (
              s.player_1_color not in ('white', 'black')
              and (
                (s.p1_white_score > 0 and s.p2_black_score > 0)
                or (s.p1_black_score > 0 and s.p2_white_score > 0)
              )
            )
          )
        )
      )
      and (s.query is null or s.query_score > 0)
      and (s.opening_query is null or s.opening_score > 0)
      and (s.event_query is null or s.event_score > 0)
  ),
  counted as (
    select f.*, count(*) over ()::bigint as matching_count
    from filtered f
  )
  select
    c.id,
    c.slug,
    c.title,
    c.white,
    c.black,
    c.result,
    c.event,
    c.site,
    c.year,
    c.resolved_opening as opening,
    c.eco,
    c.description,
    c.matching_count as total_count
  from counted c
  order by
    c.relevance_score desc,
    case when c.sort_mode = 'player' then lower(c.white) end asc,
    case when c.sort_mode = 'opening' then lower(c.resolved_opening) end asc nulls last,
    case when c.sort_mode = 'oldest' then c.year end asc nulls last,
    case when c.sort_mode <> 'oldest' then c.year end desc nulls last,
    c.id desc
  limit (select page_size from params)
  offset ((select page_number from params) - 1) * (select page_size from params);
$$;

revoke all on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) from public;
grant execute on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;
