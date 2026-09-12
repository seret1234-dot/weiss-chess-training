-- Weekly Adaptive Test: account sync and adaptive plan signals
-- Run in Supabase SQL Editor, or apply with the Supabase CLI.

create table if not exists public.weekly_adaptive_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_key date not null,
  engine_elo integer not null default 1500
    check (engine_elo between 100 and 3000),
  current_game smallint not null default 0
    check (current_game between 0 and 2),
  state jsonb not null default '{}'::jsonb,
  plan_signals jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_key)
);
create index if not exists weekly_adaptive_tests_user_completed_idx
  on public.weekly_adaptive_tests (user_id, completed_at desc);
alter table public.weekly_adaptive_tests enable row level security;
drop policy if exists "Users read own weekly tests"
  on public.weekly_adaptive_tests;
create policy "Users read own weekly tests"
  on public.weekly_adaptive_tests
  for select
  using (auth.uid() = user_id);
drop policy if exists "Users insert own weekly tests"
  on public.weekly_adaptive_tests;
create policy "Users insert own weekly tests"
  on public.weekly_adaptive_tests
  for insert
  with check (auth.uid() = user_id);
drop policy if exists "Users update own weekly tests"
  on public.weekly_adaptive_tests;
create policy "Users update own weekly tests"
  on public.weekly_adaptive_tests
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update on public.weekly_adaptive_tests to authenticated;
