-- A short stored initial such as "sp" must not count as a prefix match for a
-- longer query such as "spasky". Forward query prefixes remain supported.

create or replace function public.master_game_player_candidates(p_query text)
returns table(normalized_name text, score integer)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  with normalized as (
    select public.master_game_search_normalize(p_query) as query
  ),
  query_tokens as (
    select distinct token
    from normalized,
      lateral regexp_split_to_table(query, '\s+') as token
    where length(token) >= 2
  ),
  token_matches as (
    select
      qt.token as query_token,
      c.normalized_name,
      max(
        case
          when c.token = qt.token then 100
          when c.token like qt.token || '%' then 82
          else round(public.similarity(c.token, qt.token) * 70)::integer
        end
      ) as token_score
    from query_tokens qt
    join public.master_game_player_token_search_catalog c
      on c.token = qt.token
      or c.token like qt.token || '%'
      or c.token operator(public.%) qt.token
    group by qt.token, c.normalized_name
  ),
  qualified as (
    select
      tm.normalized_name,
      round(avg(tm.token_score))::integer as score,
      count(*) as matched_tokens
    from token_matches tm
    where tm.token_score >= case
      when length(tm.query_token) <= 4 then 50
      when length(tm.query_token) <= 6 then 35
      else 32
    end
    group by tm.normalized_name
  )
  select q.normalized_name, q.score
  from qualified q
  where q.matched_tokens = (select count(*) from query_tokens);
$$;

revoke all on function public.master_game_player_candidates(text) from public;
grant execute on function public.master_game_player_candidates(text) to anon, authenticated;
