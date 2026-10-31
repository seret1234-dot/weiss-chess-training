-- Preserve the current general search as a read-only core. A small wrapper below
-- dispatches opening-only searches to an explicitly ECO-indexed plan.

create or replace function public.search_master_games_flexible_core(
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
  eligible_games as not materialized (
    select
      mg.id,
      mg.slug,
      mg.title,
      mg.white,
      mg.black,
      mg.white_norm,
      mg.black_norm,
      mg.result,
      mg.event,
      mg.site,
      mg.year,
      mg.opening,
      mg.eco,
      mg.description,
      mg.search_text
    from public.master_games mg
    cross join params p
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
      and (
        p.event_query is null
        or lower(coalesce(mg.event, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.site, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.event, '')) operator(public.%) p.event_query
        or lower(coalesce(mg.site, '')) operator(public.%) p.event_query
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
  candidate_games as materialized (
    select g.*, p1.score as p1_white_score, 0::integer as p1_black_score,
      0::integer as p2_white_score, p2.score as p2_black_score
    from params p
    cross join player_1_candidates p1
    cross join player_2_candidates p2
    join eligible_games g
      on g.white_norm = p1.normalized_name and g.black_norm = p2.normalized_name
    where p.player_2 is not null and p.player_1_color <> 'black'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, p1.score, p2.score, 0::integer
    from params p
    cross join player_1_candidates p1
    cross join player_2_candidates p2
    join eligible_games g
      on g.black_norm = p1.normalized_name and g.white_norm = p2.normalized_name
    where p.player_2 is not null and p.player_1_color <> 'white'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, p1.score, 0::integer, 0::integer, 0::integer
    from params p
    cross join player_1_candidates p1
    join eligible_games g on g.white_norm = p1.normalized_name
    where p.player_1 is not null and p.player_2 is null and p.player_1_color <> 'black'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, p1.score, 0::integer, 0::integer
    from params p
    cross join player_1_candidates p1
    join eligible_games g on g.black_norm = p1.normalized_name
    where p.player_1 is not null and p.player_2 is null and p.player_1_color <> 'white'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, 0::integer, 0::integer, 0::integer
    from params p
    cross join eligible_games g
    where p.player_1 is null and p.player_2 is null
      and p.opening_query is null

    union all

    select g.*, 0::integer, 0::integer, 0::integer, 0::integer
    from params p
    join opening_candidates opening_match on true
    join eligible_games g on g.eco = opening_match.eco_code
    where p.player_1 is null and p.player_2 is null
      and p.opening_query is not null
  ),
  scored as materialized (
    select
      g.*,
      coalesce(nullif(g.opening, ''), oc.display_name) as resolved_opening,
      case when p.query is null then 0 else public.master_game_text_match_score(
        concat_ws(' ', g.search_text, oc.search_text, g.year::text, g.eco), p.query
      ) end as query_score,
      coalesce(opening_match.score, 0) as opening_score,
      case when p.event_query is null then 0 else public.master_game_text_match_score(
        concat_ws(' ', g.event, g.site), p.event_query
      ) end as event_score,
      p.query,
      p.opening_query,
      p.event_query,
      p.sort_mode,
      p.page_number,
      p.page_size
    from candidate_games g
    cross join params p
    left join public.master_game_opening_search_catalog oc on oc.eco_code = g.eco
    left join opening_candidates opening_match on opening_match.eco_code = g.eco
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
    where (s.query is null or s.query_score > 0)
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

revoke all on function public.search_master_games_flexible_core(text, text, text, text, text, text, text, integer, integer, text, integer, integer) from public;
grant execute on function public.search_master_games_flexible_core(text, text, text, text, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;





create or replace function public.search_master_games_flexible_opening_only(
  p_opening text default '',
  p_result text default '',
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
      nullif(public.master_game_search_normalize(p_opening), '') as opening_query,
      nullif(trim(coalesce(p_result, '')), '') as result_filter,
      lower(trim(coalesce(p_sort, 'newest'))) as sort_mode,
      greatest(coalesce(p_page_num, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 30), 1), 100) as page_size
  ),
  opening_candidates as materialized (
    select
      c.eco_code,
      c.display_name,
      public.master_game_text_match_score(c.search_text, p.opening_query) as score
    from public.master_game_opening_search_catalog c
    cross join params p
    where public.master_game_text_match_score(c.search_text, p.opening_query) > 0
  ),
  matched as materialized (
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
      oc.score as relevance_score,
      p.sort_mode,
      p.page_number,
      p.page_size
    from opening_candidates oc
    join public.master_games mg on mg.eco = oc.eco_code
    cross join params p
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
  ),
  counted as (
    select m.*, count(*) over ()::bigint as matching_count
    from matched m
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

revoke all on function public.search_master_games_flexible_core(text, text, text, text, text, text, text, integer, integer, text, integer, integer) from public;
revoke all on function public.search_master_games_flexible_opening_only(text, text, integer, integer, text, integer, integer) from public;
revoke all on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) from public;

grant execute on function public.search_master_games_flexible_core(text, text, text, text, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;
grant execute on function public.search_master_games_flexible_opening_only(text, text, integer, integer, text, integer, integer) to anon, authenticated;
grant execute on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;

