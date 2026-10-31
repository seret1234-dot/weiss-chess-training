-- Reconcile the pre-existing, unused slug-based opening bookmark experiment
-- with the canonical opening_lines UUID identity. Existing rows (if any on a
-- different environment) are migrated by exact slug before old columns go.
create table if not exists public.user_opening_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  opening_id uuid not null references public.opening_lines(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, opening_id)
);

alter table public.user_opening_library
  add column if not exists opening_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_opening_library'
      and column_name = 'opening_slug'
  ) then
    execute $migration$
      update public.user_opening_library saved
      set opening_id = line.id
      from public.opening_lines line
      where saved.opening_id is null
        and line.slug = saved.opening_slug
    $migration$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.user_opening_library
    where opening_id is null
  ) then
    raise exception 'Cannot migrate user_opening_library: an opening_slug has no canonical opening_lines row';
  end if;
end
$$;

alter table public.user_opening_library
  drop constraint if exists user_opening_library_pkey;

alter table public.user_opening_library
  drop column if exists source,
  drop column if exists is_favorite,
  drop column if exists opening_slug;

alter table public.user_opening_library
  alter column opening_id set not null;

alter table public.user_opening_library
  add constraint user_opening_library_pkey primary key (user_id, opening_id);

alter table public.user_opening_library
  drop constraint if exists user_opening_library_opening_id_fkey;

alter table public.user_opening_library
  add constraint user_opening_library_opening_id_fkey
  foreign key (opening_id) references public.opening_lines(id) on delete cascade;

alter table public.user_opening_library enable row level security;

create index if not exists user_opening_library_newest_idx
  on public.user_opening_library (user_id, added_at desc, opening_id desc);

drop policy if exists "Users can add to their opening library" on public.user_opening_library;
drop policy if exists "Users can read their opening library" on public.user_opening_library;
drop policy if exists "Users can remove from their opening library" on public.user_opening_library;
drop policy if exists "Users can update their opening library" on public.user_opening_library;
drop policy if exists "Users can read their own opening library" on public.user_opening_library;
drop policy if exists "Users can add their own opening library" on public.user_opening_library;
drop policy if exists "Users can remove their own opening library" on public.user_opening_library;

create policy "Users can read their own opening library"
  on public.user_opening_library
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own opening library"
  on public.user_opening_library
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own opening library"
  on public.user_opening_library
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_opening_library from anon, authenticated;
grant select, insert, delete on table public.user_opening_library to authenticated;

comment on table public.user_opening_library is
  'Per-account bookmarks for canonical opening_lines. Removing a bookmark never removes training progress.';

create or replace function public.next_user_opening(
  p_current_opening_id uuid default null
)
returns table(id uuid, slug text)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with current_bookmark as (
    select saved.added_at, saved.opening_id
    from public.user_opening_library saved
    where saved.user_id = (select auth.uid())
      and saved.opening_id = p_current_opening_id
  )
  select line.id, line.slug
  from public.user_opening_library saved
  join public.opening_lines line on line.id = saved.opening_id
  left join current_bookmark cursor_row on true
  where saved.user_id = (select auth.uid())
    and (
      p_current_opening_id is null
      or (
        cursor_row.opening_id is not null
        and (saved.added_at, saved.opening_id)
          < (cursor_row.added_at, cursor_row.opening_id)
      )
    )
  order by saved.added_at desc, saved.opening_id desc
  limit 1;
$$;

revoke all on function public.next_user_opening(uuid) from public, anon;
grant execute on function public.next_user_opening(uuid) to authenticated;

comment on function public.next_user_opening(uuid) is
  'Returns the first or next saved opening line in deterministic newest-first order for the authenticated user.';
