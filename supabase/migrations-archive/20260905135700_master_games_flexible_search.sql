-- Flexible, paginated Master Games search.
--
-- The authoritative game rows remain unchanged. The small ECO catalog below is
-- a search index because the imported corpus has ECO on 132,309 rows but no
-- populated opening-name values.

create extension if not exists unaccent with schema extensions;

create table if not exists public.master_game_opening_search_catalog (
  eco_code text primary key check (eco_code ~ '^[A-E][0-9]{2}$'),
  display_name text not null,
  search_text text not null
);

alter table public.master_game_opening_search_catalog enable row level security;

drop policy if exists "Master game opening catalog is public" on public.master_game_opening_search_catalog;
create policy "Master game opening catalog is public"
on public.master_game_opening_search_catalog
for select
to anon, authenticated
using (true);

grant select on public.master_game_opening_search_catalog to anon, authenticated;

insert into public.master_game_opening_search_catalog (eco_code, display_name, search_text)
select
  letter || lpad(code::text, 2, '0'),
  'ECO ' || letter || lpad(code::text, 2, '0'),
  'eco ' || lower(letter) || lpad(code::text, 2, '0')
from unnest(array['A', 'B', 'C', 'D', 'E']) as letter
cross join generate_series(0, 99) as code
on conflict (eco_code) do nothing;

update public.master_game_opening_search_catalog
set
  display_name = case
    when eco_code between 'B90' and 'B99' then 'Sicilian Defense · Najdorf Variation'
    when eco_code between 'B80' and 'B89' then 'Sicilian Defense · Scheveningen Variation'
    when eco_code between 'B70' and 'B79' then 'Sicilian Defense · Dragon Variation'
    when eco_code between 'B60' and 'B69' then 'Sicilian Defense · Richter-Rauzer Variation'
    when eco_code between 'B40' and 'B49' then 'Sicilian Defense · Paulsen / Kan Variation'
    when eco_code between 'B30' and 'B39' then 'Sicilian Defense · Rossolimo / Sveshnikov Variation'
    when eco_code between 'B20' and 'B99' then 'Sicilian Defense'
    when eco_code between 'C88' and 'C99' then 'Ruy Lopez · Closed Variations'
    when eco_code between 'C80' and 'C87' then 'Ruy Lopez · Open Variations'
    when eco_code between 'C60' and 'C99' then 'Ruy Lopez / Spanish Opening'
    when eco_code between 'A00' and 'A03' then 'Uncommon Opening'
    when eco_code between 'A04' and 'A09' then 'Réti Opening'
    when eco_code between 'A10' and 'A39' then 'English Opening'
    when eco_code between 'A40' and 'A44' then 'Queen''s Pawn Opening'
    when eco_code between 'A45' and 'A49' then 'Trompowsky / Indian Game'
    when eco_code between 'A50' and 'A59' then 'Benko / Benoni Systems'
    when eco_code between 'A60' and 'A79' then 'Benoni Defense'
    when eco_code between 'A80' and 'A99' then 'Dutch Defense'
    when eco_code = 'B01' then 'Scandinavian Defense'
    when eco_code between 'B02' and 'B05' then 'Alekhine Defense'
    when eco_code between 'B06' and 'B09' then 'Modern / Pirc Defense'
    when eco_code between 'B10' and 'B19' then 'Caro-Kann Defense'
    when eco_code between 'C00' and 'C19' then 'French Defense'
    when eco_code between 'C20' and 'C29' then 'King''s Pawn Game'
    when eco_code between 'C30' and 'C39' then 'King''s Gambit'
    when eco_code between 'C40' and 'C44' then 'Scotch / Petroff / Philidor Systems'
    when eco_code between 'C45' and 'C49' then 'Scotch Game'
    when eco_code between 'C50' and 'C59' then 'Italian Game / Two Knights Defense'
    when eco_code between 'D00' and 'D19' then 'Queen''s Pawn / Slav Systems'
    when eco_code between 'D20' and 'D29' then 'Queen''s Gambit Accepted'
    when eco_code between 'D30' and 'D69' then 'Queen''s Gambit Declined'
    when eco_code between 'D70' and 'D99' then 'Grünfeld Defense'
    when eco_code between 'E00' and 'E09' then 'Catalan Opening'
    when eco_code between 'E10' and 'E19' then 'Queen''s Indian Defense'
    when eco_code between 'E20' and 'E59' then 'Nimzo-Indian Defense'
    when eco_code between 'E60' and 'E99' then 'King''s Indian Defense'
    else 'ECO ' || eco_code
  end,
  search_text = case
    when eco_code between 'B90' and 'B99' then 'sicilian defense sicilian najdorf najdorf variation'
    when eco_code between 'B80' and 'B89' then 'sicilian defense scheveningen variation'
    when eco_code between 'B70' and 'B79' then 'sicilian defense dragon variation'
    when eco_code between 'B60' and 'B69' then 'sicilian defense richter rauzer variation'
    when eco_code between 'B40' and 'B49' then 'sicilian defense paulsen kan variation'
    when eco_code between 'B30' and 'B39' then 'sicilian defense rossolimo sveshnikov variation'
    when eco_code between 'B20' and 'B99' then 'sicilian defense sicilian'
    when eco_code between 'C88' and 'C99' then 'ruy lopez spanish opening closed variation'
    when eco_code between 'C80' and 'C87' then 'ruy lopez spanish opening open variation'
    when eco_code between 'C60' and 'C99' then 'ruy lopez spanish opening'
    when eco_code between 'A00' and 'A03' then 'uncommon irregular opening'
    when eco_code between 'A04' and 'A09' then 'reti opening'
    when eco_code between 'A10' and 'A39' then 'english opening'
    when eco_code between 'A40' and 'A44' then 'queens pawn opening'
    when eco_code between 'A45' and 'A49' then 'trompowsky indian game'
    when eco_code between 'A50' and 'A59' then 'benko benoni gambit'
    when eco_code between 'A60' and 'A79' then 'benoni defense'
    when eco_code between 'A80' and 'A99' then 'dutch defense'
    when eco_code = 'B01' then 'scandinavian defense center counter'
    when eco_code between 'B02' and 'B05' then 'alekhine defense'
    when eco_code between 'B06' and 'B09' then 'modern pirc defense'
    when eco_code between 'B10' and 'B19' then 'caro kann defense'
    when eco_code between 'C00' and 'C19' then 'french defense'
    when eco_code between 'C20' and 'C29' then 'kings pawn game'
    when eco_code between 'C30' and 'C39' then 'kings gambit'
    when eco_code between 'C40' and 'C44' then 'scotch petroff petrov philidor defense'
    when eco_code between 'C45' and 'C49' then 'scotch game'
    when eco_code between 'C50' and 'C59' then 'italian game two knights defense giuoco piano evans gambit'
    when eco_code between 'D00' and 'D19' then 'queens pawn slav defense'
    when eco_code between 'D20' and 'D29' then 'queens gambit accepted'
    when eco_code between 'D30' and 'D69' then 'queens gambit declined'
    when eco_code between 'D70' and 'D99' then 'grunfeld defense'
    when eco_code between 'E00' and 'E09' then 'catalan opening'
    when eco_code between 'E10' and 'E19' then 'queens indian defense'
    when eco_code between 'E20' and 'E59' then 'nimzo indian defense'
    when eco_code between 'E60' and 'E99' then 'kings indian defense'
    else 'eco ' || lower(eco_code)
  end || ' eco ' || lower(eco_code);

create index if not exists master_game_opening_search_catalog_trgm_idx
on public.master_game_opening_search_catalog
using gin (search_text public.gin_trgm_ops);

create table if not exists public.master_game_player_search_catalog (
  normalized_name text primary key,
  canonical_name text not null,
  token_sort_name text not null
);

alter table public.master_game_player_search_catalog enable row level security;

drop policy if exists "Master game player catalog is public" on public.master_game_player_search_catalog;
create policy "Master game player catalog is public"
on public.master_game_player_search_catalog
for select
to anon, authenticated
using (true);

grant select on public.master_game_player_search_catalog to anon, authenticated;

with player_names as (
  select mg.white_norm as normalized_name, mg.white as canonical_name
  from public.master_games mg
  where mg.white_norm is not null and mg.white is not null
  union all
  select mg.black_norm, mg.black
  from public.master_games mg
  where mg.black_norm is not null and mg.black is not null
),
deduplicated as (
  select normalized_name, min(canonical_name) as canonical_name
  from player_names
  group by normalized_name
)
insert into public.master_game_player_search_catalog (
  normalized_name,
  canonical_name,
  token_sort_name
)
select
  d.normalized_name,
  d.canonical_name,
  (
    select string_agg(token, ' ' order by token)
    from regexp_split_to_table(d.normalized_name, '\s+') as token
    where token <> ''
  )
from deduplicated d
on conflict (normalized_name) do update
set
  canonical_name = excluded.canonical_name,
  token_sort_name = excluded.token_sort_name;

create index if not exists master_game_player_search_catalog_name_trgm_idx
on public.master_game_player_search_catalog
using gin (normalized_name public.gin_trgm_ops);

create index if not exists master_game_player_search_catalog_token_sort_trgm_idx
on public.master_game_player_search_catalog
using gin (token_sort_name public.gin_trgm_ops);

create or replace function public.master_game_search_normalize(p_value text)
returns text
language sql
stable
parallel safe
set search_path = pg_catalog, public, extensions
as $$
  select trim(
    regexp_replace(
      lower(extensions.unaccent(coalesce(p_value, ''))),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.master_game_text_match_score(p_haystack text, p_query text)
returns integer
language sql
stable
parallel safe
set search_path = pg_catalog, public, extensions
as $$
  with normalized as (
    select
      public.master_game_search_normalize(p_haystack) as haystack,
      public.master_game_search_normalize(p_query) as query
  ),
  query_tokens as (
    select distinct token
    from normalized,
      lateral regexp_split_to_table(query, '\s+') as token
    where length(token) >= 2
  ),
  haystack_tokens as (
    select distinct token
    from normalized,
      lateral regexp_split_to_table(haystack, '\s+') as token
    where length(token) >= 1
  ),
  token_scores as (
    select
      qt.token,
      max(
        case
          when ht.token = qt.token then 100
          when ht.token like qt.token || '%' or qt.token like ht.token || '%' then 82
          else round(public.similarity(ht.token, qt.token) * 70)::integer
        end
      ) as best_score
    from query_tokens qt
    cross join haystack_tokens ht
    group by qt.token
  ),
  summary as (
    select
      count(*) as token_count,
      count(*) filter (
        where best_score >= case
          when length(token) <= 4 then 50
          when length(token) <= 6 then 35
          else 32
        end
      ) as matched_count,
      coalesce(round(avg(best_score))::integer, 0) as average_score
    from token_scores
  )
  select case
    when (select query from normalized) = '' then 0
    when (select haystack from normalized) = (select query from normalized) then 1000
    when (select haystack from normalized) like (select query from normalized) || '%' then 900
    when summary.token_count > 0 and summary.matched_count = summary.token_count
      then summary.average_score
    else 0
  end
  from summary;
$$;

create or replace function public.master_game_player_match_score(p_player_name text, p_query text)
returns integer
language sql
stable
parallel safe
set search_path = pg_catalog, public, extensions
as $$
  select case
    when public.master_game_search_normalize(p_query) = '' then 0
    else public.master_game_text_match_score(p_player_name, p_query)
  end;
$$;

create or replace function public.master_game_player_suggestions_flexible(
  p_query text,
  p_limit integer default 8
)
returns table(name text)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  with params as (
    select
      public.master_game_search_normalize(p_query) as query,
      least(greatest(coalesce(p_limit, 8), 1), 20) as result_limit
  ),
  ranked as (
    select
      c.canonical_name as name,
      public.master_game_player_match_score(c.normalized_name, p.query) as score
    from public.master_game_player_search_catalog c
    cross join params p
    where p.query <> ''
  )
  select r.name
  from ranked r
  where r.score > 0
  order by r.score desc, length(r.name), r.name
  limit (select result_limit from params);
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
    select
      c.normalized_name,
      public.master_game_player_match_score(c.normalized_name, p.player_1) as score
    from public.master_game_player_search_catalog c
    cross join params p
    where p.player_1 is not null
      and public.master_game_player_match_score(c.normalized_name, p.player_1) > 0
  ),
  player_2_candidates as materialized (
    select
      c.normalized_name,
      public.master_game_player_match_score(c.normalized_name, p.player_2) as score
    from public.master_game_player_search_catalog c
    cross join params p
    where p.player_2 is not null
      and public.master_game_player_match_score(c.normalized_name, p.player_2) > 0
  ),
  query_player_candidates as materialized (
    select c.normalized_name
    from public.master_game_player_search_catalog c
    cross join params p
    where p.query_first_token is not null
      and public.master_game_player_match_score(c.normalized_name, p.query_first_token) > 0
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
    from public.master_games mg
    left join public.master_game_opening_search_catalog oc
      on oc.eco_code = upper(mg.eco)
    cross join params p
    left join player_1_candidates p1_white
      on p1_white.normalized_name = mg.white_norm
    left join player_1_candidates p1_black
      on p1_black.normalized_name = mg.black_norm
    left join player_2_candidates p2_white
      on p2_white.normalized_name = mg.white_norm
    left join player_2_candidates p2_black
      on p2_black.normalized_name = mg.black_norm
    left join query_player_candidates query_player_white
      on query_player_white.normalized_name = mg.white_norm
    left join query_player_candidates query_player_black
      on query_player_black.normalized_name = mg.black_norm
    left join opening_candidates opening_match
      on opening_match.eco_code = upper(mg.eco)
    left join query_opening_candidates query_opening_match
      on query_opening_match.eco_code = upper(mg.eco)
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
      and (
        p.player_1 is null
        or p1_white.normalized_name is not null
        or p1_black.normalized_name is not null
      )
      and (
        p.player_2 is null
        or p2_white.normalized_name is not null
        or p2_black.normalized_name is not null
      )
      and (
        p.opening_query is null
        or opening_match.eco_code is not null
      )
      and (
        p.event_query is null
        or lower(coalesce(mg.event, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.site, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.event, '')) operator(public.%) p.event_query
        or lower(coalesce(mg.site, '')) operator(public.%) p.event_query
      )
      and (
        p.query is null
        or lower(coalesce(mg.search_text, '')) like '%' || p.query_first_token || '%'
        or mg.white_norm operator(public.%) p.query_first_token
        or mg.black_norm operator(public.%) p.query_first_token
        or lower(coalesce(mg.event, '')) operator(public.%) p.query_first_token
        or lower(coalesce(mg.site, '')) operator(public.%) p.query_first_token
        or oc.search_text operator(public.%) p.query_first_token
        or query_player_white.normalized_name is not null
        or query_player_black.normalized_name is not null
        or query_opening_match.eco_code is not null
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

revoke all on function public.master_game_search_normalize(text) from public;
revoke all on function public.master_game_text_match_score(text, text) from public;
revoke all on function public.master_game_player_match_score(text, text) from public;
revoke all on function public.master_game_player_suggestions_flexible(text, integer) from public;
revoke all on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) from public;

grant execute on function public.master_game_search_normalize(text) to anon, authenticated;
grant execute on function public.master_game_text_match_score(text, text) to anon, authenticated;
grant execute on function public.master_game_player_match_score(text, text) to anon, authenticated;
grant execute on function public.master_game_player_suggestions_flexible(text, integer) to anon, authenticated;
grant execute on function public.search_master_games_flexible(text, text, text, text, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;
