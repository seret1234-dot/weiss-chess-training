create table if not exists public.image_to_position_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved'
    check (status in ('reserved', 'succeeded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists image_to_position_usage_user_created_idx
  on public.image_to_position_usage (user_id, created_at desc);
alter table public.image_to_position_usage enable row level security;
revoke all on table public.image_to_position_usage
  from public, anon, authenticated;
create or replace function public.reserve_image_to_position_usage(
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
  v_window_start timestamptz;
  v_limit integer;
  v_used integer := 0;
  v_oldest timestamptz;
  v_reset_at timestamptz;
  v_reservation_id uuid;
  v_tier text;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'code', 'AUTH_REQUIRED'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text)
  );

  delete from public.image_to_position_usage
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
    v_limit := 5;
    v_window_start :=
      date_trunc('day', v_now at time zone 'UTC')
      at time zone 'UTC';
    v_reset_at := v_window_start + interval '1 day';
  else
    v_tier := 'free';
    v_limit := 1;
    v_window_start := v_now - interval '7 days';
  end if;

  select
    count(*)::integer,
    min(created_at)
  into
    v_used,
    v_oldest
  from public.image_to_position_usage
  where user_id = p_user_id
    and status in ('reserved', 'succeeded')
    and created_at >= v_window_start;

  if not v_is_premium then
    v_reset_at := coalesce(
      v_oldest + interval '7 days',
      v_now + interval '7 days'
    );
  end if;

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'code', 'IMAGE_QUOTA_EXCEEDED',
      'tier', v_tier,
      'limit', v_limit,
      'used', v_used,
      'remaining', 0,
      'reset_at', v_reset_at
    );
  end if;

  insert into public.image_to_position_usage (
    user_id,
    status
  )
  values (
    p_user_id,
    'reserved'
  )
  returning id into v_reservation_id;

  v_used := v_used + 1;

  if not v_is_premium then
    v_reset_at := v_now + interval '7 days';
  end if;

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
create or replace function public.complete_image_to_position_usage(
  p_user_id uuid,
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.image_to_position_usage
  set
    status = 'succeeded',
    completed_at = now()
  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;
create or replace function public.release_image_to_position_usage(
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
  delete from public.image_to_position_usage
  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;
revoke all on function
  public.reserve_image_to_position_usage(uuid)
  from public, anon, authenticated;
revoke all on function
  public.complete_image_to_position_usage(uuid, uuid)
  from public, anon, authenticated;
revoke all on function
  public.release_image_to_position_usage(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.reserve_image_to_position_usage(uuid)
  to service_role;
grant execute on function
  public.complete_image_to_position_usage(uuid, uuid)
  to service_role;
grant execute on function
  public.release_image_to_position_usage(uuid, uuid)
  to service_role;
