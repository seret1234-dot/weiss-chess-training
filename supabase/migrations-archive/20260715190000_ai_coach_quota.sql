create table if not exists public.coach_explanation_usage (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  tier text not null
    check (tier in ('free', 'premium')),

  status text not null default 'reserved'
    check (status in ('reserved', 'succeeded')),

  model text,

  input_tokens integer
    check (input_tokens is null or input_tokens >= 0),

  output_tokens integer
    check (output_tokens is null or output_tokens >= 0),

  estimated_cost_usd numeric(12, 8)
    check (
      estimated_cost_usd is null
      or estimated_cost_usd >= 0
    ),

  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists
  coach_explanation_usage_user_created_idx
on public.coach_explanation_usage (
  user_id,
  created_at desc
);
create index if not exists
  coach_explanation_usage_user_tier_created_idx
on public.coach_explanation_usage (
  user_id,
  tier,
  created_at desc
);
alter table public.coach_explanation_usage
  enable row level security;
revoke all
on table public.coach_explanation_usage
from public, anon, authenticated;
create or replace function
public.reserve_coach_explanation_usage(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := now();

  v_is_premium boolean := false;
  v_tier text;
  v_limit integer;
  v_used integer := 0;

  v_window_start timestamptz;
  v_reset_at timestamptz;

  v_reservation_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'code', 'AUTH_REQUIRED'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      'coach-explanation:' || p_user_id::text
    )
  );

  delete from public.coach_explanation_usage
  where user_id = p_user_id
    and status = 'reserved'
    and created_at < v_now - interval '15 minutes';

  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing')
      and (
        s.current_period_end is null
        or s.current_period_end > v_now
      )
  )
  into v_is_premium;

  if v_is_premium then
    v_tier := 'premium';
    v_limit := 30;

    v_window_start :=
      date_trunc(
        'month',
        v_now at time zone 'UTC'
      ) at time zone 'UTC';

    v_reset_at :=
      (
        date_trunc(
          'month',
          v_now at time zone 'UTC'
        ) + interval '1 month'
      ) at time zone 'UTC';

    select count(*)::integer
    into v_used
    from public.coach_explanation_usage
    where user_id = p_user_id
      and tier = 'premium'
      and status in ('reserved', 'succeeded')
      and created_at >= v_window_start;
  else
    v_tier := 'free';
    v_limit := 1;
    v_reset_at := null;

    select count(*)::integer
    into v_used
    from public.coach_explanation_usage
    where user_id = p_user_id
      and status in ('reserved', 'succeeded');
  end if;

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'code', 'COACH_QUOTA_EXCEEDED',
      'tier', v_tier,
      'limit', v_limit,
      'used', v_used,
      'remaining', 0,
      'reset_at', v_reset_at
    );
  end if;

  insert into public.coach_explanation_usage (
    user_id,
    tier,
    status
  )
  values (
    p_user_id,
    v_tier,
    'reserved'
  )
  returning id into v_reservation_id;

  v_used := v_used + 1;

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', v_reservation_id,
    'tier', v_tier,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'reset_at', v_reset_at
  );
end;
$$;
create or replace function
public.complete_coach_explanation_usage(
  p_user_id uuid,
  p_reservation_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.coach_explanation_usage
  set
    status = 'succeeded',
    completed_at = now(),
    model = left(p_model, 100),

    input_tokens =
      greatest(coalesce(p_input_tokens, 0), 0),

    output_tokens =
      greatest(coalesce(p_output_tokens, 0), 0),

    estimated_cost_usd =
      case
        when p_estimated_cost_usd is null then null
        when p_estimated_cost_usd < 0 then null
        else p_estimated_cost_usd
      end

  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;
create or replace function
public.release_coach_explanation_usage(
  p_user_id uuid,
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.coach_explanation_usage
  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';

  get diagnostics v_deleted = row_count;

  return v_deleted = 1;
end;
$$;
revoke all on function
  public.reserve_coach_explanation_usage(uuid)
from public, anon, authenticated;
revoke all on function
  public.complete_coach_explanation_usage(
    uuid,
    uuid,
    text,
    integer,
    integer,
    numeric
  )
from public, anon, authenticated;
revoke all on function
  public.release_coach_explanation_usage(
    uuid,
    uuid
  )
from public, anon, authenticated;
grant execute on function
  public.reserve_coach_explanation_usage(uuid)
to service_role;
grant execute on function
  public.complete_coach_explanation_usage(
    uuid,
    uuid,
    text,
    integer,
    integer,
    numeric
  )
to service_role;
grant execute on function
  public.release_coach_explanation_usage(
    uuid,
    uuid
  )
to service_role;
