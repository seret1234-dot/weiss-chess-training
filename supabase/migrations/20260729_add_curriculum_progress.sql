begin;

create table if not exists public.user_curriculum_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  curriculum_version smallint not null default 1 check (curriculum_version >= 1),
  rating_snapshot integer check (rating_snapshot between 0 and 4000),
  rating_source text not null default 'unknown'
    check (rating_source in ('estimated', 'detected', 'target', 'default', 'unknown')),
  imported_weakness_area text check (
    imported_weakness_area is null or imported_weakness_area in (
      'mates', 'tactics', 'endgame-piece-mates', 'endgame-studies',
      'openings', 'master-games', 'board-vision'
    )
  ),
  category_weights jsonb not null default '{}'::jsonb
    check (jsonb_typeof(category_weights) = 'object'),
  legacy_category_stats jsonb not null default '{}'::jsonb
    check (jsonb_typeof(legacy_category_stats) = 'object'),
  seeded_from_existing_progress boolean not null default false,
  source_profile_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_curriculum_area_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in (
    'mates', 'tactics', 'endgame-piece-mates', 'endgame-studies',
    'openings', 'master-games', 'board-vision'
  )),
  current_stage smallint not null default 1 check (current_stage >= 1),
  difficulty_ceiling smallint not null default 1 check (difficulty_ceiling >= current_stage),
  category_weight smallint not null default 0 check (category_weight between 0 and 100),
  temporary_reinforcement boolean not null default false,
  reinforcement_until timestamptz,
  reinforcement_reason text check (
    reinforcement_reason is null or reinforcement_reason in (
      'low_accuracy', 'repeated_failures', 'high_hints',
      'slow_solving', 'failed_transfer_test'
    )
  ),
  last_transfer_outcome text check (
    last_transfer_outcome is null or last_transfer_outcome in ('passed', 'failed')
  ),
  last_transfer_at timestamptz,
  permanently_mastered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, area)
);

create table if not exists public.user_curriculum_stage_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in (
    'mates', 'tactics', 'endgame-piece-mates', 'endgame-studies',
    'openings', 'master-games', 'board-vision'
  )),
  stage_order smallint not null check (stage_order >= 1),
  attempts integer not null default 0 check (attempts >= 0),
  correct_attempts integer not null default 0
    check (correct_attempts between 0 and attempts),
  hint_count integer not null default 0 check (hint_count >= 0),
  average_solve_ms integer check (average_solve_ms >= 0),
  recent_attempts integer not null default 0 check (recent_attempts >= 0),
  recent_correct_attempts integer not null default 0
    check (recent_correct_attempts between 0 and recent_attempts),
  mixed_attempts integer not null default 0 check (mixed_attempts >= 0),
  mixed_correct_attempts integer not null default 0
    check (mixed_correct_attempts between 0 and mixed_attempts),
  session_days integer not null default 0 check (session_days >= 0),
  permanent_mastery boolean not null default false,
  mastered_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, area, stage_order)
);

create table if not exists public.user_curriculum_theme_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in ('mates', 'tactics')),
  stage_order smallint not null check (stage_order >= 1),
  theme_key text not null check (length(trim(theme_key)) > 0),
  attempts integer not null default 0 check (attempts >= 0),
  correct_attempts integer not null default 0
    check (correct_attempts between 0 and attempts),
  hint_count integer not null default 0 check (hint_count >= 0),
  average_solve_ms integer check (average_solve_ms >= 0),
  permanent_mastery boolean not null default false,
  mastered_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, area, stage_order, theme_key)
);

create table if not exists public.user_curriculum_session_evidence (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  area text not null check (area in (
    'mates', 'tactics', 'endgame-piece-mates', 'endgame-studies',
    'openings', 'master-games', 'board-vision'
  )),
  stage_order smallint not null check (stage_order >= 1),
  theme_key text,
  trainer_key text not null check (length(trim(trainer_key)) > 0),
  route text not null check (left(route, 1) = '/'),
  event_kind text not null check (
    event_kind in ('focused', 'mixed', 'review', 'preview', 'reinforcement', 'transfer')
  ),
  attempts integer not null check (attempts > 0),
  correct_attempts integer not null
    check (correct_attempts between 0 and attempts),
  hint_count integer not null default 0 check (hint_count >= 0),
  average_solve_ms integer check (average_solve_ms >= 0),
  transfer_outcome text check (
    transfer_outcome is null or transfer_outcome in ('passed', 'failed')
  ),
  occurred_on date not null default current_date,
  completed_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists user_curriculum_area_progress_user_area_idx
  on public.user_curriculum_area_progress (user_id, area);
create index if not exists user_curriculum_stage_progress_user_area_stage_idx
  on public.user_curriculum_stage_progress (user_id, area, stage_order);
create index if not exists user_curriculum_theme_progress_user_area_stage_idx
  on public.user_curriculum_theme_progress (user_id, area, stage_order);
create index if not exists user_curriculum_session_evidence_user_area_day_idx
  on public.user_curriculum_session_evidence (user_id, area, occurred_on desc);
create index if not exists user_curriculum_area_reinforcement_idx
  on public.user_curriculum_area_progress (user_id, reinforcement_until)
  where temporary_reinforcement = true;

create or replace function public.set_curriculum_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_curriculum_state_updated_at on public.user_curriculum_state;
create trigger set_user_curriculum_state_updated_at
before update on public.user_curriculum_state
for each row execute function public.set_curriculum_updated_at();

drop trigger if exists set_user_curriculum_area_progress_updated_at on public.user_curriculum_area_progress;
create trigger set_user_curriculum_area_progress_updated_at
before update on public.user_curriculum_area_progress
for each row execute function public.set_curriculum_updated_at();

drop trigger if exists set_user_curriculum_stage_progress_updated_at on public.user_curriculum_stage_progress;
create trigger set_user_curriculum_stage_progress_updated_at
before update on public.user_curriculum_stage_progress
for each row execute function public.set_curriculum_updated_at();

drop trigger if exists set_user_curriculum_theme_progress_updated_at on public.user_curriculum_theme_progress;
create trigger set_user_curriculum_theme_progress_updated_at
before update on public.user_curriculum_theme_progress
for each row execute function public.set_curriculum_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_curriculum_state',
    'user_curriculum_area_progress',
    'user_curriculum_stage_progress',
    'user_curriculum_theme_progress',
    'user_curriculum_session_evidence'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists curriculum_owner on public.%I', table_name);
    execute format(
      'create policy curriculum_owner on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

grant usage, select on sequence public.user_curriculum_session_evidence_id_seq to authenticated;

commit;
