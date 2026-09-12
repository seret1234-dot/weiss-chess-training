-- Keep fuzzy player matching bounded: use native pg_trgm scoring as a cheap
-- candidate gate before the more precise token-by-token scorer. Also avoid
-- tokenizing metadata when an optional query is absent.

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
    where query <> ''
      and length(token) >= 2
  ),
  haystack_tokens as (
    select distinct token
    from normalized,
      lateral regexp_split_to_table(haystack, '\s+') as token
    where query <> ''
      and length(token) >= 1
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
  with normalized as (
    select
      public.master_game_search_normalize(p_player_name) as player_name,
      public.master_game_search_normalize(p_query) as query
  )
  select case
    when query = '' then 0
    when greatest(
      public.word_similarity(query, player_name),
      public.similarity(query, player_name)
    ) < case
      when length(query) <= 4 then 0.70
      when length(query) <= 6 then 0.45
      else 0.38
    end then 0
    else public.master_game_text_match_score(player_name, query)
  end
  from normalized;
$$;

revoke all on function public.master_game_text_match_score(text, text) from public;
revoke all on function public.master_game_player_match_score(text, text) from public;

grant execute on function public.master_game_text_match_score(text, text) to anon, authenticated;
grant execute on function public.master_game_player_match_score(text, text) to anon, authenticated;
