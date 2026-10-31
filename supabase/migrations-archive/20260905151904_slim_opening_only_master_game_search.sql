-- Keep opening-only counting/sorting narrow. Fetch full display rows only after
-- pagination so large opening families remain below the anonymous statement limit.

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
      mg.white,
      mg.year,
      mg.eco,
      oc.display_name as resolved_opening,
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
  ),
  page as materialized (
    select c.*
    from counted c
    order by
      c.relevance_score desc,
      case when c.sort_mode = 'player' then lower(c.white) end asc,
      case when c.sort_mode = 'opening' then lower(c.resolved_opening) end asc nulls last,
      case when c.sort_mode = 'oldest' then c.year end asc nulls last,
      case when c.sort_mode <> 'oldest' then c.year end desc nulls last,
      c.id desc
    limit (select page_size from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  )
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
    coalesce(nullif(mg.opening, ''), p.resolved_opening) as opening,
    mg.eco,
    mg.description,
    p.matching_count as total_count
  from page p
  join public.master_games mg on mg.id = p.id
  order by
    p.relevance_score desc,
    case when p.sort_mode = 'player' then lower(p.white) end asc,
    case when p.sort_mode = 'opening' then lower(p.resolved_opening) end asc nulls last,
    case when p.sort_mode = 'oldest' then p.year end asc nulls last,
    case when p.sort_mode <> 'oldest' then p.year end desc nulls last,
    p.id desc;
$$;

revoke all on function public.search_master_games_flexible_opening_only(text, text, integer, integer, text, integer, integer) from public;
grant execute on function public.search_master_games_flexible_opening_only(text, text, integer, integer, text, integer, integer) to anon, authenticated;



