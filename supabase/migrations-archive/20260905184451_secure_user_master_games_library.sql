-- `user_master_games` already exists in production and is the established
-- account-owned Master Games bookmark table. Keep that single source of truth,
-- while making fresh environments reproducible and narrowing its Data API
-- surface to authenticated, owner-scoped access.
create table if not exists public.user_master_games (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id bigint not null references public.master_games(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  is_favorite boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.user_master_games enable row level security;

create index if not exists user_master_games_newest_idx
  on public.user_master_games (user_id, added_at desc, game_id desc);

drop policy if exists "Users can add master games" on public.user_master_games;
drop policy if exists "Users can read their master games library" on public.user_master_games;
drop policy if exists "Users can remove master games" on public.user_master_games;
drop policy if exists "Users can update their master games library" on public.user_master_games;

create policy "Users can read their master games library"
  on public.user_master_games
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add master games"
  on public.user_master_games
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove master games"
  on public.user_master_games
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Retained for compatibility with already-deployed clients whose idempotent
-- upsert may resolve through DO UPDATE. Ownership cannot be reassigned.
create policy "Users can update their master games library"
  on public.user_master_games
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_master_games from anon, authenticated;
grant select, insert, update, delete on table public.user_master_games to authenticated;

comment on table public.user_master_games is
  'Per-account Master Games bookmarks. Removing a bookmark never removes training progress.';

create or replace function public.next_user_master_game(
  p_current_game_id bigint default null
)
returns table(id bigint, slug text)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with current_bookmark as (
    select saved.added_at, saved.game_id
    from public.user_master_games saved
    where saved.user_id = (select auth.uid())
      and saved.game_id = p_current_game_id
  )
  select game.id, game.slug
  from public.user_master_games saved
  join public.master_games game on game.id = saved.game_id
  left join current_bookmark cursor_row on true
  where saved.user_id = (select auth.uid())
    and (
      p_current_game_id is null
      or (
        cursor_row.game_id is not null
        and (saved.added_at, saved.game_id)
          < (cursor_row.added_at, cursor_row.game_id)
      )
    )
  order by saved.added_at desc, saved.game_id desc
  limit 1;
$$;

revoke all on function public.next_user_master_game(bigint) from public, anon;
grant execute on function public.next_user_master_game(bigint) to authenticated;

comment on function public.next_user_master_game(bigint) is
  'Returns the first or next saved Master Game in deterministic newest-first order for the authenticated user.';
