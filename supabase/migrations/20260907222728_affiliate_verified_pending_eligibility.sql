begin;

-- Eligibility evidence only: never changes subscriptions, entitlement or payment accounting.
-- Preserve earlier states before the single current subscription row is overwritten.
lock table public.subscriptions in share row exclusive mode;
create table public.affiliate_subscription_history (
 user_id uuid not null references auth.users(id) on delete cascade,
 subscription_id text not null, provider text not null, local_status text not null,
 provider_status text not null, plan text not null,
 primary key(user_id,subscription_id,provider,local_status,provider_status,plan)
);
alter table public.affiliate_subscription_history enable row level security;
-- Supabase default privileges can already grant service_role ALL on new tables.
revoke all on public.affiliate_subscription_history from public,anon,authenticated,service_role;
grant select,insert on public.affiliate_subscription_history to service_role;

insert into public.affiliate_subscription_history
select user_id,coalesce(provider_subscription_id,''),coalesce(provider,''),coalesce(status,''),coalesce(provider_status,''),coalesce(plan,'')
from public.subscriptions on conflict do nothing;

create function public.affiliate_capture_subscription_history() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if TG_OP<>'INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(old.user_id::text,43));
  insert into affiliate_subscription_history values(old.user_id,coalesce(old.provider_subscription_id,''),coalesce(old.provider,''),coalesce(old.status,''),coalesce(old.provider_status,''),coalesce(old.plan,'')) on conflict do nothing;
 end if;
 if TG_OP<>'DELETE' then
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,43));
  insert into affiliate_subscription_history values(new.user_id,coalesce(new.provider_subscription_id,''),coalesce(new.provider,''),coalesce(new.status,''),coalesce(new.provider_status,''),coalesce(new.plan,'')) on conflict do nothing;
 end if;
 return null;
end $$;
revoke all on function public.affiliate_capture_subscription_history() from public,anon,authenticated;
create trigger affiliate_preserve_subscription_history after insert or update on public.subscriptions
for each row execute function public.affiliate_capture_subscription_history();

-- Called only by the existing server-side verified subscription synchronizer,
-- including out-of-order webhooks whose entitlement update is correctly ignored.
create function public.affiliate_observe_subscription(p_actor uuid,p_subscription_id text,p_plan text,p_status text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_actor is null or p_subscription_id is null or p_subscription_id!~'^I-[A-Za-z0-9]+$' or p_plan is null or p_plan not in ('monthly','yearly') then
  raise exception 'Invalid verified subscription identity';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,43));
 insert into affiliate_subscription_history values(p_actor,p_subscription_id,'paypal',case when p_status='APPROVAL_PENDING' then 'inactive' else 'unknown' end,coalesce(p_status,''),p_plan) on conflict do nothing;
end $$;
revoke all on function public.affiliate_observe_subscription(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.affiliate_observe_subscription(uuid,text,text,text) to service_role;

-- Service-only inventory, not a browser-supplied eligibility claim. No PII or tokens.
create function public.affiliate_eligibility_history(p_actor uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with history as (
  select subscription_id,provider,local_status,provider_status,plan from affiliate_subscription_history where user_id=p_actor
  union
  select coalesce(provider_subscription_id,''),coalesce(provider,''),coalesce(status,''),coalesce(provider_status,''),coalesce(plan,'') from subscriptions where user_id=p_actor
 ), ids as (
  select subscription_id from history
  union select subscription_id from affiliate_checkouts where user_id=p_actor and subscription_id is not null
 ), snapshot as (
  select jsonb_build_object('user_id',p_actor,
   'history',(select coalesce(jsonb_agg(to_jsonb(h) order by subscription_id,provider,local_status,provider_status,plan),'[]') from history h),
   'ids',(select coalesce(jsonb_agg(subscription_id order by subscription_id),'[]') from ids),
   'blocked',exists(select 1 from affiliate_payments where user_id=p_actor)
    or exists(select 1 from affiliate_referrals where user_id=p_actor and locked_at is not null)
    or exists(select 1 from history where provider<>'paypal' or subscription_id!~'^I-[A-Za-z0-9]+$' or local_status<>'inactive' or provider_status<>'APPROVAL_PENDING')
    or exists(select 1 from affiliate_checkouts where user_id=p_actor and subscription_id is null and (closed_at is not null or created_at<now()-interval '48 hours'))
  ) value
 ) select jsonb_build_object('fingerprint',md5(value::text),'ids',value->'ids','blocked',value->'blocked') from snapshot;
$$;
revoke all on function public.affiliate_eligibility_history(uuid) from public,anon,authenticated;
grant execute on function public.affiliate_eligibility_history(uuid) to service_role;

create function public.affiliate_discount_history_clear(p_actor uuid,p_proof jsonb) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare h jsonb; checked timestamptz;
begin
 h:=affiliate_eligibility_history(p_actor);
 if (h->>'blocked')::boolean then return false; end if;
 if h->'ids'='[]'::jsonb then return true; end if;
 if jsonb_typeof(p_proof)<>'object' or p_proof is null then return false; end if;
 checked:=(p_proof->>'checked_at')::timestamptz;
 return coalesce(p_proof->>'fingerprint'=h->>'fingerprint' and p_proof->'ids'=h->'ids'
   and checked<=clock_timestamp()+interval '5 seconds' and checked>=clock_timestamp()-interval '60 seconds',false);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function public.affiliate_discount_history_clear(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.affiliate_discount_history_clear(uuid,jsonb) to service_role;

-- Replace ONLY the two checkout eligibility guards; assert the reviewed function
-- still has precisely the expected source. No replacement of accounting/admin code.
do $migration$
declare definition text; old_guard text; new_guard text; old_retry text; new_retry text;
begin
 definition:=pg_get_functiondef('public.affiliate_command(uuid,text,jsonb)'::regprocedure);
 old_guard:=$old$and not exists(select 1 from subscriptions s where s.user_id=p_actor and not exists(select 1 from affiliate_checkouts ac where ac.user_id=p_actor and ac.subscription_id=s.provider_subscription_id)); -- unknown legacy history fails closed; our unpaid cancelled intents do not consume eligibility$old$;
 new_guard:=$new$and affiliate_discount_history_clear(p_actor,p_data->'history_proof'); -- verified provider evidence; paid/unknown history always wins$new$;
 old_retry:=$old$if c.period<>p_data->>'period' then raise exception 'Finish or cancel the existing checkout before changing billing period'; end if;$old$;
 new_retry:=old_retry||E'\n   '||$new$if c.discount_bps>0 and not affiliate_discount_history_clear(p_actor,p_data->'history_proof') then raise exception 'Pending discount checkout history requires provider reconciliation'; end if;$new$;
 if (length(definition)-length(replace(definition,old_guard,'')))<>length(old_guard)
  or (length(definition)-length(replace(definition,old_retry,'')))<>length(old_retry) then
  raise exception 'Affiliate eligibility migration: reviewed checkout guards not found exactly once';
 end if;
 execute replace(replace(definition,old_guard,new_guard),old_retry,new_retry);
end $migration$;
commit;
