-- Local only until reviewed. No subscription, payment, or other AI quota changes.
begin;
create table public.chess_voice_usage (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null check (status in ('reserved', 'succeeded', 'released')),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index chess_voice_usage_user_created_idx on public.chess_voice_usage(user_id, created_at desc);
alter table public.chess_voice_usage enable row level security;
revoke all on public.chess_voice_usage from public, anon, authenticated;
grant select, insert, update on public.chess_voice_usage to service_role;

-- Invoker privileges: only the authenticated server's service role may execute.
-- Same reservation philosophy as Image/Coach, with independent UTC-day limits.
create function public.chess_voice_quota(p_user_id uuid, p_reserve boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_now timestamptz := now();
 v_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
 v_premium boolean;
 v_limit integer;
 v_used integer;
 v_pending integer;
 v_attempts integer;
 v_recent integer;
 v_id uuid;
 v_result jsonb;
begin
 if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_reserve then perform pg_advisory_xact_lock(hashtextextended('chess-voice:' || p_user_id::text, 0)); end if;
 -- Mirrors current subscriptionIsPremium: active/trialing and a valid expiry;
 -- only explicit manual grants may omit expiry. Never trust React/JWT metadata.
 select exists(select 1 from public.subscriptions s where s.user_id=p_user_id
   and s.status in ('active','trialing')
   and (s.current_period_end > v_now or (s.current_period_end is null and s.provider='manual')))
 into v_premium;
 v_limit := case when v_premium then 2000 else 10 end;
 select count(*) filter(where status='succeeded'),
        count(*) filter(where status='reserved' and created_at > v_now-interval '2 minutes'),
        count(*), count(*) filter(where created_at > v_now-interval '1 minute')
 into v_used,v_pending,v_attempts,v_recent
 from public.chess_voice_usage where user_id=p_user_id and created_at>=v_start;
 v_result := jsonb_build_object('tier',case when v_premium then 'premium' else 'free' end,
   'limit',v_limit,'used',v_used,'remaining',greatest(0,v_limit-v_used-v_pending),'reset_at',v_start+interval '24 hours');
 if v_used+v_pending>=v_limit then return v_result || jsonb_build_object('allowed',false,'code','VOICE_QUOTA_EXCEEDED'); end if;
 if not p_reserve then return v_result || jsonb_build_object('allowed',true); end if;
 -- Failed requests do not spend successful-use quota but cannot fuel unlimited API calls.
 if v_pending>0 or v_recent>=30 or v_attempts >= (case when v_premium then 4000 else 100 end) then
   return v_result || jsonb_build_object('allowed',false,'code','VOICE_RATE_LIMITED');
 end if;
 insert into public.chess_voice_usage(user_id,status) values(p_user_id,'reserved') returning id into v_id;
 return v_result || jsonb_build_object('allowed',true,'reservation_id',v_id,'remaining',greatest(0,v_limit-v_used-v_pending-1));
end $$;

create function public.complete_chess_voice_usage(p_user_id uuid,p_reservation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 update public.chess_voice_usage set status='succeeded',completed_at=now()
 where id=p_reservation_id and user_id=p_user_id and status='reserved' and created_at>now()-interval '2 minutes';
 get diagnostics n=row_count; return n=1;
end $$;
create function public.release_chess_voice_usage(p_user_id uuid,p_reservation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 update public.chess_voice_usage set status='released',completed_at=now()
 where id=p_reservation_id and user_id=p_user_id and status='reserved';
 get diagnostics n=row_count; return n=1;
end $$;
revoke all on function public.chess_voice_quota(uuid,boolean) from public,anon,authenticated;
revoke all on function public.complete_chess_voice_usage(uuid,uuid) from public,anon,authenticated;
revoke all on function public.release_chess_voice_usage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chess_voice_quota(uuid,boolean) to service_role;
grant execute on function public.complete_chess_voice_usage(uuid,uuid) to service_role;
grant execute on function public.release_chess_voice_usage(uuid,uuid) to service_role;
commit;
