


-- SYNTHETIC BOOTSTRAP SNAPSHOT — schema only
-- Source: Production project lahzgtcpbshmzsqoqswf, public schema.
-- Exported for release candidate 709feadbeeb6766b42591fec074bdc40bf4089c7.
-- This file contains no table data, auth identities, passwords, tokens, or secrets.
-- It is a reproducibility baseline for an empty Supabase-compatible database;
-- do not apply it to Production or another already-provisioned Weiss Chess database.
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."affiliate_capture_subscription_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."affiliate_capture_subscription_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_checkout_selection"("p_actor" "uuid", "p_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare r affiliate_referrals; a affiliate_accounts; v affiliate_visitors; c affiliate_checkouts;
 history_clear boolean; eligible boolean; why text; chosen text; self_referral boolean; can_create boolean:=true;
begin
 if p_actor is null then raise exception 'Authentication required'; end if;
 if coalesce(p_data->>'period','') not in ('monthly','yearly') then raise exception 'Invalid billing period'; end if;
 select * into r from affiliate_referrals where user_id=p_actor;
 -- Model the same first-party bind which checkout performs, WITHOUT writing.
 if r.locked_at is null and not exists(select 1 from affiliate_payments where user_id=p_actor) then
  select * into v from affiliate_visitors where token_hash=p_data->>'token_hash' and expires_at>now();
  if v.affiliate_id is not null and exists(select 1 from affiliate_accounts aa where aa.id=v.affiliate_id and aa.status='active' and aa.user_id<>p_actor
   and not exists(select 1 from auth.users owner join auth.users buyer on lower(owner.email)=lower(buyer.email) where owner.id=aa.user_id and buyer.id=p_actor)) then
   r.affiliate_id:=v.affiliate_id; r.expires_at:=v.expires_at;
  end if;
 end if;
 select * into a from affiliate_accounts where id=r.affiliate_id;
 self_referral:=coalesce(a.user_id=p_actor or exists(select 1 from auth.users owner join auth.users buyer on lower(owner.email)=lower(buyer.email) where owner.id=a.user_id and buyer.id=p_actor),false);
 history_clear:=affiliate_discount_history_clear(p_actor,p_data->'history_proof');
 why:=case
  when r.affiliate_id is null then 'NO_REFERRAL'
  when r.locked_at is null and (r.expires_at is null or r.expires_at<=now()) then 'EXPIRED_REFERRAL'
  when a.id is null or a.status<>'active' then 'INACTIVE_OR_INVALID_AFFILIATE'
  when self_referral then 'SELF_REFERRAL'
  when exists(select 1 from affiliate_payments where user_id=p_actor) or r.locked_at is not null then 'PAID_OR_CONSUMED'
  when not history_clear then coalesce(nullif(p_data->'history_proof'->>'reason','VERIFIED_UNPAID_PENDING'),'HISTORY_PROOF_REJECTED')
  else 'ELIGIBLE' end;
 eligible:=why='ELIGIBLE';
 chosen:=case when eligible then p_data->>'discount_plan' else p_data->>'normal_plan' end;
 if chosen is null or chosen='' then raise exception 'Required PayPal plan unavailable'; end if;
 select * into c from affiliate_checkouts where user_id=p_actor and closed_at is null;
 if c.id is not null then
  if c.period<>p_data->>'period' then why:='OPEN_CHECKOUT_PERIOD_MISMATCH'; can_create:=false;
  elsif c.plan_id<>chosen or c.discount_bps<>(case when eligible then 1000 else 0 end)
   or c.affiliate_id is distinct from (case when a.status='active' and not self_referral and (r.locked_at is not null or r.expires_at>now()) then a.id else null end) then
   why:='OPEN_CHECKOUT_PLAN_MISMATCH'; can_create:=false;
  end if;
 end if;
 return jsonb_build_object('eligible',eligible,'reason',why,'can_create',can_create,'plan_id',chosen,
  'affiliate_id',case when a.status='active' and not self_referral and (r.locked_at is not null or r.expires_at>now()) then a.id else null end,
  'attribution_present',r.affiliate_id is not null,'affiliate_code',a.code,'affiliate_active',a.status='active',
  'self_referral',self_referral,'expires_at',r.expires_at,'locked',r.locked_at is not null,
  'rate_bps',case when a.status='active' and not self_referral then affiliate_rate(a.tier,a.custom_bps) else 0 end,
  'history_clear',history_clear,'open_plan_id',c.plan_id);
end $$;


ALTER FUNCTION "public"."affiliate_checkout_selection"("p_actor" "uuid", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_command"("p_actor" "uuid", "p_action" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare a affiliate_accounts; v affiliate_visitors; r affiliate_referrals; c affiliate_checkouts; app affiliate_applications; pay affiliate_payouts;
 admin boolean; result jsonb; before_row jsonb; target uuid; amount bigint; reason text; eligible boolean;
begin
 select exists(select 1 from affiliate_admins where user_id=p_actor) into admin;
 -- Only customer attribution/checkout operations need the customer lock. Avoid admin A->B/B->A lock cycles.
 if p_actor is not null and p_action in ('activate','track','bind','checkout','close_checkout') then perform pg_advisory_xact_lock(hashtextextended(p_actor::text,43)); end if;
 if p_action='track' then
  delete from affiliate_visitors where token_hash in (select token_hash from affiliate_visitors where expires_at<now() order by expires_at limit 100);
  select * into a from affiliate_accounts where code=p_data->>'code' and status='active';
  if a.id is null then return jsonb_build_object('valid',false); end if;
  if p_actor=a.user_id then return jsonb_build_object('valid',false); end if;
  insert into affiliate_visitors(token_hash,affiliate_id,destination,clicked_at,expires_at) values(p_data->>'token_hash',a.id,p_data->>'destination',clock_timestamp(),clock_timestamp()+interval '30 days')
  on conflict(token_hash) do update set affiliate_id=excluded.affiliate_id,clicked_at=excluded.clicked_at,expires_at=excluded.expires_at,destination=excluded.destination;
  insert into affiliate_click_daily(affiliate_id,clicks) values(a.id,1) on conflict(affiliate_id,day) do update set clicks=affiliate_click_daily.clicks+1;
  -- Fall through to bind for authenticated visitors.
  if p_actor is null then return jsonb_build_object('valid',true); end if;
 end if;
 if p_actor is null then raise exception 'Authentication required'; end if;
 if p_action in ('track','bind') then
  select * into v from affiliate_visitors where token_hash=p_data->>'token_hash' and expires_at>now();
  if v.affiliate_id is not null and not exists(select 1 from affiliate_payments where user_id=p_actor) then
   select * into a from affiliate_accounts where id=v.affiliate_id and status='active';
   if a.id is not null and a.user_id<>p_actor and not exists(select 1 from auth.users u join auth.users owner on lower(owner.email)=lower(u.email) where u.id=p_actor and owner.id=a.user_id) then
    if not exists(select 1 from affiliate_referrals where user_id=p_actor and locked_at is not null) then
     insert into affiliate_referral_history(user_id,affiliate_id,attributed_at,expires_at) values(p_actor,a.id,v.clicked_at,v.expires_at) on conflict do nothing;
    end if;
    insert into affiliate_referrals(user_id,affiliate_id,expires_at) values(p_actor,a.id,v.expires_at)
    on conflict(user_id) do update set affiliate_id=excluded.affiliate_id,attributed_at=now(),expires_at=excluded.expires_at where affiliate_referrals.locked_at is null;
   end if;
  end if;
  return jsonb_build_object('valid',true);
 end if;
 if p_action='activate' then
  if (p_data->>'terms_version') is distinct from '2026-09-07' or not coalesce((p_data->>'accept_terms')::boolean,false) then raise exception 'Affiliate Terms acceptance required'; end if;
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified account required'; end if;
  insert into affiliate_accounts(user_id,code,display_name,paypal_email,terms_version)
  values(p_actor,p_data->>'code',p_data->>'display_name',nullif(p_data->>'paypal_email',''),'2026-09-07') returning * into a;
  return to_jsonb(a);
 end if;
 select * into a from affiliate_accounts where user_id=p_actor;
 if p_action='profile' then
  update affiliate_accounts set display_name=p_data->>'display_name',paypal_email=nullif(p_data->>'paypal_email',''),profile_links=coalesce(p_data->'links',profile_links) where id=a.id returning * into a;
  return to_jsonb(a);
 elsif p_action='apply' then
  if a.id is null then raise exception 'Activate your affiliate account first'; end if;
  if (p_data->>'tier')::int=3 and jsonb_array_length(coalesce(p_data->'links','[]'))=0 then raise exception 'Creator profile links required'; end if;
  if (p_data->>'tier')::int in (2,4) and (nullif(p_data->>'profile_url','') is null or (p_data->>'title') not in ('NM','FM','IM','GM') or ((p_data->>'tier')::int=4)<>((p_data->>'title')='GM')) then raise exception 'Official title verification required'; end if;
  insert into affiliate_applications(affiliate_id,requested_tier,title,profile_url,links) values(a.id,(p_data->>'tier')::int,p_data->>'title',p_data->>'profile_url',coalesce(p_data->'links','[]'));
  return jsonb_build_object('pending',true);
 elsif p_action='checkout' then
  result:=affiliate_checkout_selection(p_actor,p_data);
  if not (result->>'can_create')::boolean then raise exception '%',result->>'reason'; end if;
  if p_data ? 'expected_plan' and p_data->>'expected_plan' is distinct from result->>'plan_id' then raise exception 'Checkout decision changed; preview again'; end if;
  select * into c from affiliate_checkouts where user_id=p_actor and closed_at is null;
  if c.id is not null then return to_jsonb(c); end if;
  insert into affiliate_checkouts(user_id,plan_id,period,affiliate_id,discount_bps)
  values(p_actor,result->>'plan_id',p_data->>'period',(result->>'affiliate_id')::uuid,case when (result->>'eligible')::boolean then 1000 else 0 end) returning * into c;
  return to_jsonb(c);
 end if;
 -- Internal server-only operation after PayPal confirms an unpaid cancelled/expired subscription.
 if p_action='close_checkout' then
  update affiliate_checkouts set closed_at=now() where id=(p_data->>'id')::uuid and user_id=p_actor;
  return jsonb_build_object('closed',true);
 end if;
 if p_action='payout_items' then
  if not admin then raise exception 'Affiliate administrator required'; end if;
  return jsonb_build_object('total',(select count(*) from affiliate_payout_items where payout_id=(p_data->>'id')::uuid),
    'items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from affiliate_payout_items where payout_id=(p_data->>'id')::uuid order by commission_id limit 100 offset greatest(coalesce((p_data->>'offset')::int,0),0))x));
 end if;
 if p_action='dashboard' then target:=a.id;
 elsif admin and p_action='detail' then target:=(p_data->>'id')::uuid;
 elsif admin and p_action='list' then
  return jsonb_build_object('admin',true,'accounts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
   select aa.*,affiliate_rate(aa.tier,aa.custom_bps) effective_bps,
    (select coalesce(sum(eligible_minor),0) from affiliate_commissions where affiliate_id=aa.id) revenue_minor,
    (select coalesce(sum(amount_minor-reversed_minor),0) from affiliate_commissions where affiliate_id=aa.id and (status='available' or (status='pending' and hold_until<=now())) and payout_id is null) available_minor,
    (select max(status) from affiliate_payouts where affiliate_id=aa.id and status='prepared') payout_status
   from affiliate_accounts aa
   where (coalesce(p_data->>'search','')='' or aa.code ilike '%'||(p_data->>'search')||'%' or aa.display_name ilike '%'||(p_data->>'search')||'%' or aa.user_id::text=p_data->>'search')
   and (coalesce(p_data->>'status','')='' or aa.status=p_data->>'status')
   and (coalesce(p_data->>'tier','')='' or aa.tier=(p_data->>'tier')::int)
   and (coalesce(p_data->>'title','')='' or aa.chess_title=p_data->>'title')
   order by created_at desc limit 100 offset least(greatest(coalesce((p_data->>'offset')::int,0),0),100000)
  ) x));
 elsif p_action not in ('dashboard','detail') then
  if not admin then raise exception 'Affiliate administrator required'; end if;
  reason:=trim(p_data->>'reason'); if coalesce(length(reason),0)=0 then raise exception 'Audit reason required'; end if;
  target:=(p_data->>'id')::uuid;
  if p_action in ('manage','review') then
   if p_action='review' then
    select * into app from affiliate_applications where id=target and status='pending' for update;
    if app.id is null then raise exception 'Pending application not found'; end if;
    target:=app.affiliate_id;
    update affiliate_applications set status=case when (p_data->>'approve')::boolean then 'approved' else 'rejected' end,reviewed_at=now(),reviewer=p_actor,reason=p_data->>'reason' where id=app.id;
   end if;
   select * into a from affiliate_accounts where id=target for update; before_row:=to_jsonb(a);
   if a.id is null then raise exception 'Affiliate not found'; end if;
   if p_action='manage' then
    update affiliate_accounts set tier=coalesce((p_data->>'tier')::int,tier),custom_bps=case when p_data ? 'custom_bps' then (p_data->>'custom_bps')::int else custom_bps end,
    status=coalesce(p_data->>'status',status),code=coalesce(p_data->>'code',code),suspended_at=case when p_data->>'status'='suspended' then now() when p_data->>'status'='active' then null else suspended_at end where id=target;
   elsif (p_data->>'approve')::boolean then
    update affiliate_accounts set tier=app.requested_tier,chess_title=app.title where id=target;
   end if;
   select to_jsonb(aa) into result from affiliate_accounts aa where id=target;
  elsif p_action='reassign' then
   perform pg_advisory_xact_lock(hashtextextended(p_data->>'user_id',43));
   select to_jsonb(rr) into before_row from affiliate_referrals rr where user_id=(p_data->>'user_id')::uuid;
   if exists(select 1 from affiliate_accounts aa join auth.users owner on owner.id=aa.user_id join auth.users buyer on buyer.id=(p_data->>'user_id')::uuid where aa.id=target and (aa.user_id=buyer.id or lower(owner.email)=lower(buyer.email))) then raise exception 'Self referral prohibited'; end if;
   insert into affiliate_referrals(user_id,affiliate_id,expires_at,locked_at) values((p_data->>'user_id')::uuid,target,now()+interval '30 days',now())
   on conflict(user_id) do update set affiliate_id=excluded.affiliate_id,locked_at=now(); result:=p_data;
  elsif p_action='adjust' then
   amount:=(p_data->>'amount_minor')::bigint; if amount=0 or abs(amount)>100000000 then raise exception 'Nonzero adjustment within safety limit required'; end if;
   insert into affiliate_commissions(affiliate_id,currency,eligible_minor,rate_bps,amount_minor,hold_until,adjustment_reason) values(target,'USD',0,0,amount,now()+interval '30 days',reason) returning to_jsonb(affiliate_commissions.*) into result;
  elsif p_action='prepare_payout' then
   perform pg_advisory_xact_lock(hashtextextended(target::text,55));
   select * into a from affiliate_accounts where id=target and status='active';
   if a.id is null or a.paypal_email is null then raise exception 'Active affiliate with PayPal email required'; end if;
   update affiliate_commissions set status='available',available_at=now() where affiliate_id=target and status='pending' and hold_until<=now();
   select coalesce(sum(amount_minor-reversed_minor),0) into amount from affiliate_commissions where affiliate_id=target and status='available' and payout_id is null;
   if amount<5000 then raise exception 'Available balance below $50'; end if;
   insert into affiliate_payouts(batch_month,affiliate_id,currency,amount_minor,paypal_email,created_by) values(date_trunc('month',now())::date,target,'USD',amount,a.paypal_email,p_actor) returning * into pay;
   insert into affiliate_payout_items select pay.id,id,amount_minor-reversed_minor from affiliate_commissions where affiliate_id=target and status='available' and payout_id is null;
   update affiliate_commissions set payout_id=pay.id where id in(select commission_id from affiliate_payout_items where payout_id=pay.id); result:=to_jsonb(pay);
  elsif p_action in ('pay','cancel_payout') then
   select affiliate_id into target from affiliate_payouts where id=(p_data->>'id')::uuid;
   perform pg_advisory_xact_lock(hashtextextended(target::text,55));
   select * into pay from affiliate_payouts where id=(p_data->>'id')::uuid for update;
   if pay.id is null or pay.status<>'prepared' then raise exception 'Payout is not prepared'; end if;
   before_row:=to_jsonb(pay);
   if p_action='pay' then
    if length(trim(coalesce(p_data->>'reference','')))<3 then raise exception 'Actual PayPal transaction reference required'; end if;
    update affiliate_payouts set status='paid',paid_at=now(),reference=p_data->>'reference' where id=pay.id;
    update affiliate_commissions set status='paid' where payout_id=pay.id;
   else
    update affiliate_payouts set status='cancelled' where id=pay.id;
    update affiliate_commissions set payout_id=null where payout_id=pay.id;
   end if;
   select to_jsonb(pp) into result from affiliate_payouts pp where id=pay.id;
  else raise exception 'Unknown affiliate command'; end if;
  insert into affiliate_admin_audit(actor,action,subject_id,reason,before_value,after_value) values(p_actor,p_action,coalesce(target::text,''),reason,before_row,result);
  return result;
 end if;
 if p_action in ('dashboard','detail') then
  if p_action='detail' and not admin then raise exception 'Affiliate administrator required'; end if;
  -- Lazy, monotonic clearing; monthly payout creation also clears due entries.
  perform pg_advisory_xact_lock(hashtextextended(target::text,55));
  update affiliate_commissions set status='available',available_at=now() where affiliate_id=target and status='pending' and hold_until<=now();
  return jsonb_build_object('admin',admin,'account',(select to_jsonb(aa)||jsonb_build_object('effective_bps',affiliate_rate(aa.tier,aa.custom_bps)) from affiliate_accounts aa where id=target),
   'clicks',(select coalesce(sum(clicks),0) from affiliate_click_daily where affiliate_id=target),
   'signups',(select count(*) from affiliate_referrals where affiliate_id=target),
   'conversions',(select count(*) from affiliate_referrals where affiliate_id=target and locked_at is not null),
   'balances',(select jsonb_build_object('pending',coalesce(sum(amount_minor-reversed_minor) filter(where status='pending'),0),'available',coalesce(sum(amount_minor-reversed_minor) filter(where status='available' and payout_id is null),0),'reserved',coalesce(sum(amount_minor-reversed_minor) filter(where status='available' and payout_id is not null),0),'paid',coalesce(sum(amount_minor) filter(where status='paid'),0),'revenue',coalesce(sum(eligible_minor),0)) from affiliate_commissions where affiliate_id=target),
   'commissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,created_at,currency,eligible_minor,rate_bps,amount_minor,reversed_minor,status,hold_until,payout_id,case when admin then adjustment_reason else null end as adjustment_reason from affiliate_commissions where affiliate_id=target order by created_at desc,id limit 50 offset greatest(coalesce((p_data->>'offset')::int,0),0)) x),
   'applications',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,requested_tier,title,profile_url,links,status,created_at,reviewed_at,ap.reason from affiliate_applications ap where affiliate_id=target order by created_at desc limit 50) x),
   'payouts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,batch_month,currency,amount_minor,paypal_email,status,reference,created_at,paid_at from affiliate_payouts where affiliate_id=target order by created_at desc limit 50) x),
   'referrals',case when admin then (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from affiliate_referrals where affiliate_id=target order by attributed_at desc limit 100)x) else '[]'::jsonb end,
   'audit',case when admin then (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from affiliate_admin_audit where subject_id=target::text order by created_at desc limit 100)x) else '[]'::jsonb end);
 end if;
 raise exception 'Unknown affiliate command';
end $_$;


ALTER FUNCTION "public"."affiliate_command"("p_actor" "uuid", "p_action" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_discount_history_clear"("p_actor" "uuid", "p_proof" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."affiliate_discount_history_clear"("p_actor" "uuid", "p_proof" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_eligibility_history"("p_actor" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."affiliate_eligibility_history"("p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_observe_subscription"("p_actor" "uuid", "p_subscription_id" "text", "p_plan" "text", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
begin
 if p_actor is null or p_subscription_id is null or p_subscription_id!~'^I-[A-Za-z0-9]+$' or p_plan is null or p_plan not in ('monthly','yearly') then
  raise exception 'Invalid verified subscription identity';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,43));
 insert into affiliate_subscription_history values(p_actor,p_subscription_id,'paypal',case when p_status='APPROVAL_PENDING' then 'inactive' else 'unknown' end,coalesce(p_status,''),p_plan) on conflict do nothing;
end $_$;


ALTER FUNCTION "public"."affiliate_observe_subscription"("p_actor" "uuid", "p_subscription_id" "text", "p_plan" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_rate"("tier" integer, "custom_bps" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 select coalesce(custom_bps,case tier when 1 then 1500 when 2 then 2000 when 3 then 3000 when 4 then 2500 when 5 then 3500 end)
$$;


ALTER FUNCTION "public"."affiliate_rate"("tier" integer, "custom_bps" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_record_payment"("p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare a affiliate_accounts; r affiliate_referrals; c affiliate_commissions; existing affiliate_payments; rev bigint; new_reversed bigint; rate int; eligible bigint; refunded_eligible bigint; payout uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p->>'user_id',43));
 if p->>'kind'='payment' then
  select * into existing from affiliate_payments where payment_id=p->>'payment_id';
  if existing.payment_id is not null then
   if existing.user_id is distinct from (p->>'user_id')::uuid or existing.subscription_id is distinct from p->>'subscription_id' or existing.gross_minor is distinct from (p->>'gross_minor')::bigint or existing.tax_minor is distinct from (p->>'tax_minor')::bigint or existing.currency is distinct from p->>'currency' or existing.occurred_at is distinct from (p->>'occurred_at')::timestamptz then raise exception 'Payment identity mismatch'; end if;
   return jsonb_build_object('duplicate',true);
  end if;
  -- Lock attribution only at the first successful collection, never on approval.
  select * into r from affiliate_referrals where user_id=(p->>'user_id')::uuid and locked_at is not null;
  if r.locked_at is null then
   select (p->>'user_id')::uuid,affiliate_id,attributed_at,expires_at,null::timestamptz into r from affiliate_referral_history
   where user_id=(p->>'user_id')::uuid and attributed_at<=(p->>'occurred_at')::timestamptz and expires_at>(p->>'occurred_at')::timestamptz order by attributed_at desc,id desc limit 1;
  end if;
  if exists(select 1 from affiliate_payments where user_id=(p->>'user_id')::uuid) and r.locked_at is null then r:=null; end if;
  insert into affiliate_payments(payment_id,event_id,user_id,subscription_id,currency,gross_minor,tax_minor,occurred_at) values(p->>'payment_id',p->>'event_id',(p->>'user_id')::uuid,p->>'subscription_id',p->>'currency',(p->>'gross_minor')::bigint,(p->>'tax_minor')::bigint,(p->>'occurred_at')::timestamptz);
  update affiliate_checkouts set closed_at=now() where user_id=(p->>'user_id')::uuid and subscription_id=p->>'subscription_id';
  select * into a from affiliate_accounts where id=r.affiliate_id;
  if a.id is not null and a.user_id<>(p->>'user_id')::uuid and not exists(select 1 from auth.users u join auth.users owner on lower(owner.email)=lower(u.email) where u.id=(p->>'user_id')::uuid and owner.id=a.user_id) then
   update affiliate_referrals set affiliate_id=a.id,locked_at=coalesce(locked_at,(p->>'occurred_at')::timestamptz) where user_id=(p->>'user_id')::uuid;
   if a.status='active' then
    perform pg_advisory_xact_lock(hashtextextended(a.id::text,55));
    rate:=affiliate_rate(a.tier,a.custom_bps); eligible:=(p->>'gross_minor')::bigint-(p->>'tax_minor')::bigint;
    insert into affiliate_commissions(affiliate_id,payment_id,currency,eligible_minor,rate_bps,amount_minor,hold_until) values(a.id,p->>'payment_id',p->>'currency',eligible,rate,(eligible*rate+5000)/10000,(p->>'occurred_at')::timestamptz+interval '30 days');
   end if;
  end if;
 elsif p->>'kind'='reversal' then
  select * into existing from affiliate_payments where payment_id=p->>'payment_id' for update;
  if existing.payment_id is null then raise exception 'Original payment must be reconciled before reversal'; end if;
  if existing.currency<>p->>'currency' or existing.user_id<>(p->>'user_id')::uuid then raise exception 'Reversal identity mismatch'; end if;
  if exists(select 1 from affiliate_reversals where (event_id=p->>'event_id' or reversal_id=p->>'reversal_id') and payment_id<>existing.payment_id) then raise exception 'Reversal identity mismatch'; end if;
  if exists(select 1 from affiliate_reversals where event_id=p->>'event_id' or reversal_id=p->>'reversal_id') then return jsonb_build_object('duplicate',true); end if;
  if coalesce((p->>'gross_minor')::bigint,0)<=0 then raise exception 'Positive reversal amount required'; end if;
  rev:=least((p->>'gross_minor')::bigint,existing.gross_minor-existing.refunded_gross_minor);
  if rev<=0 then return jsonb_build_object('already_reversed',true); end if;
  eligible:=existing.gross_minor-existing.tax_minor;
  if p ? 'refund_tax_minor' then
   if (p->>'gross_minor')::bigint<>rev or (p->>'refund_tax_minor')::bigint not between 0 and rev
    or (p->>'refund_tax_minor')::bigint>existing.tax_minor-(existing.refunded_gross_minor-existing.refunded_eligible_minor)
    or rev-(p->>'refund_tax_minor')::bigint>eligible-existing.refunded_eligible_minor then raise exception 'Invalid authoritative refund tax'; end if;
   refunded_eligible:=existing.refunded_eligible_minor+rev-(p->>'refund_tax_minor')::bigint;
   if existing.refunded_gross_minor+rev=existing.gross_minor and refunded_eligible<>eligible then raise exception 'Full refund tax must reconcile original payment'; end if;
  elsif existing.refunded_gross_minor+rev=existing.gross_minor then refunded_eligible:=eligible;
  else
   -- Bound proportional reversal to remaining net/tax after any prior explicit tax-only refund.
   refunded_eligible:=least(eligible,greatest(existing.refunded_gross_minor+rev-existing.tax_minor,
    existing.refunded_eligible_minor+(rev*eligible+existing.gross_minor/2)/existing.gross_minor));
  end if;
  select * into c from affiliate_commissions where payment_id=existing.payment_id;
  if c.id is not null then
   perform pg_advisory_xact_lock(hashtextextended(c.affiliate_id::text,55));
   select * into c from affiliate_commissions where id=c.id for update;
   new_reversed:=case when eligible=0 then 0 else (c.amount_minor*refunded_eligible+eligible/2)/eligible end;
   if c.payout_id is not null and c.status<>'paid' then
    payout:=c.payout_id;
    update affiliate_payouts set status='cancelled' where id=payout and status='prepared';
    update affiliate_commissions set payout_id=null where payout_id=payout;
   end if;
   if c.status='paid' then
    insert into affiliate_commissions(affiliate_id,currency,eligible_minor,rate_bps,amount_minor,status,hold_until,available_at,adjustment_reason)
    values(c.affiliate_id,c.currency,0,0,-(new_reversed-c.reversed_minor),'available',now(),now(),'Paid commission reversal: '||(p->>'reversal_id'));
   end if;
   update affiliate_commissions set reversed_minor=new_reversed,status=case when status='paid' then 'paid' when new_reversed>=amount_minor then 'reversed' else status end where id=c.id;
  end if;
  update affiliate_payments set refunded_gross_minor=refunded_gross_minor+rev,refunded_eligible_minor=refunded_eligible where payment_id=existing.payment_id;
  insert into affiliate_reversals(event_id,reversal_id,payment_id,gross_minor,commission_minor,reason) values(p->>'event_id',p->>'reversal_id',existing.payment_id,rev,coalesce(new_reversed-c.reversed_minor,0),p->>'reason');
 else raise exception 'Unknown money operation'; end if;
 return jsonb_build_object('processed',true);
end $$;


ALTER FUNCTION "public"."affiliate_record_payment"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_reject_evidence_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin raise exception 'Affiliate evidence is append-only'; end $$;


ALTER FUNCTION "public"."affiliate_reject_evidence_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."browse_master_games"("p_page_num" integer, "p_page_size" integer) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_total bigint;
begin
  select count(*)::bigint
  into v_total
  from master_games;

  return query
  select
    mg.id,
    mg.slug,
    mg.title,
    mg.white,
    mg.black,
    mg.result,
    mg.event,
    mg.site,
    mg.year,
    mg.opening,
    mg.eco,
    mg.description,
    v_total
  from master_games as mg
  order by mg.year desc nulls last, mg.id desc
  offset (p_page_num - 1) * p_page_size
  limit p_page_size;
end;
$$;


ALTER FUNCTION "public"."browse_master_games"("p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chess_voice_quota"("p_user_id" "uuid", "p_reserve" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."chess_voice_quota"("p_user_id" "uuid", "p_reserve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_auto_training_chunk"("p_course" "text", "p_trainer_key" "text", "p_unit_key" "text", "p_item_ids" "text"[] DEFAULT '{}'::"text"[]) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
 select private.claim_auto_training_chunk(p_course,p_trainer_key,p_unit_key,p_item_ids);
$$;


ALTER FUNCTION "public"."claim_auto_training_chunk"("p_course" "text", "p_trainer_key" "text", "p_unit_key" "text", "p_item_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_pending_access_grant_for_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_grant public.pending_access_grants%rowtype;
  v_subscription_rows integer := 0;
begin
  -- Do not grant access until the email address is confirmed.
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;

  select *
  into v_grant
  from public.pending_access_grants
  where lower(btrim(email)) = lower(btrim(new.email))
    and claimed_at is null
    and (
      claim_expires_at is null
      or claim_expires_at > now()
    )
    and (
      access_ends_at is null
      or access_ends_at > now()
    )
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return new;
  end if;

  insert into public.subscriptions (
    user_id,
    provider,
    provider_customer_id,
    provider_subscription_id,
    plan,
    status,
    current_period_end,
    cancel_at_period_end
  )
  values (
    new.id,
    'manual',
    null,
    null,
    v_grant.plan,
    'active',
    v_grant.access_ends_at,
    false
  )
  on conflict (user_id)
  do update set
    provider = 'manual',
    provider_customer_id = null,
    provider_subscription_id = null,
    plan = excluded.plan,
    status = 'active',
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = false
  where
    public.subscriptions.provider = 'manual'
    or public.subscriptions.status not in ('active', 'trialing')
    or (
      public.subscriptions.current_period_end is not null
      and public.subscriptions.current_period_end <= now()
    );

  get diagnostics v_subscription_rows = row_count;

  -- Never replace a currently active paid subscription.
  if v_subscription_rows = 0 then
    return new;
  end if;

  update public.pending_access_grants
  set
    claimed_at = now(),
    claimed_by = new.id
  where id = v_grant.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."claim_pending_access_grant_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_premium_invite"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  invited_plan text;
begin
  if new.email is null then
    return new;
  end if;

  select plan
  into invited_plan
  from public.premium_invites
  where email = lower(trim(new.email));

  if invited_plan is null then
    return new;
  end if;

  insert into public.subscriptions (
    user_id,
    provider,
    plan,
    status,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  values (
    new.id,
    'manual',
    invited_plan,
    'active',
    null,
    false,
    now(),
    now()
  )
  on conflict (user_id)
  do update set
    provider = 'manual',
    plan = excluded.plan,
    status = 'active',
    current_period_end = null,
    cancel_at_period_end = false,
    updated_at = now();

  update public.premium_invites
  set
    claimed_at = now(),
    claimed_by = new.id
  where email = lower(trim(new.email));

  return new;
end;
$$;


ALTER FUNCTION "public"."claim_premium_invite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare n integer;
begin
 update public.chess_voice_usage set status='succeeded',completed_at=now()
 where id=p_reservation_id and user_id=p_user_id and status='reserved' and created_at>now()-interval '2 minutes';
 get diagnostics n=row_count; return n=1;
end $$;


ALTER FUNCTION "public"."complete_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_estimated_cost_usd" numeric) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."complete_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_estimated_cost_usd" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."complete_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_due_counts"("p_user_id" "uuid") RETURNS TABLE("overdue_count" bigint, "due_today_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
select
  count(*) filter (
    where next_review_at is not null
      and next_review_at <= now()
  ) as overdue_count,

  count(*) filter (
    where next_review_at is not null
      and next_review_at > now()
      and next_review_at < date_trunc('day', now()) + interval '1 day'
  ) as due_today_count

from public.training_progress
where user_id = p_user_id;
$$;


ALTER FUNCTION "public"."get_due_counts"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_due_openings_in_family"("p_user_id" "uuid", "p_family_slug" "text") RETURNS TABLE("slug" "text")
    LANGUAGE "sql"
    AS $$
select ol.slug
from opening_lines ol
join training_progress tp
  on tp.item_id = ol.slug
where tp.user_id = p_user_id
  and tp.course = 'openings'
  and tp.theme = 'family:' || p_family_slug
  and tp.next_review_at <= now()
order by tp.next_review_at asc
limit 1;
$$;


ALTER FUNCTION "public"."get_due_openings_in_family"("p_user_id" "uuid", "p_family_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_auto_opening"("p_user_id" "uuid") RETURNS TABLE("slug" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  preferred text[];
begin

  -- get preferred openings
  select ap.preferred_openings into preferred
  from auto_profiles ap
  where ap.user_id = p_user_id;

  -- 1. PRIORITY: preferred openings not yet mastered
  if preferred is not null then
    return query
    select ol.slug
    from opening_lines ol
    where ol.slug = any(preferred)
      and not exists (
        select 1 from training_progress tp
        where tp.user_id = p_user_id
          and tp.theme = 'opening:' || ol.slug
          and tp.mastery >= 5
      )
    limit 1;

    if found then return; end if;
  end if;

  -- 2. DUE
  return query
  select ol.slug
  from training_progress tp
  join opening_lines ol
    on tp.theme = 'opening:' || ol.slug
  where tp.user_id = p_user_id
    and tp.course = 'openings'
    and tp.next_review_at <= now()
  limit 1;

  if found then return; end if;

  -- 3. ACTIVE
  return query
  select ol.slug
  from training_progress tp
  join opening_lines ol
    on tp.theme = 'opening:' || ol.slug
  where tp.user_id = p_user_id
    and tp.course = 'openings'
    and tp.mastery < 5
  limit 1;

  if found then return; end if;

  -- 4. NEW fallback
  return query
  select ol.slug
  from opening_lines ol
  where not exists (
    select 1 from training_progress tp
    where tp.user_id = p_user_id
      and tp.theme = 'opening:' || ol.slug
  )
  limit 1;

end;
$$;


ALTER FUNCTION "public"."get_next_auto_opening"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_due_chunk"("p_user_id" "uuid", "p_trainer_key" "text") RETURNS TABLE("chunk_index" integer, "mastered_puzzles_count" integer, "is_mastered" boolean, "review_stage" integer, "next_review_at" timestamp with time zone)
    LANGUAGE "sql"
    AS $$
  select
    ucp.chunk_index,
    ucp.mastered_puzzles_count,
    ucp.is_mastered,
    ucp.review_stage,
    ucp.next_review_at
  from public.user_chunk_progress ucp
  where ucp.user_id = p_user_id
    and ucp.trainer_key = p_trainer_key
    and (
      ucp.is_mastered = false
      or ucp.next_review_at is null
      or ucp.next_review_at <= now()
    )
  order by
    case
      when ucp.is_mastered = false then 0
      else 1
    end,
    ucp.chunk_index asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_next_due_chunk"("p_user_id" "uuid", "p_trainer_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_due_item"("p_user_id" "uuid") RETURNS TABLE("course" "text", "theme" "text", "item_id" "text", "due_at" timestamp without time zone)
    LANGUAGE "sql"
    AS $$
  select course, theme, item_id, due_at
  from training_progress
  where user_id = p_user_id
  and due_at <= now()
  order by due_at asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_next_due_item"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_opening_in_family"("p_family_slug" "text", "p_current_slug" "text") RETURNS TABLE("slug" "text")
    LANGUAGE "sql"
    AS $$
  select ol.slug
  from opening_lines ol
  where ol.family_slug = p_family_slug
    and ol.slug <> p_current_slug
    and ol.slug > p_current_slug
  order by ol.eco asc, ol.name asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_next_opening_in_family"("p_family_slug" "text", "p_current_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_unmastered_opening_in_family"("p_user_id" "uuid", "p_family_slug" "text", "p_current_slug" "text") RETURNS TABLE("slug" "text")
    LANGUAGE "sql"
    AS $$
  select ol.slug
  from opening_lines ol
  left join training_progress tp
    on tp.user_id = p_user_id
   and tp.course = 'openings'
   and tp.theme = ol.id::text
   and tp.item_id like '%full'
   and coalesce(tp.mastery, 0) >= 5
  where ol.family_slug = p_family_slug
    and ol.slug <> p_current_slug
    and tp.id is null
  order by ol.eco asc, ol.name asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_next_unmastered_opening_in_family"("p_user_id" "uuid", "p_family_slug" "text", "p_current_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_opening_families"() RETURNS TABLE("family" "text", "family_slug" "text", "count" bigint)
    LANGUAGE "sql"
    AS $$
  select
    family,
    family_slug,
    count(*) as count
  from opening_lines
  where family is not null
  group by family, family_slug
  order by count desc;
$$;


ALTER FUNCTION "public"."get_opening_families"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_training_item_usage_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_day_start timestamptz;
  v_used integer := 0;
  v_limit integer := 10;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'code', 'AUTH_REQUIRED'
    );
  end if;

  if public.training_subscription_is_premium(v_user_id, v_now) then
    return jsonb_build_object(
      'allowed', true,
      'tier', 'premium',
      'limit', null,
      'used', 0,
      'remaining', null,
      'reset_at', null
    );
  end if;

  v_day_start :=
    date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';

  select count(*)::integer
  into v_used
  from public.training_item_usage
  where user_id = v_user_id
    and created_at >= v_day_start;

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'tier', 'free',
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'reset_at', v_day_start + interval '1 day'
  );
end;
$$;


ALTER FUNCTION "public"."get_training_item_usage_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_general_query_candidate_ids"("p_query_first_token" "text") RETURNS TABLE("id" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  with token as (
    select nullif(public.master_game_search_normalize(p_query_first_token), '') as value
  ),
  player_candidates as materialized (
    select c.normalized_name
    from token t
    cross join lateral public.master_game_player_candidates(t.value) c
    where t.value is not null
  ),
  strict_opening_candidates as materialized (
    select c.eco_code
    from public.master_game_opening_search_catalog c
    cross join token t
    where t.value is not null
      and public.master_game_text_match_score(c.search_text, t.value) > 0
  ),
  trigram_opening_candidates as materialized (
    select c.eco_code
    from public.master_game_opening_search_catalog c
    cross join token t
    where t.value is not null
      and c.search_text operator(public.%) t.value
  ),
  candidate_ids as (
    select mg.id
    from public.master_games mg
    cross join token t
    where t.value is not null
      and lower(coalesce(mg.search_text, '')) like '%' || t.value || '%'

    union

    select mg.id
    from public.master_games mg
    cross join token t
    where t.value is not null
      and mg.white_norm operator(public.%) t.value

    union

    select mg.id
    from public.master_games mg
    cross join token t
    where t.value is not null
      and mg.black_norm operator(public.%) t.value

    union

    select mg.id
    from public.master_games mg
    cross join token t
    where t.value is not null
      and lower(coalesce(mg.event, '')) operator(public.%) t.value

    union

    select mg.id
    from public.master_games mg
    cross join token t
    where t.value is not null
      and lower(coalesce(mg.site, '')) operator(public.%) t.value

    union

    select mg.id
    from public.master_games mg
    join player_candidates c on c.normalized_name = mg.white_norm

    union

    select mg.id
    from public.master_games mg
    join player_candidates c on c.normalized_name = mg.black_norm

    union

    select mg.id
    from strict_opening_candidates c
    join public.master_games mg on lower(mg.eco) = lower(c.eco_code)

    union

    select mg.id
    from trigram_opening_candidates c
    join public.master_games mg on lower(mg.eco) = lower(c.eco_code)
  )
  select c.id
  from candidate_ids c;
$$;


ALTER FUNCTION "public"."master_game_general_query_candidate_ids"("p_query_first_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_player_candidates"("p_query" "text") RETURNS TABLE("normalized_name" "text", "score" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."master_game_player_candidates"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_player_match_score"("p_player_name" "text", "p_query" "text") RETURNS integer
    LANGUAGE "sql" STABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."master_game_player_match_score"("p_player_name" "text", "p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_player_suggestions"("p_query" "text", "p_limit" integer DEFAULT 8) RETURNS TABLE("name" "text")
    LANGUAGE "sql" STABLE
    AS $$
with params as (
  select
    lower(trim(coalesce(p_query, ''))) as q,
    least(greatest(coalesce(p_limit, 8), 1), 20) as lim
),
player_pool as (
  select distinct mg.white as name, mg.white_norm as norm
  from master_games mg
  cross join params p
  where p.q <> ''
    and mg.white is not null
    and mg.white_norm is not null
    and (
      mg.white_norm like p.q || '%'
      or mg.white_norm like '%' || p.q || '%'
    )

  union

  select distinct mg.black as name, mg.black_norm as norm
  from master_games mg
  cross join params p
  where p.q <> ''
    and mg.black is not null
    and mg.black_norm is not null
    and (
      mg.black_norm like p.q || '%'
      or mg.black_norm like '%' || p.q || '%'
    )
),
ranked as (
  select
    pp.name,
    row_number() over (
      partition by lower(pp.name)
      order by
        case
          when lower(pp.name) = (select q from params) then 0
          when lower(pp.name) like (select q from params) || '%' then 1
          else 2
        end,
        length(pp.name),
        pp.name
    ) as rn
  from player_pool pp
)
select r.name
from ranked r
where r.rn = 1
order by
  case
    when lower(r.name) = (select q from params) then 0
    when lower(r.name) like (select q from params) || '%' then 1
    else 2
  end,
  length(r.name),
  r.name
limit (select lim from params);
$$;


ALTER FUNCTION "public"."master_game_player_suggestions"("p_query" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_player_suggestions_flexible"("p_query" "text", "p_limit" integer DEFAULT 8) RETURNS TABLE("name" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  with params as (
    select
      public.master_game_search_normalize(p_query) as query,
      least(greatest(coalesce(p_limit, 8), 1), 20) as result_limit
  ),
  ranked as (
    select
      c.canonical_name as name,
      candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.query) candidates
    join public.master_game_player_search_catalog c
      on c.normalized_name = candidates.normalized_name
  )
  select r.name
  from ranked r
  where r.score > 0
  order by r.score desc, length(r.name), r.name
  limit (select result_limit from params);
$$;


ALTER FUNCTION "public"."master_game_player_suggestions_flexible"("p_query" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_search_normalize"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" STABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  select trim(
    regexp_replace(
      lower(extensions.unaccent(coalesce(p_value, ''))),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$$;


ALTER FUNCTION "public"."master_game_search_normalize"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_game_text_match_score"("p_haystack" "text", "p_query" "text") RETURNS integer
    LANGUAGE "sql" STABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."master_game_text_match_score"("p_haystack" "text", "p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_user_master_game"("p_current_game_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("id" bigint, "slug" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."next_user_master_game"("p_current_game_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."next_user_master_game"("p_current_game_id" bigint) IS 'Returns the first or next saved Master Game in deterministic newest-first order for the authenticated user.';



CREATE OR REPLACE FUNCTION "public"."next_user_opening"("p_current_opening_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "slug" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."next_user_opening"("p_current_opening_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."next_user_opening"("p_current_opening_id" "uuid") IS 'Returns the first or next saved opening line in deterministic newest-first order for the authenticated user.';



CREATE OR REPLACE FUNCTION "public"."release_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare n integer;
begin
 update public.chess_voice_usage set status='released',completed_at=now()
 where id=p_reservation_id and user_id=p_user_id and status='reserved';
 get diagnostics n=row_count; return n=1;
end $$;


ALTER FUNCTION "public"."release_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."release_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."release_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_coach_explanation_usage"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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


ALTER FUNCTION "public"."reserve_coach_explanation_usage"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_image_to_position_usage"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
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


ALTER FUNCTION "public"."reserve_image_to_position_usage"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_training_item_usage"("p_kind" "text", "p_item_key" "text", "p_event_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_day_start timestamptz;
  v_used integer := 0;
  v_limit integer := 10;
  v_existing boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'allowed', false,
      'code', 'AUTH_REQUIRED'
    );
  end if;

  if p_kind is null or p_kind not in (
    'puzzle', 'endgame', 'board_vision', 'opening', 'master_game'
  ) then
    raise exception 'Invalid training item kind';
  end if;

  if p_event_id is null then
    raise exception 'Training event ID is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  if public.training_subscription_is_premium(v_user_id, v_now) then
    return jsonb_build_object(
      'allowed', true,
      'tier', 'premium',
      'limit', null,
      'used', 0,
      'remaining', null,
      'reset_at', null
    );
  end if;

  v_day_start :=
    date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';

  select exists (
    select 1
    from public.training_item_usage
    where user_id = v_user_id
      and event_id = p_event_id
  )
  into v_existing;

  select count(*)::integer
  into v_used
  from public.training_item_usage
  where user_id = v_user_id
    and created_at >= v_day_start;

  if not v_existing then
    if v_used >= v_limit then
      return jsonb_build_object(
        'allowed', false,
        'code', 'TRAINING_QUOTA_EXCEEDED',
        'tier', 'free',
        'limit', v_limit,
        'used', v_used,
        'remaining', 0,
        'reset_at', v_day_start + interval '1 day'
      );
    end if;

    insert into public.training_item_usage (
      user_id,
      event_id,
      kind,
      item_key
    ) values (
      v_user_id,
      p_event_id,
      p_kind,
      left(coalesce(nullif(trim(p_item_key), ''), 'unknown'), 500)
    );

    v_used := v_used + 1;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'tier', 'free',
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'reset_at', v_day_start + interval '1 day'
  );
end;
$$;


ALTER FUNCTION "public"."reserve_training_item_usage"("p_kind" "text", "p_item_key" "text", "p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games"("q" "text", "page_num" integer, "page_size" integer) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  select *
  from search_master_games(
    p_q := q,
    p_player := '',
    p_opening := '',
    p_event := '',
    p_result := '',
    p_color := 'all',
    p_year_from := null,
    p_year_to := null,
    p_sort := 'newest',
    p_page_num := page_num,
    p_page_size := page_size
  );
$$;


ALTER FUNCTION "public"."search_master_games"("q" "text", "page_num" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games"("p_q" "text" DEFAULT ''::"text", "p_player" "text" DEFAULT ''::"text", "p_opening" "text" DEFAULT ''::"text", "p_event" "text" DEFAULT ''::"text", "p_result" "text" DEFAULT ''::"text", "p_color" "text" DEFAULT 'all'::"text", "p_year_from" integer DEFAULT NULL::integer, "p_year_to" integer DEFAULT NULL::integer, "p_sort" "text" DEFAULT 'newest'::"text", "p_page_num" integer DEFAULT 1, "p_page_size" integer DEFAULT 30) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $_$
declare
  -- Bound dynamic-SQL map: $1 q, $2 player, $3 opening, $4 event,
  -- $5 result, $6 year_from, $7 year_to; page branches add $8/$9(/$10).
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_player text := nullif(lower(trim(coalesce(p_player, ''))), '');
  v_opening text := nullif(lower(trim(coalesce(p_opening, ''))), '');
  v_event text := nullif(lower(trim(coalesce(p_event, ''))), '');
  v_result text := nullif(trim(coalesce(p_result, '')), '');
  v_color text := lower(trim(coalesce(p_color, 'all')));
  v_sort text := lower(trim(coalesce(p_sort, 'newest')));
  v_page_num integer := greatest(coalesce(p_page_num, 1), 1);
  v_page_size integer :=
    least(greatest(coalesce(p_page_size, 30), 1), 100);
  v_offset bigint;
  v_total bigint;
  v_where text := 'true';
  v_rank text;
  v_order_by text;
  v_filtered_order_by text;
  v_count_sql text;
  v_page_sql text;
begin
  v_offset := (v_page_num - 1)::bigint * v_page_size;

  -- All filters are controlled fragments. Values are never concatenated into SQL.
  if v_player is null then
    v_where := v_where || ' and $2 is null';

  elsif v_color = 'white' then
    v_where := v_where
      || ' and (
        mg.white_norm like $2 || ''%''
        or mg.white_norm like ''%'' || $2 || ''%''
      )';

  elsif v_color = 'black' then
    v_where := v_where
      || ' and (
        mg.black_norm like $2 || ''%''
        or mg.black_norm like ''%'' || $2 || ''%''
      )';

  else
    v_where := v_where
      || ' and (
        mg.white_norm like $2 || ''%''
        or mg.black_norm like $2 || ''%''
        or mg.white_norm like ''%'' || $2 || ''%''
        or mg.black_norm like ''%'' || $2 || ''%''
      )';
  end if;

  if v_q is null then
    v_where := v_where || ' and $1 is null';

  else
    v_where := v_where
      || ' and (
        mg.white_norm like $1 || ''%''
        or mg.black_norm like $1 || ''%''
        or lower(coalesce(mg.opening, '''')) like $1 || ''%''
        or lower(coalesce(mg.event, '''')) like $1 || ''%''
        or lower(coalesce(mg.eco, '''')) = $1
        or mg.white_norm like ''%'' || $1 || ''%''
        or mg.black_norm like ''%'' || $1 || ''%''
        or lower(coalesce(mg.opening, '''')) like ''%'' || $1 || ''%''
        or lower(coalesce(mg.event, '''')) like ''%'' || $1 || ''%''
        or lower(coalesce(mg.search_text, '''')) like ''%'' || $1 || ''%''
      )';
  end if;

  if v_opening is null then
    v_where := v_where || ' and $3 is null';

  else
    v_where := v_where
      || ' and (
        lower(coalesce(mg.opening, '''')) like $3 || ''%''
        or lower(coalesce(mg.opening, '''')) like ''%'' || $3 || ''%''
      )';
  end if;

  if v_event is null then
    v_where := v_where || ' and $4 is null';

  else
    v_where := v_where
      || ' and (
        lower(coalesce(mg.event, '''')) like $4 || ''%''
        or lower(coalesce(mg.event, '''')) like ''%'' || $4 || ''%''
      )';
  end if;

  if v_result is null then
    v_where := v_where || ' and $5 is null';

  else
    v_where := v_where
      || ' and coalesce(mg.result, '''') = $5';
  end if;

  if p_year_from is null then
    v_where := v_where || ' and $6 is null';

  else
    v_where := v_where || ' and mg.year >= $6';
  end if;

  if p_year_to is null then
    v_where := v_where || ' and $7 is null';

  else
    v_where := v_where || ' and mg.year <= $7';
  end if;

  if v_color = 'white' then
    v_rank :=
      'case
        when $2 is not null
          and mg.white_norm = $2 then 1000
        when $2 is not null
          and mg.white_norm like $2 || ''%'' then 700 ';

  elsif v_color = 'black' then
    v_rank :=
      'case
        when $2 is not null
          and mg.black_norm = $2 then 1000
        when $2 is not null
          and mg.black_norm like $2 || ''%'' then 700 ';

  else
    v_rank :=
      'case
        when $2 is not null
          and (
            mg.white_norm = $2
            or mg.black_norm = $2
          ) then 1000
        when $2 is not null
          and (
            mg.white_norm like $2 || ''%''
            or mg.black_norm like $2 || ''%''
          ) then 700 ';
  end if;

  v_rank := v_rank
    || 'when $1 is not null
      and (
        mg.white_norm like $1 || ''%''
        or mg.black_norm like $1 || ''%''
        or lower(coalesce(mg.opening, '''')) like $1 || ''%''
        or lower(coalesce(mg.event, '''')) like $1 || ''%''
        or lower(coalesce(mg.eco, '''')) = $1
      ) then 400 '
    || 'when $1 is not null
      and (
        mg.white_norm like ''%'' || $1 || ''%''
        or mg.black_norm like ''%'' || $1 || ''%''
        or lower(coalesce(mg.opening, '''')) like ''%'' || $1 || ''%''
        or lower(coalesce(mg.event, '''')) like ''%'' || $1 || ''%''
        or lower(coalesce(mg.search_text, '''')) like ''%'' || $1 || ''%''
      ) then 150
      else 0
    end';

  if v_sort = 'player' then
    v_order_by :=
      'coalesce(mg.white, '''') asc,
       coalesce(mg.black, '''') asc,
       mg.year desc nulls last,
       mg.id desc';

    v_filtered_order_by :=
      'coalesce(f.white, '''') asc,
       coalesce(f.black, '''') asc,
       f.year desc nulls last,
       f.id desc';

  elsif v_sort = 'opening' then
    v_order_by :=
      'coalesce(mg.opening, '''') asc,
       mg.year desc nulls last,
       mg.id desc';

    v_filtered_order_by :=
      'coalesce(f.opening, '''') asc,
       f.year desc nulls last,
       f.id desc';

  elsif v_sort = 'oldest' then
    v_order_by :=
      'mg.year asc nulls last,
       mg.id desc';

    v_filtered_order_by :=
      'f.year asc nulls last,
       f.id desc';

  else
    v_order_by :=
      v_rank
      || ' desc,
          mg.year desc nulls last,
          mg.id desc';

    v_filtered_order_by :=
      'f.rank_score desc,
       f.year desc nulls last,
       f.id desc';
  end if;

  -- Broad text search: evaluate the direct indexed predicates exactly once.
  if v_q is not null then
    v_page_sql :=
      'with filtered as materialized (
         select
           mg.id,
           mg.slug,
           mg.title,
           mg.white,
           mg.black,
           mg.result,
           mg.event,
           mg.site,
           mg.year,
           mg.opening,
           mg.eco,
           mg.description,
           '
           || v_rank
           || ' as rank_score
         from master_games as mg
         where '
           || v_where
           || '
       ),
       total_rows as materialized (
         select count(*)::bigint as total_count
         from filtered
       ),
       page_rows as (
         select
           f.id,
           f.slug,
           f.title,
           f.white,
           f.black,
           f.result,
           f.event,
           f.site,
           f.year,
           f.opening,
           f.eco,
           f.description
         from filtered as f
         order by '
           || v_filtered_order_by
           || '
         limit $8
         offset $9
       )
       select
         p.id,
         p.slug,
         p.title,
         p.white,
         p.black,
         p.result,
         p.event,
         p.site,
         p.year,
         p.opening,
         p.eco,
         p.description,
         t.total_count
       from page_rows as p
       cross join total_rows as t';

    return query execute v_page_sql
    using
      v_q,
      v_player,
      v_opening,
      v_event,
      v_result,
      p_year_from,
      p_year_to,
      v_page_size,
      v_offset;

    return;
  end if;

  v_count_sql :=
    'select count(*)::bigint
     from master_games as mg
     where '
     || v_where;

  execute v_count_sql
  into v_total
  using
    v_q,
    v_player,
    v_opening,
    v_event,
    v_result,
    p_year_from,
    p_year_to;

  v_page_sql :=
    'select
       mg.id,
       mg.slug,
       mg.title,
       mg.white,
       mg.black,
       mg.result,
       mg.event,
       mg.site,
       mg.year,
       mg.opening,
       mg.eco,
       mg.description,
       $8::bigint
     from master_games as mg
     where '
       || v_where
       || '
     order by '
       || v_order_by
       || '
     limit $9
     offset $10';

  return query execute v_page_sql
  using
    v_q,
    v_player,
    v_opening,
    v_event,
    v_result,
    p_year_from,
    p_year_to,
    v_total,
    v_page_size,
    v_offset;
end;
$_$;


ALTER FUNCTION "public"."search_master_games"("p_q" "text", "p_player" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games_by_player"("p_player" "text", "p_color" "text" DEFAULT 'all'::"text", "p_page_num" integer DEFAULT 1, "p_page_size" integer DEFAULT 30) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $_$
declare
  v_player text := lower(trim(coalesce(p_player, '')));
  v_color text := lower(trim(coalesce(p_color, 'all')));
  v_page_num integer := greatest(coalesce(p_page_num, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 30), 1), 100);
  v_offset bigint;
  v_total bigint;
  v_where text;
  v_rank text;
  v_count_sql text;
  v_page_sql text;
begin
  if v_player = '' then
    return;
  end if;

  v_offset := (v_page_num - 1)::bigint * v_page_size;

  if v_color = 'white' then
    v_where :=
      'mg.white_norm like $1 || ''%'' or mg.white_norm like ''%'' || $1 || ''%''';

    v_rank :=
      'case
         when lower(coalesce(mg.white, '''')) = $1 then 0
         when lower(coalesce(mg.white, '''')) like $1 || ''%'' then 1
         else 2
       end';

  elsif v_color = 'black' then
    v_where :=
      'mg.black_norm like $1 || ''%'' or mg.black_norm like ''%'' || $1 || ''%''';

    v_rank :=
      'case
         when lower(coalesce(mg.black, '''')) = $1 then 0
         when lower(coalesce(mg.black, '''')) like $1 || ''%'' then 1
         else 2
       end';

  else
    v_where :=
      'mg.white_norm like $1 || ''%''
       or mg.black_norm like $1 || ''%''
       or mg.white_norm like ''%'' || $1 || ''%''
       or mg.black_norm like ''%'' || $1 || ''%''';

    v_rank :=
      'case
         when lower(coalesce(mg.white, '''')) = $1
           or lower(coalesce(mg.black, '''')) = $1 then 0
         when lower(coalesce(mg.white, '''')) like $1 || ''%''
           or lower(coalesce(mg.black, '''')) like $1 || ''%'' then 1
         else 2
       end';
  end if;

  v_count_sql :=
    'select count(*)::bigint
     from master_games as mg
     where ' || v_where;

  execute v_count_sql
  into v_total
  using v_player;

  v_page_sql :=
    'select
       mg.id,
       mg.slug,
       mg.title,
       mg.white,
       mg.black,
       mg.result,
       mg.event,
       mg.site,
       mg.year,
       mg.opening,
       mg.eco,
       mg.description,
       $2::bigint
     from master_games as mg
     where ' || v_where || '
     order by ' || v_rank || ' asc,
              mg.year desc nulls last,
              mg.id desc
     limit $3
     offset $4';

  return query execute v_page_sql
  using v_player, v_total, v_page_size, v_offset;
end;
$_$;


ALTER FUNCTION "public"."search_master_games_by_player"("p_player" "text", "p_color" "text", "p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games_flexible"("p_q" "text" DEFAULT ''::"text", "p_player_1" "text" DEFAULT ''::"text", "p_player_2" "text" DEFAULT ''::"text", "p_opening" "text" DEFAULT ''::"text", "p_event" "text" DEFAULT ''::"text", "p_result" "text" DEFAULT ''::"text", "p_player_1_color" "text" DEFAULT 'all'::"text", "p_year_from" integer DEFAULT NULL::integer, "p_year_to" integer DEFAULT NULL::integer, "p_sort" "text" DEFAULT 'newest'::"text", "p_page_num" integer DEFAULT 1, "p_page_size" integer DEFAULT 30) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $_$
declare
  v_query_year integer;
begin
  if nullif(public.master_game_search_normalize(p_q), '') is null
    and nullif(public.master_game_search_normalize(p_player_1), '') is null
    and nullif(public.master_game_search_normalize(p_player_2), '') is null
    and nullif(public.master_game_search_normalize(p_event), '') is null
    and nullif(public.master_game_search_normalize(p_opening), '') is not null
  then
    return query
      select *
      from public.search_master_games_flexible_opening_only(
        p_opening,
        p_result,
        p_year_from,
        p_year_to,
        p_sort,
        p_page_num,
        p_page_size
      );
    return;
  end if;

  if nullif(public.master_game_search_normalize(p_q), '') is not null
  then
    if p_year_from is null and p_year_to is null then
      select case when count(*) = 1 then max(query_token::integer) end
        into v_query_year
      from regexp_split_to_table(
        public.master_game_search_normalize(p_q),
        '\s+'
      ) as query_tokens(query_token)
      where query_token ~ '^[12][0-9]{3}$';
    end if;

    return query
      select *
      from public.search_master_games_flexible_general_query(
        p_q,
        p_player_1,
        p_player_2,
        p_opening,
        p_event,
        p_result,
        p_player_1_color,
        coalesce(p_year_from, v_query_year),
        coalesce(p_year_to, v_query_year),
        p_sort,
        p_page_num,
        p_page_size
      );
    return;
  end if;

  return query
    select *
    from public.search_master_games_flexible_core(
      p_q,
      p_player_1,
      p_player_2,
      p_opening,
      p_event,
      p_result,
      p_player_1_color,
      p_year_from,
      p_year_to,
      p_sort,
      p_page_num,
      p_page_size
    );
end;
$_$;


ALTER FUNCTION "public"."search_master_games_flexible"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games_flexible_core"("p_q" "text" DEFAULT ''::"text", "p_player_1" "text" DEFAULT ''::"text", "p_player_2" "text" DEFAULT ''::"text", "p_opening" "text" DEFAULT ''::"text", "p_event" "text" DEFAULT ''::"text", "p_result" "text" DEFAULT ''::"text", "p_player_1_color" "text" DEFAULT 'all'::"text", "p_year_from" integer DEFAULT NULL::integer, "p_year_to" integer DEFAULT NULL::integer, "p_sort" "text" DEFAULT 'newest'::"text", "p_page_num" integer DEFAULT 1, "p_page_size" integer DEFAULT 30) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  with params as (
    select
      nullif(public.master_game_search_normalize(p_q), '') as query,
      nullif(split_part(public.master_game_search_normalize(p_q), ' ', 1), '') as query_first_token,
      nullif(public.master_game_search_normalize(p_player_1), '') as player_1,
      nullif(public.master_game_search_normalize(p_player_2), '') as player_2,
      nullif(public.master_game_search_normalize(p_opening), '') as opening_query,
      nullif(public.master_game_search_normalize(p_event), '') as event_query,
      nullif(trim(coalesce(p_result, '')), '') as result_filter,
      lower(trim(coalesce(p_player_1_color, 'all'))) as player_1_color,
      lower(trim(coalesce(p_sort, 'newest'))) as sort_mode,
      greatest(coalesce(p_page_num, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 30), 1), 100) as page_size
  ),
  player_1_candidates as materialized (
    select candidates.normalized_name, candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.player_1) candidates
    where p.player_1 is not null
  ),
  player_2_candidates as materialized (
    select candidates.normalized_name, candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.player_2) candidates
    where p.player_2 is not null
  ),
  query_player_candidates as materialized (
    select candidates.normalized_name
    from params p
    cross join lateral public.master_game_player_candidates(p.query_first_token) candidates
    where p.query_first_token is not null
  ),
  opening_candidates as materialized (
    select
      c.eco_code,
      public.master_game_text_match_score(c.search_text, p.opening_query) as score
    from public.master_game_opening_search_catalog c
    cross join params p
    where p.opening_query is not null
      and public.master_game_text_match_score(c.search_text, p.opening_query) > 0
  ),
  query_opening_candidates as materialized (
    select c.eco_code
    from public.master_game_opening_search_catalog c
    cross join params p
    where p.query_first_token is not null
      and public.master_game_text_match_score(c.search_text, p.query_first_token) > 0
  ),
  eligible_games as not materialized (
    select
      mg.id,
      mg.slug,
      mg.title,
      mg.white,
      mg.black,
      mg.white_norm,
      mg.black_norm,
      mg.result,
      mg.event,
      mg.site,
      mg.year,
      mg.opening,
      mg.eco,
      mg.description,
      mg.search_text
    from public.master_games mg
    cross join params p
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
      and (
        p.event_query is null
        or lower(coalesce(mg.event, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.site, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.event, '')) operator(public.%) p.event_query
        or lower(coalesce(mg.site, '')) operator(public.%) p.event_query
      )
      and (
        p.query is null
        or mg.white_norm in (select normalized_name from query_player_candidates)
        or mg.black_norm in (select normalized_name from query_player_candidates)
        or lower(coalesce(mg.search_text, '')) like '%' || p.query_first_token || '%'
        or lower(coalesce(mg.event, '')) operator(public.%) p.query_first_token
        or lower(coalesce(mg.site, '')) operator(public.%) p.query_first_token
        or mg.eco in (select eco_code from query_opening_candidates)
      )
  ),
  candidate_games as materialized (
    select g.*, p1.score as p1_white_score, 0::integer as p1_black_score,
      0::integer as p2_white_score, p2.score as p2_black_score
    from params p
    cross join player_1_candidates p1
    cross join player_2_candidates p2
    join eligible_games g
      on g.white_norm = p1.normalized_name and g.black_norm = p2.normalized_name
    where p.player_2 is not null and p.player_1_color <> 'black'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, p1.score, p2.score, 0::integer
    from params p
    cross join player_1_candidates p1
    cross join player_2_candidates p2
    join eligible_games g
      on g.black_norm = p1.normalized_name and g.white_norm = p2.normalized_name
    where p.player_2 is not null and p.player_1_color <> 'white'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, p1.score, 0::integer, 0::integer, 0::integer
    from params p
    cross join player_1_candidates p1
    join eligible_games g on g.white_norm = p1.normalized_name
    where p.player_1 is not null and p.player_2 is null and p.player_1_color <> 'black'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, p1.score, 0::integer, 0::integer
    from params p
    cross join player_1_candidates p1
    join eligible_games g on g.black_norm = p1.normalized_name
    where p.player_1 is not null and p.player_2 is null and p.player_1_color <> 'white'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, 0::integer, 0::integer, 0::integer
    from params p
    cross join eligible_games g
    where p.player_1 is null and p.player_2 is null
      and p.opening_query is null

    union all

    select g.*, 0::integer, 0::integer, 0::integer, 0::integer
    from params p
    join opening_candidates opening_match on true
    join eligible_games g on g.eco = opening_match.eco_code
    where p.player_1 is null and p.player_2 is null
      and p.opening_query is not null
  ),
  scored as materialized (
    select
      g.*,
      coalesce(nullif(g.opening, ''), oc.display_name) as resolved_opening,
      case when p.query is null then 0 else public.master_game_text_match_score(
        concat_ws(' ', g.search_text, oc.search_text, g.year::text, g.eco), p.query
      ) end as query_score,
      coalesce(opening_match.score, 0) as opening_score,
      case when p.event_query is null then 0 else public.master_game_text_match_score(
        concat_ws(' ', g.event, g.site), p.event_query
      ) end as event_score,
      p.query,
      p.opening_query,
      p.event_query,
      p.sort_mode,
      p.page_number,
      p.page_size
    from candidate_games g
    cross join params p
    left join public.master_game_opening_search_catalog oc on oc.eco_code = g.eco
    left join opening_candidates opening_match on opening_match.eco_code = g.eco
  ),
  filtered as materialized (
    select
      s.*,
      (
        s.p1_white_score + s.p1_black_score
        + s.p2_white_score + s.p2_black_score
        + s.query_score + s.opening_score + s.event_score
      ) as relevance_score
    from scored s
    where (s.query is null or s.query_score > 0)
      and (s.opening_query is null or s.opening_score > 0)
      and (s.event_query is null or s.event_score > 0)
  ),
  counted as (
    select f.*, count(*) over ()::bigint as matching_count
    from filtered f
  )
  select
    c.id,
    c.slug,
    c.title,
    c.white,
    c.black,
    c.result,
    c.event,
    c.site,
    c.year,
    c.resolved_opening as opening,
    c.eco,
    c.description,
    c.matching_count as total_count
  from counted c
  order by
    c.relevance_score desc,
    case when c.sort_mode = 'player' then lower(c.white) end asc,
    case when c.sort_mode = 'opening' then lower(c.resolved_opening) end asc nulls last,
    case when c.sort_mode = 'oldest' then c.year end asc nulls last,
    case when c.sort_mode <> 'oldest' then c.year end desc nulls last,
    c.id desc
  limit (select page_size from params)
  offset ((select page_number from params) - 1) * (select page_size from params);
$$;


ALTER FUNCTION "public"."search_master_games_flexible_core"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games_flexible_general_query"("p_q" "text" DEFAULT ''::"text", "p_player_1" "text" DEFAULT ''::"text", "p_player_2" "text" DEFAULT ''::"text", "p_opening" "text" DEFAULT ''::"text", "p_event" "text" DEFAULT ''::"text", "p_result" "text" DEFAULT ''::"text", "p_player_1_color" "text" DEFAULT 'all'::"text", "p_year_from" integer DEFAULT NULL::integer, "p_year_to" integer DEFAULT NULL::integer, "p_sort" "text" DEFAULT 'newest'::"text", "p_page_num" integer DEFAULT 1, "p_page_size" integer DEFAULT 30) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  with params as (
    select
      nullif(public.master_game_search_normalize(p_q), '') as query,
      nullif(split_part(public.master_game_search_normalize(p_q), ' ', 1), '') as query_first_token,
      nullif(public.master_game_search_normalize(p_player_1), '') as player_1,
      nullif(public.master_game_search_normalize(p_player_2), '') as player_2,
      nullif(public.master_game_search_normalize(p_opening), '') as opening_query,
      nullif(public.master_game_search_normalize(p_event), '') as event_query,
      nullif(trim(coalesce(p_result, '')), '') as result_filter,
      lower(trim(coalesce(p_player_1_color, 'all'))) as player_1_color,
      lower(trim(coalesce(p_sort, 'newest'))) as sort_mode,
      greatest(coalesce(p_page_num, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 30), 1), 100) as page_size
  ),
  player_1_candidates as materialized (
    select candidates.normalized_name, candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.player_1) candidates
    where p.player_1 is not null
  ),
  player_2_candidates as materialized (
    select candidates.normalized_name, candidates.score
    from params p
    cross join lateral public.master_game_player_candidates(p.player_2) candidates
    where p.player_2 is not null
  ),
  opening_candidates as materialized (
    select
      c.eco_code,
      public.master_game_text_match_score(c.search_text, p.opening_query) as score
    from public.master_game_opening_search_catalog c
    cross join params p
    where p.opening_query is not null
      and public.master_game_text_match_score(c.search_text, p.opening_query) > 0
  ),
  query_candidate_ids as materialized (
    select candidates.id
    from params p
    cross join lateral public.master_game_general_query_candidate_ids(p.query_first_token) candidates
    where p.query is not null
  ),
  eligible_games as not materialized (
    select
      mg.id,
      mg.slug,
      mg.title,
      mg.white,
      mg.black,
      mg.white_norm,
      mg.black_norm,
      mg.result,
      mg.event,
      mg.site,
      mg.year,
      mg.opening,
      mg.eco,
      mg.description,
      mg.search_text
    from query_candidate_ids candidate
    join public.master_games mg on mg.id = candidate.id
    cross join params p
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
      and (
        p.event_query is null
        or lower(coalesce(mg.event, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.site, '')) like '%' || p.event_query || '%'
        or lower(coalesce(mg.event, '')) operator(public.%) p.event_query
        or lower(coalesce(mg.site, '')) operator(public.%) p.event_query
      )
  ),
  candidate_games as materialized (
    select g.*, p1.score as p1_white_score, 0::integer as p1_black_score,
      0::integer as p2_white_score, p2.score as p2_black_score
    from params p
    cross join player_1_candidates p1
    cross join player_2_candidates p2
    join eligible_games g
      on g.white_norm = p1.normalized_name and g.black_norm = p2.normalized_name
    where p.player_2 is not null and p.player_1_color <> 'black'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, p1.score, p2.score, 0::integer
    from params p
    cross join player_1_candidates p1
    cross join player_2_candidates p2
    join eligible_games g
      on g.black_norm = p1.normalized_name and g.white_norm = p2.normalized_name
    where p.player_2 is not null and p.player_1_color <> 'white'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, p1.score, 0::integer, 0::integer, 0::integer
    from params p
    cross join player_1_candidates p1
    join eligible_games g on g.white_norm = p1.normalized_name
    where p.player_1 is not null and p.player_2 is null and p.player_1_color <> 'black'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, p1.score, 0::integer, 0::integer
    from params p
    cross join player_1_candidates p1
    join eligible_games g on g.black_norm = p1.normalized_name
    where p.player_1 is not null and p.player_2 is null and p.player_1_color <> 'white'
      and (p.opening_query is null or g.eco in (select eco_code from opening_candidates))

    union all

    select g.*, 0::integer, 0::integer, 0::integer, 0::integer
    from params p
    cross join eligible_games g
    where p.player_1 is null and p.player_2 is null
      and p.opening_query is null

    union all

    select g.*, 0::integer, 0::integer, 0::integer, 0::integer
    from params p
    join opening_candidates opening_match on true
    join eligible_games g on g.eco = opening_match.eco_code
    where p.player_1 is null and p.player_2 is null
      and p.opening_query is not null
  ),
  scored as materialized (
    select
      g.*,
      coalesce(nullif(g.opening, ''), oc.display_name) as resolved_opening,
      public.master_game_text_match_score(
        concat_ws(' ', g.search_text, oc.search_text, g.year::text, g.eco), p.query
      ) as query_score,
      coalesce(opening_match.score, 0) as opening_score,
      case when p.event_query is null then 0 else public.master_game_text_match_score(
        concat_ws(' ', g.event, g.site), p.event_query
      ) end as event_score,
      p.query,
      p.opening_query,
      p.event_query,
      p.sort_mode,
      p.page_number,
      p.page_size
    from candidate_games g
    cross join params p
    left join public.master_game_opening_search_catalog oc on oc.eco_code = g.eco
    left join opening_candidates opening_match on opening_match.eco_code = g.eco
  ),
  filtered as materialized (
    select
      s.*,
      (
        s.p1_white_score + s.p1_black_score
        + s.p2_white_score + s.p2_black_score
        + s.query_score + s.opening_score + s.event_score
      ) as relevance_score
    from scored s
    where (s.query is null or s.query_score > 0)
      and (s.opening_query is null or s.opening_score > 0)
      and (s.event_query is null or s.event_score > 0)
  ),
  counted as (
    select f.*, count(*) over ()::bigint as matching_count
    from filtered f
  )
  select
    c.id,
    c.slug,
    c.title,
    c.white,
    c.black,
    c.result,
    c.event,
    c.site,
    c.year,
    c.resolved_opening as opening,
    c.eco,
    c.description,
    c.matching_count as total_count
  from counted c
  order by
    c.relevance_score desc,
    case when c.sort_mode = 'player' then lower(c.white) end asc,
    case when c.sort_mode = 'opening' then lower(c.resolved_opening) end asc nulls last,
    case when c.sort_mode = 'oldest' then c.year end asc nulls last,
    case when c.sort_mode <> 'oldest' then c.year end desc nulls last,
    c.id desc
  limit (select page_size from params)
  offset ((select page_number from params) - 1) * (select page_size from params);
$$;


ALTER FUNCTION "public"."search_master_games_flexible_general_query"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_master_games_flexible_opening_only"("p_opening" "text" DEFAULT ''::"text", "p_result" "text" DEFAULT ''::"text", "p_year_from" integer DEFAULT NULL::integer, "p_year_to" integer DEFAULT NULL::integer, "p_sort" "text" DEFAULT 'newest'::"text", "p_page_num" integer DEFAULT 1, "p_page_size" integer DEFAULT 30) RETURNS TABLE("id" bigint, "slug" "text", "title" "text", "white" "text", "black" "text", "result" "text", "event" "text", "site" "text", "year" integer, "opening" "text", "eco" "text", "description" "text", "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
  with params as (
    select
      nullif(public.master_game_search_normalize(p_opening), '') as opening_query,
      nullif(trim(coalesce(p_result, '')), '') as result_filter,
      lower(trim(coalesce(p_sort, 'newest'))) as sort_mode,
      greatest(coalesce(p_page_num, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 30), 1), 100) as page_size
  ),
  opening_candidates as materialized (
    select
      c.eco_code,
      c.display_name,
      public.master_game_text_match_score(c.search_text, p.opening_query) as score
    from public.master_game_opening_search_catalog c
    cross join params p
    where public.master_game_text_match_score(c.search_text, p.opening_query) > 0
  ),
  matched as materialized (
    select
      mg.id,
      mg.white,
      mg.year,
      mg.eco,
      oc.display_name as resolved_opening,
      oc.score as relevance_score,
      p.sort_mode,
      p.page_number,
      p.page_size
    from opening_candidates oc
    join public.master_games mg on mg.eco = oc.eco_code
    cross join params p
    where (p.result_filter is null or mg.result = p.result_filter)
      and (p_year_from is null or mg.year >= p_year_from)
      and (p_year_to is null or mg.year <= p_year_to)
  ),
  counted as (
    select m.*, count(*) over ()::bigint as matching_count
    from matched m
  ),
  page as materialized (
    select c.*
    from counted c
    order by
      c.relevance_score desc,
      case when c.sort_mode = 'player' then lower(c.white) end asc,
      case when c.sort_mode = 'opening' then lower(c.resolved_opening) end asc nulls last,
      case when c.sort_mode = 'oldest' then c.year end asc nulls last,
      case when c.sort_mode <> 'oldest' then c.year end desc nulls last,
      c.id desc
    limit (select page_size from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  )
  select
    mg.id,
    mg.slug,
    mg.title,
    mg.white,
    mg.black,
    mg.result,
    mg.event,
    mg.site,
    mg.year,
    coalesce(nullif(mg.opening, ''), p.resolved_opening) as opening,
    mg.eco,
    mg.description,
    p.matching_count as total_count
  from page p
  join public.master_games mg on mg.id = p.id
  order by
    p.relevance_score desc,
    case when p.sort_mode = 'player' then lower(p.white) end asc,
    case when p.sort_mode = 'opening' then lower(p.resolved_opening) end asc nulls last,
    case when p.sort_mode = 'oldest' then p.year end asc nulls last,
    case when p.sort_mode <> 'oldest' then p.year end desc nulls last,
    p.id desc;
$$;


ALTER FUNCTION "public"."search_master_games_flexible_opening_only"("p_opening" "text", "p_result" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_curriculum_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_curriculum_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_subscription_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_subscription_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_user_auto_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_user_auto_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."training_subscription_is_premium"("p_user_id" "uuid", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing')
      and (
        s.current_period_end is null
        or s.current_period_end > p_now
      )
  );
$$;


ALTER FUNCTION "public"."training_subscription_is_premium"("p_user_id" "uuid", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_training_progress"("p_user_id" "uuid", "p_course" "text", "p_theme" "text", "p_item_id" "text", "p_quality" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_review_count int;
  v_interval int;
  v_ease float;
  v_now timestamp := now();
begin
  -- get current state
  select
    review_count,
    interval_days,
    ease_factor
  into
    v_review_count,
    v_interval,
    v_ease
  from training_progress
  where user_id = p_user_id
    and course = p_course
    and coalesce(theme,'') = coalesce(p_theme,'')
    and item_id = p_item_id;

  -- defaults (first time)
  if v_review_count is null then
    v_review_count := 0;
    v_interval := 1;
    v_ease := 2.5;
  end if;

  -- update ease factor
  v_ease := v_ease + (0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02));
  if v_ease < 1.3 then
    v_ease := 1.3;
  end if;

  -- update interval
  if p_quality < 3 then
    v_interval := 1;
    v_review_count := 0;
  else
    if v_review_count = 0 then
      v_interval := 1;
    elsif v_review_count = 1 then
      v_interval := 3;
    else
      v_interval := round(v_interval * v_ease);
    end if;

    v_review_count := v_review_count + 1;
  end if;

  -- save
  update training_progress
  set
    review_count = v_review_count,
    interval_days = v_interval,
    ease_factor = v_ease,
    last_reviewed_at = v_now,
    next_review_at = v_now + (v_interval || ' days')::interval,
    due_at = v_now + (v_interval || ' days')::interval
  where user_id = p_user_id
    and course = p_course
    and coalesce(theme,'') = coalesce(p_theme,'')
    and item_id = p_item_id;

end;
$$;


ALTER FUNCTION "public"."update_training_progress"("p_user_id" "uuid", "p_course" "text", "p_theme" "text", "p_item_id" "text", "p_quality" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."affiliate_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "tier" integer DEFAULT 1 NOT NULL,
    "custom_bps" integer,
    "paypal_email" "text",
    "profile_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "chess_title" "text",
    "terms_version" "text" NOT NULL,
    "terms_accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suspended_at" timestamp with time zone,
    CONSTRAINT "affiliate_accounts_code_check" CHECK (("code" ~ '^[a-z0-9][a-z0-9-]{2,31}$'::"text")),
    CONSTRAINT "affiliate_accounts_custom_bps_check" CHECK ((("custom_bps" >= 0) AND ("custom_bps" <= 10000))),
    CONSTRAINT "affiliate_accounts_display_name_check" CHECK ((("length"("display_name") >= 1) AND ("length"("display_name") <= 100))),
    CONSTRAINT "affiliate_accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text"]))),
    CONSTRAINT "affiliate_accounts_tier_check" CHECK ((("tier" >= 1) AND ("tier" <= 5)))
);


ALTER TABLE "public"."affiliate_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_admin_audit" (
    "id" bigint NOT NULL,
    "actor" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "before_value" "jsonb",
    "after_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "affiliate_admin_audit_reason_check" CHECK (("length"("reason") > 0))
);


ALTER TABLE "public"."affiliate_admin_audit" OWNER TO "postgres";


ALTER TABLE "public"."affiliate_admin_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."affiliate_admin_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."affiliate_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."affiliate_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "requested_tier" integer NOT NULL,
    "title" "text",
    "profile_url" "text",
    "links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewer" "uuid",
    "reason" "text",
    CONSTRAINT "affiliate_applications_requested_tier_check" CHECK (("requested_tier" = ANY (ARRAY[2, 3, 4]))),
    CONSTRAINT "affiliate_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."affiliate_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_checkouts" (
    "user_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "text" NOT NULL,
    "period" "text" NOT NULL,
    "affiliate_id" "uuid",
    "discount_bps" integer NOT NULL,
    "subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "affiliate_checkouts_discount_bps_check" CHECK ((("discount_bps" >= 0) AND ("discount_bps" <= 10000))),
    CONSTRAINT "affiliate_checkouts_period_check" CHECK (("period" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"])))
);


ALTER TABLE "public"."affiliate_checkouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_click_daily" (
    "affiliate_id" "uuid" NOT NULL,
    "day" "date" DEFAULT CURRENT_DATE NOT NULL,
    "clicks" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."affiliate_click_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_commissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "payment_id" "text",
    "currency" "text" NOT NULL,
    "eligible_minor" bigint NOT NULL,
    "rate_bps" integer NOT NULL,
    "amount_minor" bigint NOT NULL,
    "reversed_minor" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hold_until" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "available_at" timestamp with time zone,
    "payout_id" "uuid",
    "adjustment_reason" "text",
    CONSTRAINT "affiliate_commissions_check" CHECK ((("payment_id" IS NULL) OR (("eligible_minor" >= 0) AND ("amount_minor" >= 0) AND ("reversed_minor" <= "amount_minor")))),
    CONSTRAINT "affiliate_commissions_currency_check" CHECK (("currency" = 'USD'::"text")),
    CONSTRAINT "affiliate_commissions_rate_bps_check" CHECK ((("rate_bps" >= 0) AND ("rate_bps" <= 10000))),
    CONSTRAINT "affiliate_commissions_reversed_minor_check" CHECK (("reversed_minor" >= 0)),
    CONSTRAINT "affiliate_commissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'available'::"text", 'paid'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."affiliate_commissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_payments" (
    "payment_id" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "gross_minor" bigint NOT NULL,
    "tax_minor" bigint NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "refunded_gross_minor" bigint DEFAULT 0 NOT NULL,
    "refunded_eligible_minor" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "affiliate_payments_check" CHECK ((("tax_minor" >= 0) AND ("tax_minor" <= "gross_minor"))),
    CONSTRAINT "affiliate_payments_check1" CHECK ((("refunded_gross_minor" >= 0) AND ("refunded_gross_minor" <= "gross_minor"))),
    CONSTRAINT "affiliate_payments_check2" CHECK ((("refunded_eligible_minor" >= 0) AND ("refunded_eligible_minor" <= ("gross_minor" - "tax_minor")))),
    CONSTRAINT "affiliate_payments_check3" CHECK (((("refunded_gross_minor" - "refunded_eligible_minor") >= 0) AND (("refunded_gross_minor" - "refunded_eligible_minor") <= "tax_minor"))),
    CONSTRAINT "affiliate_payments_currency_check" CHECK (("currency" = 'USD'::"text")),
    CONSTRAINT "affiliate_payments_gross_minor_check" CHECK (("gross_minor" > 0))
);


ALTER TABLE "public"."affiliate_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_payout_items" (
    "payout_id" "uuid" NOT NULL,
    "commission_id" "uuid" NOT NULL,
    "amount_minor" bigint NOT NULL
);


ALTER TABLE "public"."affiliate_payout_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_month" "date" NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "currency" "text" NOT NULL,
    "amount_minor" bigint NOT NULL,
    "paypal_email" "text" NOT NULL,
    "status" "text" DEFAULT 'prepared'::"text" NOT NULL,
    "reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "affiliate_payouts_amount_minor_check" CHECK (("amount_minor" >= 5000)),
    CONSTRAINT "affiliate_payouts_currency_check" CHECK (("currency" = 'USD'::"text")),
    CONSTRAINT "affiliate_payouts_status_check" CHECK (("status" = ANY (ARRAY['prepared'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."affiliate_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_referral_history" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "attributed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."affiliate_referral_history" OWNER TO "postgres";


ALTER TABLE "public"."affiliate_referral_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."affiliate_referral_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."affiliate_referrals" (
    "user_id" "uuid" NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "attributed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "locked_at" timestamp with time zone
);


ALTER TABLE "public"."affiliate_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_reversals" (
    "event_id" "text" NOT NULL,
    "reversal_id" "text" NOT NULL,
    "payment_id" "text" NOT NULL,
    "gross_minor" bigint NOT NULL,
    "commission_minor" bigint NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "affiliate_reversals_gross_minor_check" CHECK (("gross_minor" > 0))
);


ALTER TABLE "public"."affiliate_reversals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_subscription_history" (
    "user_id" "uuid" NOT NULL,
    "subscription_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "local_status" "text" NOT NULL,
    "provider_status" "text" NOT NULL,
    "plan" "text" NOT NULL
);


ALTER TABLE "public"."affiliate_subscription_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_visitors" (
    "token_hash" "text" NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "clicked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "destination" "text" NOT NULL
);


ALTER TABLE "public"."affiliate_visitors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_profiles" (
    "user_id" "uuid" NOT NULL,
    "preferred_openings" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."auto_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_training_chunk_unlocks" (
    "user_id" "uuid" NOT NULL,
    "course" "text" NOT NULL,
    "trainer_key" "text" NOT NULL,
    "unit_key" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "charged_on" "date",
    CONSTRAINT "auto_training_chunk_unlocks_course_check" CHECK (("course" = ANY (ARRAY['pattern'::"text", 'endgame'::"text", 'vision'::"text", 'openings'::"text", 'master_games'::"text"])))
);


ALTER TABLE "public"."auto_training_chunk_unlocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chess_voice_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "chess_voice_usage_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'succeeded'::"text", 'released'::"text"])))
);


ALTER TABLE "public"."chess_voice_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_explanation_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier" "text" NOT NULL,
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "model" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "estimated_cost_usd" numeric(12,8),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "coach_explanation_usage_estimated_cost_usd_check" CHECK ((("estimated_cost_usd" IS NULL) OR ("estimated_cost_usd" >= (0)::numeric))),
    CONSTRAINT "coach_explanation_usage_input_tokens_check" CHECK ((("input_tokens" IS NULL) OR ("input_tokens" >= 0))),
    CONSTRAINT "coach_explanation_usage_output_tokens_check" CHECK ((("output_tokens" IS NULL) OR ("output_tokens" >= 0))),
    CONSTRAINT "coach_explanation_usage_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'succeeded'::"text"]))),
    CONSTRAINT "coach_explanation_usage_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."coach_explanation_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_collection_items" (
    "id" bigint NOT NULL,
    "collection_id" bigint NOT NULL,
    "game_id" bigint NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "difficulty" integer,
    "importance_score" numeric(6,2),
    "opening_focus" "text",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_collection_items" OWNER TO "postgres";


ALTER TABLE "public"."game_collection_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."game_collection_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."game_collections" (
    "id" bigint NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "collection_type" "text" NOT NULL,
    "opening" "text",
    "level_min" integer,
    "level_max" integer,
    "minutes_per_day" integer,
    "games_per_year" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_collections" OWNER TO "postgres";


ALTER TABLE "public"."game_collections" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."game_collections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."game_library" (
    "id" bigint NOT NULL,
    "slug" "text" NOT NULL,
    "white" "text" NOT NULL,
    "black" "text" NOT NULL,
    "white_norm" "text" NOT NULL,
    "black_norm" "text" NOT NULL,
    "title" "text",
    "event" "text",
    "site" "text",
    "round" "text",
    "game_date" "text",
    "year" integer,
    "result" "text",
    "opening" "text",
    "eco" "text",
    "description" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "search_text" "text" NOT NULL,
    "move_count" integer,
    "pgn_storage_key" "text" NOT NULL,
    "has_gm" boolean DEFAULT false NOT NULL,
    "has_world_champion" boolean DEFAULT false NOT NULL,
    "has_elite_player" boolean DEFAULT false NOT NULL,
    "is_famous" boolean DEFAULT false NOT NULL,
    "is_important_event" boolean DEFAULT false NOT NULL,
    "white_elo" integer,
    "black_elo" integer,
    "white_title" "text",
    "black_title" "text",
    "source" "text",
    "source_file" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "site_norm" "text",
    "event_norm" "text"
);


ALTER TABLE "public"."game_library" OWNER TO "postgres";


ALTER TABLE "public"."game_library" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."game_library_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."image_to_position_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "image_to_position_usage_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'succeeded'::"text"])))
);


ALTER TABLE "public"."image_to_position_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_game_opening_search_catalog" (
    "eco_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "search_text" "text" NOT NULL,
    CONSTRAINT "master_game_opening_search_catalog_eco_code_check" CHECK (("eco_code" ~ '^[A-E][0-9]{2}$'::"text"))
);


ALTER TABLE "public"."master_game_opening_search_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_game_player_search_catalog" (
    "normalized_name" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "token_sort_name" "text" NOT NULL
);


ALTER TABLE "public"."master_game_player_search_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_game_player_token_search_catalog" (
    "normalized_name" "text" NOT NULL,
    "token" "text" NOT NULL
);


ALTER TABLE "public"."master_game_player_token_search_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_games" (
    "id" bigint NOT NULL,
    "slug" "text" NOT NULL,
    "white" "text" NOT NULL,
    "black" "text" NOT NULL,
    "white_norm" "text" NOT NULL,
    "black_norm" "text" NOT NULL,
    "title" "text",
    "event" "text",
    "site" "text",
    "game_date" "date",
    "year" integer,
    "round" "text",
    "result" "text",
    "opening" "text",
    "eco" "text",
    "description" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_famous" boolean DEFAULT false NOT NULL,
    "is_world_champion_game" boolean DEFAULT false NOT NULL,
    "move_count" integer,
    "pgn_storage_key" "text" NOT NULL,
    "search_text" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."master_games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_games_backup" (
    "id" bigint,
    "slug" "text",
    "white" "text",
    "black" "text",
    "white_norm" "text",
    "black_norm" "text",
    "title" "text",
    "event" "text",
    "site" "text",
    "game_date" "date",
    "year" integer,
    "round" "text",
    "result" "text",
    "opening" "text",
    "eco" "text",
    "description" "text",
    "tags" "text"[],
    "is_famous" boolean,
    "is_world_champion_game" boolean,
    "move_count" integer,
    "pgn_storage_key" "text",
    "search_text" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."master_games_backup" OWNER TO "postgres";


ALTER TABLE "public"."master_games" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."master_games_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."opening_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "family" "text" NOT NULL,
    "variation" "text",
    "subvariation" "text",
    "eco" "text",
    "aliases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "uci_moves" "text"[] NOT NULL,
    "san_moves" "text"[] NOT NULL,
    "ply_count" integer NOT NULL,
    "final_epd" "text",
    "source" "text" DEFAULT 'lichess'::"text" NOT NULL,
    "source_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "family_slug" "text",
    "side" "text",
    CONSTRAINT "opening_lines_ply_count_check" CHECK (("ply_count" = COALESCE("array_length"("uci_moves", 1), 0))),
    CONSTRAINT "opening_lines_san_len_check" CHECK ((COALESCE("array_length"("uci_moves", 1), 0) = COALESCE("array_length"("san_moves", 1), 0)))
);


ALTER TABLE "public"."opening_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paypal_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "resource_id" "text",
    "event_created_at" timestamp with time zone,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "last_error" "text",
    CONSTRAINT "paypal_webhook_events_attempt_count_check" CHECK (("attempt_count" > 0))
);


ALTER TABLE "public"."paypal_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_access_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "plan" "text" DEFAULT 'yearly'::"text" NOT NULL,
    "claim_expires_at" timestamp with time zone,
    "access_ends_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "claimed_by" "uuid",
    CONSTRAINT "pending_access_grants_email_check" CHECK (((("length"("btrim"("email")) >= 3) AND ("length"("btrim"("email")) <= 320)) AND (POSITION(('@'::"text") IN ("email")) > 1))),
    CONSTRAINT "pending_access_grants_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'monthly'::"text", 'yearly'::"text", 'crypto_30'::"text", 'crypto_365'::"text"])))
);


ALTER TABLE "public"."pending_access_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_invites" (
    "email" "text" NOT NULL,
    "plan" "text" DEFAULT 'yearly'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "claimed_by" "uuid",
    CONSTRAINT "premium_invites_plan_check" CHECK (("plan" = ANY (ARRAY['monthly'::"text", 'yearly'::"text", 'crypto_30'::"text", 'crypto_365'::"text"])))
);


ALTER TABLE "public"."premium_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "study_mode" "text" DEFAULT 'auto'::"text" NOT NULL,
    "estimated_rating" integer,
    "rating_source" "text",
    "onboarding_complete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_rating" integer,
    "minutes_per_day" integer,
    "chesscom_username" "text",
    "lichess_username" "text",
    CONSTRAINT "profiles_rating_source_check" CHECK (("rating_source" = ANY (ARRAY['lichess'::"text", 'chesscom'::"text", 'placement'::"text"]))),
    CONSTRAINT "profiles_study_mode_check" CHECK (("study_mode" = ANY (ARRAY['auto'::"text", 'semi'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'manual'::"text" NOT NULL,
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_status" "text",
    "provider_created_at" timestamp with time zone,
    "provider_updated_at" timestamp with time zone,
    CONSTRAINT "subscriptions_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'monthly'::"text", 'yearly'::"text", 'crypto_30'::"text", 'crypto_365'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['inactive'::"text", 'active'::"text", 'trialing'::"text", 'past_due'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "chunk_size" integer DEFAULT 30 NOT NULL,
    "mastery_fast_solves" integer DEFAULT 5 NOT NULL,
    "fast_move_ms" integer DEFAULT 3000 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trainers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_catalog" (
    "id" bigint NOT NULL,
    "course" "text" NOT NULL,
    "theme" "text" DEFAULT 'default'::"text" NOT NULL,
    "item_id" "text" NOT NULL,
    "difficulty" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."training_catalog" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."training_catalog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."training_catalog_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."training_catalog_id_seq" OWNED BY "public"."training_catalog"."id";



CREATE TABLE IF NOT EXISTS "public"."training_item_usage" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "item_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_item_usage_kind_check" CHECK (("kind" = ANY (ARRAY['puzzle'::"text", 'endgame'::"text", 'board_vision'::"text", 'opening'::"text", 'master_game'::"text"])))
);


ALTER TABLE "public"."training_item_usage" OWNER TO "postgres";


ALTER TABLE "public"."training_item_usage" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."training_item_usage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."training_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course" "text" NOT NULL,
    "theme" "text",
    "item_id" "text" NOT NULL,
    "mastery" integer DEFAULT 0 NOT NULL,
    "best_time_ms" integer,
    "last_result" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "next_review_at" timestamp with time zone,
    "interval_days" integer DEFAULT 0 NOT NULL,
    "due_at" timestamp without time zone DEFAULT "now"(),
    "interval" integer DEFAULT 1,
    "ease_factor" double precision DEFAULT 2.5
);


ALTER TABLE "public"."training_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_auto_profile" (
    "user_id" "uuid" NOT NULL,
    "estimated_rating" integer,
    "rating_source" "text",
    "daily_minutes" integer,
    "primary_goal" "text",
    "weakness_tactics" boolean DEFAULT false,
    "weakness_endgames" boolean DEFAULT false,
    "weakness_openings" boolean DEFAULT false,
    "weakness_visualization" boolean DEFAULT false,
    "weakness_blunders" boolean DEFAULT false,
    "lichess_username" "text",
    "chesscom_username" "text",
    "white_repertoire" "text",
    "black_vs_e4" "text",
    "black_vs_d4" "text",
    "onboarding_step" integer DEFAULT 0 NOT NULL,
    "onboarding_complete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_rating" integer,
    "opening_profile" "jsonb" DEFAULT '{}'::"jsonb",
    "detected_ratings" "jsonb" DEFAULT '{}'::"jsonb",
    "detected_time_controls" "jsonb" DEFAULT '{}'::"jsonb",
    "imported_games_count" integer DEFAULT 0,
    "chesscom_last_import_at" timestamp with time zone,
    "engine_analysis_status" "text",
    "engine_analysis_summary" "jsonb" DEFAULT '{}'::"jsonb",
    "engine_analyzed_games_count" integer DEFAULT 0,
    "engine_analyzed_positions_count" integer DEFAULT 0,
    "engine_last_analysis_at" timestamp with time zone,
    "manual_current_rating" integer,
    "goal_timeframe_months" smallint,
    "current_milestone_rating" integer,
    CONSTRAINT "user_auto_profile_current_milestone_rating_check" CHECK ((("current_milestone_rating" >= 100) AND ("current_milestone_rating" <= 3000))),
    CONSTRAINT "user_auto_profile_goal_timeframe_months_check" CHECK ((("goal_timeframe_months" >= 1) AND ("goal_timeframe_months" <= 120))),
    CONSTRAINT "user_auto_profile_manual_current_rating_check" CHECK ((("manual_current_rating" >= 100) AND ("manual_current_rating" <= 3000))),
    CONSTRAINT "user_auto_profile_primary_goal_check" CHECK (("primary_goal" = ANY (ARRAY['improve_rating'::"text", 'tactics'::"text", 'endgames'::"text", 'openings'::"text", 'overall'::"text", 'tournament_prep'::"text"]))),
    CONSTRAINT "user_auto_profile_rating_source_check" CHECK (("rating_source" = ANY (ARRAY['lichess'::"text", 'chesscom'::"text", 'placement'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."user_auto_profile" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_auto_profile"."manual_current_rating" IS 'Optional user-entered fallback. estimated_rating remains the canonical normalized training rating when available.';



COMMENT ON COLUMN "public"."user_auto_profile"."goal_timeframe_months" IS 'Optional target duration in months; null means a long-term goal with no deadline.';



COMMENT ON COLUMN "public"."user_auto_profile"."current_milestone_rating" IS 'Optional nearer training milestone while target_rating remains the long-term goal.';



CREATE TABLE IF NOT EXISTS "public"."user_board_vision_progress" (
    "user_id" "uuid" NOT NULL,
    "theme" "text" NOT NULL,
    "course_percent" integer DEFAULT 0 NOT NULL,
    "completed_chunks" integer DEFAULT 0 NOT NULL,
    "total_chunks" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_board_vision_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_category_stats" (
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "correct" integer DEFAULT 0 NOT NULL,
    "avg_time_ms" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_category_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_chunk_progress" (
    "user_id" "uuid" NOT NULL,
    "trainer_key" "text" NOT NULL,
    "chunk_index" integer NOT NULL,
    "mastered_puzzles_count" integer DEFAULT 0 NOT NULL,
    "is_mastered" boolean DEFAULT false NOT NULL,
    "mastered_at" timestamp with time zone,
    "review_stage" integer DEFAULT 0 NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "next_review_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_chunk_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_curriculum_area_progress" (
    "user_id" "uuid" NOT NULL,
    "area" "text" NOT NULL,
    "current_stage" smallint DEFAULT 1 NOT NULL,
    "difficulty_ceiling" smallint DEFAULT 1 NOT NULL,
    "category_weight" smallint DEFAULT 0 NOT NULL,
    "temporary_reinforcement" boolean DEFAULT false NOT NULL,
    "reinforcement_until" timestamp with time zone,
    "reinforcement_reason" "text",
    "last_transfer_outcome" "text",
    "last_transfer_at" timestamp with time zone,
    "permanently_mastered" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_curriculum_area_progress_area_check" CHECK (("area" = ANY (ARRAY['mates'::"text", 'tactics'::"text", 'endgame-piece-mates'::"text", 'endgame-studies'::"text", 'openings'::"text", 'master-games'::"text", 'board-vision'::"text"]))),
    CONSTRAINT "user_curriculum_area_progress_category_weight_check" CHECK ((("category_weight" >= 0) AND ("category_weight" <= 100))),
    CONSTRAINT "user_curriculum_area_progress_check" CHECK (("difficulty_ceiling" >= "current_stage")),
    CONSTRAINT "user_curriculum_area_progress_current_stage_check" CHECK (("current_stage" >= 1)),
    CONSTRAINT "user_curriculum_area_progress_last_transfer_outcome_check" CHECK ((("last_transfer_outcome" IS NULL) OR ("last_transfer_outcome" = ANY (ARRAY['passed'::"text", 'failed'::"text"])))),
    CONSTRAINT "user_curriculum_area_progress_reinforcement_reason_check" CHECK ((("reinforcement_reason" IS NULL) OR ("reinforcement_reason" = ANY (ARRAY['low_accuracy'::"text", 'repeated_failures'::"text", 'high_hints'::"text", 'slow_solving'::"text", 'failed_transfer_test'::"text"]))))
);


ALTER TABLE "public"."user_curriculum_area_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_curriculum_session_evidence" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "area" "text" NOT NULL,
    "stage_order" smallint NOT NULL,
    "theme_key" "text",
    "trainer_key" "text" NOT NULL,
    "route" "text" NOT NULL,
    "event_kind" "text" NOT NULL,
    "attempts" integer NOT NULL,
    "correct_attempts" integer NOT NULL,
    "hint_count" integer DEFAULT 0 NOT NULL,
    "average_solve_ms" integer,
    "transfer_outcome" "text",
    "occurred_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_curriculum_session_evidence_area_check" CHECK (("area" = ANY (ARRAY['mates'::"text", 'tactics'::"text", 'endgame-piece-mates'::"text", 'endgame-studies'::"text", 'openings'::"text", 'master-games'::"text", 'board-vision'::"text"]))),
    CONSTRAINT "user_curriculum_session_evidence_attempts_check" CHECK (("attempts" > 0)),
    CONSTRAINT "user_curriculum_session_evidence_average_solve_ms_check" CHECK (("average_solve_ms" >= 0)),
    CONSTRAINT "user_curriculum_session_evidence_check" CHECK ((("correct_attempts" >= 0) AND ("correct_attempts" <= "attempts"))),
    CONSTRAINT "user_curriculum_session_evidence_event_kind_check" CHECK (("event_kind" = ANY (ARRAY['focused'::"text", 'mixed'::"text", 'review'::"text", 'preview'::"text", 'reinforcement'::"text", 'transfer'::"text"]))),
    CONSTRAINT "user_curriculum_session_evidence_hint_count_check" CHECK (("hint_count" >= 0)),
    CONSTRAINT "user_curriculum_session_evidence_idempotency_key_check" CHECK (("length"(TRIM(BOTH FROM "idempotency_key")) > 0)),
    CONSTRAINT "user_curriculum_session_evidence_route_check" CHECK (("left"("route", 1) = '/'::"text")),
    CONSTRAINT "user_curriculum_session_evidence_stage_order_check" CHECK (("stage_order" >= 1)),
    CONSTRAINT "user_curriculum_session_evidence_trainer_key_check" CHECK (("length"(TRIM(BOTH FROM "trainer_key")) > 0)),
    CONSTRAINT "user_curriculum_session_evidence_transfer_outcome_check" CHECK ((("transfer_outcome" IS NULL) OR ("transfer_outcome" = ANY (ARRAY['passed'::"text", 'failed'::"text"]))))
);


ALTER TABLE "public"."user_curriculum_session_evidence" OWNER TO "postgres";


ALTER TABLE "public"."user_curriculum_session_evidence" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_curriculum_session_evidence_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_curriculum_stage_progress" (
    "user_id" "uuid" NOT NULL,
    "area" "text" NOT NULL,
    "stage_order" smallint NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "correct_attempts" integer DEFAULT 0 NOT NULL,
    "hint_count" integer DEFAULT 0 NOT NULL,
    "average_solve_ms" integer,
    "recent_attempts" integer DEFAULT 0 NOT NULL,
    "recent_correct_attempts" integer DEFAULT 0 NOT NULL,
    "mixed_attempts" integer DEFAULT 0 NOT NULL,
    "mixed_correct_attempts" integer DEFAULT 0 NOT NULL,
    "session_days" integer DEFAULT 0 NOT NULL,
    "permanent_mastery" boolean DEFAULT false NOT NULL,
    "mastered_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_curriculum_stage_progress_area_check" CHECK (("area" = ANY (ARRAY['mates'::"text", 'tactics'::"text", 'endgame-piece-mates'::"text", 'endgame-studies'::"text", 'openings'::"text", 'master-games'::"text", 'board-vision'::"text"]))),
    CONSTRAINT "user_curriculum_stage_progress_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "user_curriculum_stage_progress_average_solve_ms_check" CHECK (("average_solve_ms" >= 0)),
    CONSTRAINT "user_curriculum_stage_progress_check" CHECK ((("correct_attempts" >= 0) AND ("correct_attempts" <= "attempts"))),
    CONSTRAINT "user_curriculum_stage_progress_check1" CHECK ((("recent_correct_attempts" >= 0) AND ("recent_correct_attempts" <= "recent_attempts"))),
    CONSTRAINT "user_curriculum_stage_progress_check2" CHECK ((("mixed_correct_attempts" >= 0) AND ("mixed_correct_attempts" <= "mixed_attempts"))),
    CONSTRAINT "user_curriculum_stage_progress_hint_count_check" CHECK (("hint_count" >= 0)),
    CONSTRAINT "user_curriculum_stage_progress_mixed_attempts_check" CHECK (("mixed_attempts" >= 0)),
    CONSTRAINT "user_curriculum_stage_progress_recent_attempts_check" CHECK (("recent_attempts" >= 0)),
    CONSTRAINT "user_curriculum_stage_progress_session_days_check" CHECK (("session_days" >= 0)),
    CONSTRAINT "user_curriculum_stage_progress_stage_order_check" CHECK (("stage_order" >= 1))
);


ALTER TABLE "public"."user_curriculum_stage_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_curriculum_state" (
    "user_id" "uuid" NOT NULL,
    "curriculum_version" smallint DEFAULT 1 NOT NULL,
    "rating_snapshot" integer,
    "rating_source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "imported_weakness_area" "text",
    "category_weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "legacy_category_stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "seeded_from_existing_progress" boolean DEFAULT false NOT NULL,
    "source_profile_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_curriculum_state_category_weights_check" CHECK (("jsonb_typeof"("category_weights") = 'object'::"text")),
    CONSTRAINT "user_curriculum_state_curriculum_version_check" CHECK (("curriculum_version" >= 1)),
    CONSTRAINT "user_curriculum_state_imported_weakness_area_check" CHECK ((("imported_weakness_area" IS NULL) OR ("imported_weakness_area" = ANY (ARRAY['mates'::"text", 'tactics'::"text", 'endgame-piece-mates'::"text", 'endgame-studies'::"text", 'openings'::"text", 'master-games'::"text", 'board-vision'::"text"])))),
    CONSTRAINT "user_curriculum_state_legacy_category_stats_check" CHECK (("jsonb_typeof"("legacy_category_stats") = 'object'::"text")),
    CONSTRAINT "user_curriculum_state_rating_snapshot_check" CHECK ((("rating_snapshot" >= 0) AND ("rating_snapshot" <= 4000))),
    CONSTRAINT "user_curriculum_state_rating_source_check" CHECK (("rating_source" = ANY (ARRAY['estimated'::"text", 'detected'::"text", 'target'::"text", 'default'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."user_curriculum_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_curriculum_theme_progress" (
    "user_id" "uuid" NOT NULL,
    "area" "text" NOT NULL,
    "stage_order" smallint NOT NULL,
    "theme_key" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "correct_attempts" integer DEFAULT 0 NOT NULL,
    "hint_count" integer DEFAULT 0 NOT NULL,
    "average_solve_ms" integer,
    "permanent_mastery" boolean DEFAULT false NOT NULL,
    "mastered_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_curriculum_theme_progress_area_check" CHECK (("area" = ANY (ARRAY['mates'::"text", 'tactics'::"text"]))),
    CONSTRAINT "user_curriculum_theme_progress_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "user_curriculum_theme_progress_average_solve_ms_check" CHECK (("average_solve_ms" >= 0)),
    CONSTRAINT "user_curriculum_theme_progress_check" CHECK ((("correct_attempts" >= 0) AND ("correct_attempts" <= "attempts"))),
    CONSTRAINT "user_curriculum_theme_progress_hint_count_check" CHECK (("hint_count" >= 0)),
    CONSTRAINT "user_curriculum_theme_progress_stage_order_check" CHECK (("stage_order" >= 1)),
    CONSTRAINT "user_curriculum_theme_progress_theme_key_check" CHECK (("length"(TRIM(BOTH FROM "theme_key")) > 0))
);


ALTER TABLE "public"."user_curriculum_theme_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_engine_mistakes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "imported_game_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'chess.com'::"text" NOT NULL,
    "time_class" "text",
    "user_color" "text",
    "move_number" integer,
    "ply" integer NOT NULL,
    "phase" "text",
    "fen_before" "text" NOT NULL,
    "user_move_uci" "text" NOT NULL,
    "user_move_san" "text",
    "best_move_uci" "text",
    "eval_before_cp" integer,
    "eval_after_cp" integer,
    "eval_loss_cp" integer NOT NULL,
    "severity" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_engine_mistakes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_game_plan_items" (
    "id" bigint NOT NULL,
    "plan_id" bigint NOT NULL,
    "game_id" bigint NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "assigned_collection_id" bigint,
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL
);


ALTER TABLE "public"."user_game_plan_items" OWNER TO "postgres";


ALTER TABLE "public"."user_game_plan_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_game_plan_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_game_plans" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_game_plans" OWNER TO "postgres";


ALTER TABLE "public"."user_game_plans" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_game_plans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_imported_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'chess.com'::"text" NOT NULL,
    "source_game_id" "text",
    "url" "text",
    "time_class" "text",
    "time_control" "text",
    "end_time" bigint,
    "user_color" "text",
    "user_result" "text",
    "user_rating" integer,
    "opponent_username" "text",
    "opponent_rating" integer,
    "pgn" "text" NOT NULL,
    "engine_analyzed" boolean DEFAULT false NOT NULL,
    "engine_analyzed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_imported_games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_master_games" (
    "user_id" "uuid" NOT NULL,
    "game_id" bigint NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_master_games_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."user_master_games" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_master_games" IS 'Per-account Master Games bookmarks. Removing a bookmark never removes training progress.';



CREATE TABLE IF NOT EXISTS "public"."user_opening_library" (
    "user_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opening_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_opening_library" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_opening_library" IS 'Per-account bookmarks for canonical opening_lines. Removing a bookmark never removes training progress.';



CREATE TABLE IF NOT EXISTS "public"."user_puzzle_progress" (
    "user_id" "uuid" NOT NULL,
    "trainer_key" "text" NOT NULL,
    "puzzle_id" "text" NOT NULL,
    "chunk_index" integer NOT NULL,
    "fast_success_count" integer DEFAULT 0 NOT NULL,
    "is_mastered" boolean DEFAULT false NOT NULL,
    "last_solved_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_puzzle_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_study_plan" (
    "user_id" "uuid" NOT NULL,
    "max_active_trainers" integer DEFAULT 3 NOT NULL,
    "new_content_pace" "text" DEFAULT 'moderate'::"text" NOT NULL,
    "mates_weight" integer DEFAULT 30 NOT NULL,
    "endgames_weight" integer DEFAULT 25 NOT NULL,
    "board_vision_weight" integer DEFAULT 20 NOT NULL,
    "openings_weight" integer DEFAULT 15 NOT NULL,
    "master_games_weight" integer DEFAULT 10 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tactics_weight" integer DEFAULT 35
);


ALTER TABLE "public"."user_study_plan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_study_profiles" (
    "user_id" "uuid" NOT NULL,
    "level_estimate" integer,
    "minutes_per_day" integer,
    "games_per_year" integer,
    "preferred_openings" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "favorite_players" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_study_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_adaptive_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_key" "date" NOT NULL,
    "engine_elo" integer DEFAULT 1500 NOT NULL,
    "current_game" smallint DEFAULT 0 NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "plan_signals" "jsonb",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weekly_adaptive_tests_current_game_check" CHECK ((("current_game" >= 0) AND ("current_game" <= 2))),
    CONSTRAINT "weekly_adaptive_tests_engine_elo_check" CHECK ((("engine_elo" >= 100) AND ("engine_elo" <= 3000)))
);


ALTER TABLE "public"."weekly_adaptive_tests" OWNER TO "postgres";


ALTER TABLE ONLY "public"."training_catalog" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."training_catalog_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."affiliate_accounts"
    ADD CONSTRAINT "affiliate_accounts_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."affiliate_accounts"
    ADD CONSTRAINT "affiliate_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_accounts"
    ADD CONSTRAINT "affiliate_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."affiliate_admin_audit"
    ADD CONSTRAINT "affiliate_admin_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_admins"
    ADD CONSTRAINT "affiliate_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."affiliate_applications"
    ADD CONSTRAINT "affiliate_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_checkouts"
    ADD CONSTRAINT "affiliate_checkouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_checkouts"
    ADD CONSTRAINT "affiliate_checkouts_subscription_id_key" UNIQUE ("subscription_id");



ALTER TABLE ONLY "public"."affiliate_click_daily"
    ADD CONSTRAINT "affiliate_click_daily_pkey" PRIMARY KEY ("affiliate_id", "day");



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_payment_id_key" UNIQUE ("payment_id");



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_payments"
    ADD CONSTRAINT "affiliate_payments_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."affiliate_payments"
    ADD CONSTRAINT "affiliate_payments_pkey" PRIMARY KEY ("payment_id");



ALTER TABLE ONLY "public"."affiliate_payout_items"
    ADD CONSTRAINT "affiliate_payout_items_pkey" PRIMARY KEY ("payout_id", "commission_id");



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_reference_key" UNIQUE ("reference");



ALTER TABLE ONLY "public"."affiliate_referral_history"
    ADD CONSTRAINT "affiliate_referral_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_referrals"
    ADD CONSTRAINT "affiliate_referrals_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."affiliate_reversals"
    ADD CONSTRAINT "affiliate_reversals_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."affiliate_reversals"
    ADD CONSTRAINT "affiliate_reversals_reversal_id_key" UNIQUE ("reversal_id");



ALTER TABLE ONLY "public"."affiliate_subscription_history"
    ADD CONSTRAINT "affiliate_subscription_history_pkey" PRIMARY KEY ("user_id", "subscription_id", "provider", "local_status", "provider_status", "plan");



ALTER TABLE ONLY "public"."affiliate_visitors"
    ADD CONSTRAINT "affiliate_visitors_pkey" PRIMARY KEY ("token_hash");



ALTER TABLE ONLY "public"."auto_profiles"
    ADD CONSTRAINT "auto_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."auto_training_chunk_unlocks"
    ADD CONSTRAINT "auto_training_chunk_unlocks_pkey" PRIMARY KEY ("user_id", "course", "trainer_key", "unit_key");



ALTER TABLE ONLY "public"."chess_voice_usage"
    ADD CONSTRAINT "chess_voice_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_explanation_usage"
    ADD CONSTRAINT "coach_explanation_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_collection_items"
    ADD CONSTRAINT "game_collection_items_collection_id_game_id_key" UNIQUE ("collection_id", "game_id");



ALTER TABLE ONLY "public"."game_collection_items"
    ADD CONSTRAINT "game_collection_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_collections"
    ADD CONSTRAINT "game_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_collections"
    ADD CONSTRAINT "game_collections_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."game_library"
    ADD CONSTRAINT "game_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_library"
    ADD CONSTRAINT "game_library_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."image_to_position_usage"
    ADD CONSTRAINT "image_to_position_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_game_opening_search_catalog"
    ADD CONSTRAINT "master_game_opening_search_catalog_pkey" PRIMARY KEY ("eco_code");



ALTER TABLE ONLY "public"."master_game_player_search_catalog"
    ADD CONSTRAINT "master_game_player_search_catalog_pkey" PRIMARY KEY ("normalized_name");



ALTER TABLE ONLY "public"."master_game_player_token_search_catalog"
    ADD CONSTRAINT "master_game_player_token_search_catalog_pkey" PRIMARY KEY ("normalized_name", "token");



ALTER TABLE ONLY "public"."master_games"
    ADD CONSTRAINT "master_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_games"
    ADD CONSTRAINT "master_games_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."opening_lines"
    ADD CONSTRAINT "opening_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opening_lines"
    ADD CONSTRAINT "opening_lines_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."paypal_webhook_events"
    ADD CONSTRAINT "paypal_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."pending_access_grants"
    ADD CONSTRAINT "pending_access_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_invites"
    ADD CONSTRAINT "premium_invites_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_provider_subscription_id_key" UNIQUE ("provider_subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."trainers"
    ADD CONSTRAINT "trainers_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."trainers"
    ADD CONSTRAINT "trainers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_catalog"
    ADD CONSTRAINT "training_catalog_course_theme_item_id_key" UNIQUE ("course", "theme", "item_id");



ALTER TABLE ONLY "public"."training_catalog"
    ADD CONSTRAINT "training_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_item_usage"
    ADD CONSTRAINT "training_item_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_item_usage"
    ADD CONSTRAINT "training_item_usage_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."training_progress"
    ADD CONSTRAINT "training_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_progress"
    ADD CONSTRAINT "training_progress_user_course_theme_item_unique" UNIQUE ("user_id", "course", "theme", "item_id");



ALTER TABLE ONLY "public"."user_auto_profile"
    ADD CONSTRAINT "user_auto_profile_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_board_vision_progress"
    ADD CONSTRAINT "user_board_vision_progress_pkey" PRIMARY KEY ("user_id", "theme");



ALTER TABLE ONLY "public"."user_category_stats"
    ADD CONSTRAINT "user_category_stats_pkey" PRIMARY KEY ("user_id", "category");



ALTER TABLE ONLY "public"."user_chunk_progress"
    ADD CONSTRAINT "user_chunk_progress_pkey" PRIMARY KEY ("user_id", "trainer_key", "chunk_index");



ALTER TABLE ONLY "public"."user_curriculum_area_progress"
    ADD CONSTRAINT "user_curriculum_area_progress_pkey" PRIMARY KEY ("user_id", "area");



ALTER TABLE ONLY "public"."user_curriculum_session_evidence"
    ADD CONSTRAINT "user_curriculum_session_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_curriculum_session_evidence"
    ADD CONSTRAINT "user_curriculum_session_evidence_user_id_idempotency_key_key" UNIQUE ("user_id", "idempotency_key");



ALTER TABLE ONLY "public"."user_curriculum_stage_progress"
    ADD CONSTRAINT "user_curriculum_stage_progress_pkey" PRIMARY KEY ("user_id", "area", "stage_order");



ALTER TABLE ONLY "public"."user_curriculum_state"
    ADD CONSTRAINT "user_curriculum_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_curriculum_theme_progress"
    ADD CONSTRAINT "user_curriculum_theme_progress_pkey" PRIMARY KEY ("user_id", "area", "stage_order", "theme_key");



ALTER TABLE ONLY "public"."user_engine_mistakes"
    ADD CONSTRAINT "user_engine_mistakes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_engine_mistakes"
    ADD CONSTRAINT "user_engine_mistakes_user_id_imported_game_id_ply_key" UNIQUE ("user_id", "imported_game_id", "ply");



ALTER TABLE ONLY "public"."user_game_plan_items"
    ADD CONSTRAINT "user_game_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_game_plan_items"
    ADD CONSTRAINT "user_game_plan_items_plan_id_game_id_key" UNIQUE ("plan_id", "game_id");



ALTER TABLE ONLY "public"."user_game_plans"
    ADD CONSTRAINT "user_game_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_imported_games"
    ADD CONSTRAINT "user_imported_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_imported_games"
    ADD CONSTRAINT "user_imported_games_user_id_source_source_game_id_key" UNIQUE ("user_id", "source", "source_game_id");



ALTER TABLE ONLY "public"."user_master_games"
    ADD CONSTRAINT "user_master_games_pkey" PRIMARY KEY ("user_id", "game_id");



ALTER TABLE ONLY "public"."user_opening_library"
    ADD CONSTRAINT "user_opening_library_pkey" PRIMARY KEY ("user_id", "opening_id");



ALTER TABLE ONLY "public"."user_puzzle_progress"
    ADD CONSTRAINT "user_puzzle_progress_pkey" PRIMARY KEY ("user_id", "trainer_key", "puzzle_id");



ALTER TABLE ONLY "public"."user_study_plan"
    ADD CONSTRAINT "user_study_plan_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_study_profiles"
    ADD CONSTRAINT "user_study_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."weekly_adaptive_tests"
    ADD CONSTRAINT "weekly_adaptive_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_adaptive_tests"
    ADD CONSTRAINT "weekly_adaptive_tests_user_id_week_key_key" UNIQUE ("user_id", "week_key");



CREATE INDEX "affiliate_admin_audit_subject" ON "public"."affiliate_admin_audit" USING "btree" ("subject_id", "created_at" DESC);



CREATE INDEX "affiliate_applications_owner" ON "public"."affiliate_applications" USING "btree" ("affiliate_id", "created_at" DESC);



CREATE INDEX "affiliate_commissions_balance" ON "public"."affiliate_commissions" USING "btree" ("affiliate_id", "currency", "status");



CREATE INDEX "affiliate_commissions_hold" ON "public"."affiliate_commissions" USING "btree" ("hold_until") WHERE ("status" = 'pending'::"text");



CREATE INDEX "affiliate_commissions_payout" ON "public"."affiliate_commissions" USING "btree" ("payout_id");



CREATE UNIQUE INDEX "affiliate_monthly_payout" ON "public"."affiliate_payouts" USING "btree" ("affiliate_id", "currency", "batch_month") WHERE ("status" <> 'cancelled'::"text");



CREATE UNIQUE INDEX "affiliate_one_open_checkout" ON "public"."affiliate_checkouts" USING "btree" ("user_id") WHERE ("closed_at" IS NULL);



CREATE INDEX "affiliate_payments_customer" ON "public"."affiliate_payments" USING "btree" ("user_id", "occurred_at");



CREATE INDEX "affiliate_payments_subscription" ON "public"."affiliate_payments" USING "btree" ("subscription_id");



CREATE INDEX "affiliate_payout_items_commission" ON "public"."affiliate_payout_items" USING "btree" ("commission_id");



CREATE UNIQUE INDEX "affiliate_pending_application" ON "public"."affiliate_applications" USING "btree" ("affiliate_id", "requested_tier") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "affiliate_referral_history_click" ON "public"."affiliate_referral_history" USING "btree" ("user_id", "affiliate_id", "attributed_at");



CREATE INDEX "affiliate_referral_history_time" ON "public"."affiliate_referral_history" USING "btree" ("user_id", "attributed_at" DESC);



CREATE INDEX "affiliate_referrals_owner" ON "public"."affiliate_referrals" USING "btree" ("affiliate_id");



CREATE INDEX "affiliate_reversals_payment" ON "public"."affiliate_reversals" USING "btree" ("payment_id");



CREATE INDEX "affiliate_visitors_expiry" ON "public"."affiliate_visitors" USING "btree" ("expires_at");



CREATE INDEX "auto_training_chunk_daily_idx" ON "public"."auto_training_chunk_unlocks" USING "btree" ("user_id", "charged_on") WHERE ("charged_on" IS NOT NULL);



CREATE INDEX "chess_voice_usage_user_created_idx" ON "public"."chess_voice_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "coach_explanation_usage_user_created_idx" ON "public"."coach_explanation_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "coach_explanation_usage_user_tier_created_idx" ON "public"."coach_explanation_usage" USING "btree" ("user_id", "tier", "created_at" DESC);



CREATE INDEX "game_collection_items_collection_idx" ON "public"."game_collection_items" USING "btree" ("collection_id", "sort_order");



CREATE INDEX "game_collection_items_game_idx" ON "public"."game_collection_items" USING "btree" ("game_id");



CREATE INDEX "game_library_black_norm_idx" ON "public"."game_library" USING "btree" ("black_norm");



CREATE INDEX "game_library_eco_idx" ON "public"."game_library" USING "btree" ("eco");



CREATE INDEX "game_library_event_idx" ON "public"."game_library" USING "btree" ("event");



CREATE INDEX "game_library_has_gm_idx" ON "public"."game_library" USING "btree" ("has_gm");



CREATE INDEX "game_library_has_world_champion_idx" ON "public"."game_library" USING "btree" ("has_world_champion");



CREATE INDEX "game_library_is_famous_idx" ON "public"."game_library" USING "btree" ("is_famous");



CREATE INDEX "game_library_opening_idx" ON "public"."game_library" USING "btree" ("opening");



CREATE INDEX "game_library_search_text_trgm_idx" ON "public"."game_library" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "game_library_slug_idx" ON "public"."game_library" USING "btree" ("slug");



CREATE INDEX "game_library_tags_gin_idx" ON "public"."game_library" USING "gin" ("tags");



CREATE INDEX "game_library_white_norm_idx" ON "public"."game_library" USING "btree" ("white_norm");



CREATE INDEX "game_library_year_idx" ON "public"."game_library" USING "btree" ("year");



CREATE INDEX "idx_master_games_black_norm" ON "public"."master_games" USING "btree" ("black_norm");



CREATE INDEX "idx_master_games_search_text_trgm" ON "public"."master_games" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "idx_master_games_slug" ON "public"."master_games" USING "btree" ("slug");



CREATE INDEX "idx_master_games_white_norm" ON "public"."master_games" USING "btree" ("white_norm");



CREATE INDEX "idx_master_games_year" ON "public"."master_games" USING "btree" ("year");



CREATE INDEX "idx_training_catalog_course_theme_active_sort" ON "public"."training_catalog" USING "btree" ("course", "theme", "is_active", "sort_order");



CREATE INDEX "idx_training_progress_user_course" ON "public"."training_progress" USING "btree" ("user_id", "course");



CREATE INDEX "idx_training_progress_user_next_review" ON "public"."training_progress" USING "btree" ("user_id", "next_review_at");



CREATE INDEX "idx_user_chunk_progress_lookup" ON "public"."user_chunk_progress" USING "btree" ("user_id", "trainer_key", "is_mastered", "next_review_at", "chunk_index");



CREATE INDEX "image_to_position_usage_user_created_idx" ON "public"."image_to_position_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "master_game_opening_search_catalog_trgm_idx" ON "public"."master_game_opening_search_catalog" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "master_game_player_search_catalog_name_trgm_idx" ON "public"."master_game_player_search_catalog" USING "gin" ("normalized_name" "public"."gin_trgm_ops");



CREATE INDEX "master_game_player_search_catalog_token_sort_trgm_idx" ON "public"."master_game_player_search_catalog" USING "gin" ("token_sort_name" "public"."gin_trgm_ops");



CREATE INDEX "master_game_player_token_search_catalog_name_idx" ON "public"."master_game_player_token_search_catalog" USING "btree" ("normalized_name");



CREATE INDEX "master_game_player_token_search_catalog_token_trgm_idx" ON "public"."master_game_player_token_search_catalog" USING "gin" ("token" "public"."gin_trgm_ops");



CREATE INDEX "master_games_black_idx" ON "public"."master_games" USING "btree" ("black_norm");



CREATE INDEX "master_games_black_norm_idx" ON "public"."master_games" USING "btree" ("black_norm");



CREATE INDEX "master_games_black_norm_trgm_idx" ON "public"."master_games" USING "gin" ("black_norm" "public"."gin_trgm_ops");



CREATE INDEX "master_games_eco_idx" ON "public"."master_games" USING "btree" ("eco");



CREATE INDEX "master_games_eco_lower_coalesce_idx" ON "public"."master_games" USING "btree" ("lower"(COALESCE("eco", ''::"text")));



CREATE INDEX "master_games_eco_lower_idx" ON "public"."master_games" USING "btree" ("lower"("eco"));



CREATE INDEX "master_games_event_idx" ON "public"."master_games" USING "btree" ("event");



CREATE INDEX "master_games_event_lower_coalesce_trgm_idx" ON "public"."master_games" USING "gin" ("lower"(COALESCE("event", ''::"text")) "public"."gin_trgm_ops");



CREATE INDEX "master_games_event_lower_idx" ON "public"."master_games" USING "btree" ("lower"("event"));



CREATE INDEX "master_games_event_trgm_idx" ON "public"."master_games" USING "gin" ("event" "public"."gin_trgm_ops");



CREATE INDEX "master_games_famous_idx" ON "public"."master_games" USING "btree" ("is_famous");



CREATE INDEX "master_games_opening_idx" ON "public"."master_games" USING "btree" ("opening");



CREATE INDEX "master_games_opening_lower_coalesce_trgm_idx" ON "public"."master_games" USING "gin" ("lower"(COALESCE("opening", ''::"text")) "public"."gin_trgm_ops");



CREATE INDEX "master_games_opening_lower_idx" ON "public"."master_games" USING "btree" ("lower"("opening"));



CREATE INDEX "master_games_opening_search_cover_idx" ON "public"."master_games" USING "btree" ("eco") INCLUDE ("id", "white", "year", "result");



CREATE INDEX "master_games_opening_trgm_idx" ON "public"."master_games" USING "gin" ("opening" "public"."gin_trgm_ops");



CREATE INDEX "master_games_result_year_desc_nulls_last_id_desc_idx" ON "public"."master_games" USING "btree" ("result", "year" DESC NULLS LAST, "id" DESC);



CREATE INDEX "master_games_search_idx" ON "public"."master_games" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "master_games_search_text_lower_coalesce_trgm_idx" ON "public"."master_games" USING "gin" ("lower"(COALESCE("search_text", ''::"text")) "public"."gin_trgm_ops");



CREATE INDEX "master_games_search_text_trgm_idx" ON "public"."master_games" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "master_games_site_lower_coalesce_trgm_idx" ON "public"."master_games" USING "gin" ("lower"(COALESCE("site", ''::"text")) "public"."gin_trgm_ops");



CREATE INDEX "master_games_slug_idx" ON "public"."master_games" USING "btree" ("slug");



CREATE UNIQUE INDEX "master_games_slug_uidx" ON "public"."master_games" USING "btree" ("slug");



CREATE INDEX "master_games_wc_idx" ON "public"."master_games" USING "btree" ("is_world_champion_game");



CREATE INDEX "master_games_white_idx" ON "public"."master_games" USING "btree" ("white_norm");



CREATE INDEX "master_games_white_norm_idx" ON "public"."master_games" USING "btree" ("white_norm");



CREATE INDEX "master_games_white_norm_trgm_idx" ON "public"."master_games" USING "gin" ("white_norm" "public"."gin_trgm_ops");



CREATE INDEX "master_games_year_desc_nulls_last_id_desc_idx" ON "public"."master_games" USING "btree" ("year" DESC NULLS LAST, "id" DESC);



CREATE INDEX "master_games_year_id_idx" ON "public"."master_games" USING "btree" ("year" DESC, "id" DESC);



CREATE INDEX "master_games_year_idx" ON "public"."master_games" USING "btree" ("year");



CREATE INDEX "opening_lines_eco_idx" ON "public"."opening_lines" USING "btree" ("eco");



CREATE INDEX "opening_lines_family_idx" ON "public"."opening_lines" USING "btree" ("family");



CREATE INDEX "opening_lines_family_order_idx" ON "public"."opening_lines" USING "btree" ("family_slug", "eco", "name");



CREATE INDEX "opening_lines_family_slug_idx" ON "public"."opening_lines" USING "btree" ("family_slug");



CREATE INDEX "opening_lines_final_epd_idx" ON "public"."opening_lines" USING "btree" ("final_epd");



CREATE INDEX "opening_lines_ply_count_idx" ON "public"."opening_lines" USING "btree" ("ply_count");



CREATE INDEX "opening_lines_uci_gin_idx" ON "public"."opening_lines" USING "gin" ("uci_moves");



CREATE INDEX "paypal_webhook_events_processed_idx" ON "public"."paypal_webhook_events" USING "btree" ("processed_at", "received_at" DESC);



CREATE INDEX "pending_access_grants_claimed_by_idx" ON "public"."pending_access_grants" USING "btree" ("claimed_by", "claimed_at" DESC);



CREATE UNIQUE INDEX "pending_access_grants_open_email_idx" ON "public"."pending_access_grants" USING "btree" ("lower"("btrim"("email"))) WHERE ("claimed_at" IS NULL);



CREATE INDEX "subscriptions_provider_subscription_idx" ON "public"."subscriptions" USING "btree" ("provider", "provider_subscription_id");



CREATE INDEX "training_item_usage_user_created_idx" ON "public"."training_item_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_auto_profile_onboarding_idx" ON "public"."user_auto_profile" USING "btree" ("onboarding_complete", "onboarding_step");



CREATE INDEX "user_curriculum_area_progress_user_area_idx" ON "public"."user_curriculum_area_progress" USING "btree" ("user_id", "area");



CREATE INDEX "user_curriculum_area_reinforcement_idx" ON "public"."user_curriculum_area_progress" USING "btree" ("user_id", "reinforcement_until") WHERE ("temporary_reinforcement" = true);



CREATE INDEX "user_curriculum_session_evidence_user_area_day_idx" ON "public"."user_curriculum_session_evidence" USING "btree" ("user_id", "area", "occurred_on" DESC);



CREATE INDEX "user_curriculum_stage_progress_user_area_stage_idx" ON "public"."user_curriculum_stage_progress" USING "btree" ("user_id", "area", "stage_order");



CREATE INDEX "user_curriculum_theme_progress_user_area_stage_idx" ON "public"."user_curriculum_theme_progress" USING "btree" ("user_id", "area", "stage_order");



CREATE INDEX "user_master_games_game_id_idx" ON "public"."user_master_games" USING "btree" ("game_id");



CREATE INDEX "user_master_games_newest_idx" ON "public"."user_master_games" USING "btree" ("user_id", "added_at" DESC, "game_id" DESC);



CREATE INDEX "user_master_games_user_id_idx" ON "public"."user_master_games" USING "btree" ("user_id");



CREATE INDEX "user_opening_library_newest_idx" ON "public"."user_opening_library" USING "btree" ("user_id", "added_at" DESC, "opening_id" DESC);



CREATE INDEX "user_opening_library_user_id_idx" ON "public"."user_opening_library" USING "btree" ("user_id");



CREATE INDEX "weekly_adaptive_tests_user_completed_idx" ON "public"."weekly_adaptive_tests" USING "btree" ("user_id", "completed_at" DESC);



CREATE OR REPLACE TRIGGER "affiliate_evidence_immutable" BEFORE DELETE OR UPDATE OR TRUNCATE ON "public"."affiliate_admin_audit" FOR EACH STATEMENT EXECUTE FUNCTION "public"."affiliate_reject_evidence_mutation"();



CREATE OR REPLACE TRIGGER "affiliate_evidence_immutable" BEFORE DELETE OR UPDATE OR TRUNCATE ON "public"."affiliate_payout_items" FOR EACH STATEMENT EXECUTE FUNCTION "public"."affiliate_reject_evidence_mutation"();



CREATE OR REPLACE TRIGGER "affiliate_evidence_immutable" BEFORE DELETE OR UPDATE OR TRUNCATE ON "public"."affiliate_referral_history" FOR EACH STATEMENT EXECUTE FUNCTION "public"."affiliate_reject_evidence_mutation"();



CREATE OR REPLACE TRIGGER "affiliate_evidence_immutable" BEFORE DELETE OR UPDATE OR TRUNCATE ON "public"."affiliate_reversals" FOR EACH STATEMENT EXECUTE FUNCTION "public"."affiliate_reject_evidence_mutation"();



CREATE OR REPLACE TRIGGER "affiliate_preserve_subscription_history" AFTER INSERT OR UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."affiliate_capture_subscription_history"();



CREATE OR REPLACE TRIGGER "set_subscription_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_subscription_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_curriculum_area_progress_updated_at" BEFORE UPDATE ON "public"."user_curriculum_area_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_curriculum_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_curriculum_stage_progress_updated_at" BEFORE UPDATE ON "public"."user_curriculum_stage_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_curriculum_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_curriculum_state_updated_at" BEFORE UPDATE ON "public"."user_curriculum_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_curriculum_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_curriculum_theme_progress_updated_at" BEFORE UPDATE ON "public"."user_curriculum_theme_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_curriculum_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_user_auto_profile" BEFORE UPDATE ON "public"."user_auto_profile" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_user_auto_profile"();



ALTER TABLE ONLY "public"."affiliate_accounts"
    ADD CONSTRAINT "affiliate_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_admin_audit"
    ADD CONSTRAINT "affiliate_admin_audit_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_admins"
    ADD CONSTRAINT "affiliate_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_applications"
    ADD CONSTRAINT "affiliate_applications_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_applications"
    ADD CONSTRAINT "affiliate_applications_reviewer_fkey" FOREIGN KEY ("reviewer") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_checkouts"
    ADD CONSTRAINT "affiliate_checkouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_checkouts"
    ADD CONSTRAINT "affiliate_checkouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_click_daily"
    ADD CONSTRAINT "affiliate_click_daily_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."affiliate_payments"("payment_id");



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id");



ALTER TABLE ONLY "public"."affiliate_payments"
    ADD CONSTRAINT "affiliate_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_payout_items"
    ADD CONSTRAINT "affiliate_payout_items_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "public"."affiliate_commissions"("id");



ALTER TABLE ONLY "public"."affiliate_payout_items"
    ADD CONSTRAINT "affiliate_payout_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id");



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_referral_history"
    ADD CONSTRAINT "affiliate_referral_history_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_referral_history"
    ADD CONSTRAINT "affiliate_referral_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_referrals"
    ADD CONSTRAINT "affiliate_referrals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."affiliate_referrals"
    ADD CONSTRAINT "affiliate_referrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_reversals"
    ADD CONSTRAINT "affiliate_reversals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."affiliate_payments"("payment_id");



ALTER TABLE ONLY "public"."affiliate_subscription_history"
    ADD CONSTRAINT "affiliate_subscription_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_visitors"
    ADD CONSTRAINT "affiliate_visitors_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_accounts"("id");



ALTER TABLE ONLY "public"."auto_profiles"
    ADD CONSTRAINT "auto_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auto_training_chunk_unlocks"
    ADD CONSTRAINT "auto_training_chunk_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chess_voice_usage"
    ADD CONSTRAINT "chess_voice_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_explanation_usage"
    ADD CONSTRAINT "coach_explanation_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_collection_items"
    ADD CONSTRAINT "game_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."game_collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_collection_items"
    ADD CONSTRAINT "game_collection_items_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_library"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_to_position_usage"
    ADD CONSTRAINT "image_to_position_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_game_player_token_search_catalog"
    ADD CONSTRAINT "master_game_player_token_search_catalog_normalized_name_fkey" FOREIGN KEY ("normalized_name") REFERENCES "public"."master_game_player_search_catalog"("normalized_name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_access_grants"
    ADD CONSTRAINT "pending_access_grants_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."premium_invites"
    ADD CONSTRAINT "premium_invites_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_item_usage"
    ADD CONSTRAINT "training_item_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_progress"
    ADD CONSTRAINT "training_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_auto_profile"
    ADD CONSTRAINT "user_auto_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_chunk_progress"
    ADD CONSTRAINT "user_chunk_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_curriculum_area_progress"
    ADD CONSTRAINT "user_curriculum_area_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_curriculum_session_evidence"
    ADD CONSTRAINT "user_curriculum_session_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_curriculum_stage_progress"
    ADD CONSTRAINT "user_curriculum_stage_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_curriculum_state"
    ADD CONSTRAINT "user_curriculum_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_curriculum_theme_progress"
    ADD CONSTRAINT "user_curriculum_theme_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_engine_mistakes"
    ADD CONSTRAINT "user_engine_mistakes_imported_game_id_fkey" FOREIGN KEY ("imported_game_id") REFERENCES "public"."user_imported_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_game_plan_items"
    ADD CONSTRAINT "user_game_plan_items_assigned_collection_id_fkey" FOREIGN KEY ("assigned_collection_id") REFERENCES "public"."game_collections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_game_plan_items"
    ADD CONSTRAINT "user_game_plan_items_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."game_library"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_game_plan_items"
    ADD CONSTRAINT "user_game_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."user_game_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_game_plans"
    ADD CONSTRAINT "user_game_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_master_games"
    ADD CONSTRAINT "user_master_games_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."master_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_master_games"
    ADD CONSTRAINT "user_master_games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_opening_library"
    ADD CONSTRAINT "user_opening_library_opening_id_fkey" FOREIGN KEY ("opening_id") REFERENCES "public"."opening_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_opening_library"
    ADD CONSTRAINT "user_opening_library_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_puzzle_progress"
    ADD CONSTRAINT "user_puzzle_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_study_plan"
    ADD CONSTRAINT "user_study_plan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_study_profiles"
    ADD CONSTRAINT "user_study_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_adaptive_tests"
    ADD CONSTRAINT "weekly_adaptive_tests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Master game opening catalog is public" ON "public"."master_game_opening_search_catalog" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Master game player catalog is public" ON "public"."master_game_player_search_catalog" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Master game player token catalog is public" ON "public"."master_game_player_token_search_catalog" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read access" ON "public"."master_games" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."training_catalog" FOR SELECT USING (true);



CREATE POLICY "Users can add master games" ON "public"."user_master_games" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can add their own opening library" ON "public"."user_opening_library" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own" ON "public"."user_auto_profile" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own" ON "public"."user_category_stats" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own" ON "public"."user_study_plan" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own engine mistakes" ON "public"."user_engine_mistakes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own imported games" ON "public"."user_imported_games" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own" ON "public"."user_auto_profile" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own" ON "public"."user_category_stats" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own" ON "public"."user_study_plan" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own auto profile" ON "public"."auto_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own board vision progress" ON "public"."user_board_vision_progress" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own engine mistakes" ON "public"."user_engine_mistakes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own imported games" ON "public"."user_imported_games" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own" ON "public"."user_auto_profile" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own" ON "public"."user_category_stats" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own" ON "public"."user_study_plan" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own auto profile" ON "public"."auto_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can read their master games library" ON "public"."user_master_games" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own board vision progress" ON "public"."user_board_vision_progress" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own engine mistakes" ON "public"."user_engine_mistakes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own imported games" ON "public"."user_imported_games" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own opening library" ON "public"."user_opening_library" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can remove master games" ON "public"."user_master_games" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can remove their own opening library" ON "public"."user_opening_library" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own" ON "public"."user_auto_profile" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own" ON "public"."user_category_stats" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own" ON "public"."user_study_plan" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own auto profile" ON "public"."auto_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their master games library" ON "public"."user_master_games" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own board vision progress" ON "public"."user_board_vision_progress" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own engine mistakes" ON "public"."user_engine_mistakes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own imported games" ON "public"."user_imported_games" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscription" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own weekly tests" ON "public"."weekly_adaptive_tests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own weekly tests" ON "public"."weekly_adaptive_tests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own weekly tests" ON "public"."weekly_adaptive_tests" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."affiliate_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_admin_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_checkouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_click_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_commissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_payout_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliate_profile_read" ON "public"."affiliate_accounts" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."affiliate_referral_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_reversals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_subscription_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_visitors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auto_chunk_read_own" ON "public"."auto_training_chunk_unlocks" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."auto_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auto_training_chunk_unlocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chess_voice_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_explanation_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "curriculum_owner" ON "public"."user_curriculum_area_progress" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "curriculum_owner" ON "public"."user_curriculum_session_evidence" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "curriculum_owner" ON "public"."user_curriculum_stage_progress" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "curriculum_owner" ON "public"."user_curriculum_state" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "curriculum_owner" ON "public"."user_curriculum_theme_progress" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."image_to_position_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_game_opening_search_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_game_player_search_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_game_player_token_search_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_games_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paypal_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_access_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trainers_select_authenticated" ON "public"."trainers" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."training_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_item_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_auto_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_board_vision_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_category_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_chunk_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_chunk_progress_insert_own" ON "public"."user_chunk_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_chunk_progress_select_own" ON "public"."user_chunk_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_chunk_progress_update_own" ON "public"."user_chunk_progress" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_curriculum_area_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_curriculum_session_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_curriculum_stage_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_curriculum_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_curriculum_theme_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_engine_mistakes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_imported_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_master_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_opening_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_puzzle_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_puzzle_progress_insert_own" ON "public"."user_puzzle_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_puzzle_progress_select_own" ON "public"."user_puzzle_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_puzzle_progress_update_own" ON "public"."user_puzzle_progress" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_study_plan" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can insert own progress" ON "public"."training_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users can read own progress" ON "public"."training_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can update own progress" ON "public"."training_progress" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."weekly_adaptive_tests" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_capture_subscription_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_capture_subscription_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_checkout_selection"("p_actor" "uuid", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_checkout_selection"("p_actor" "uuid", "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_command"("p_actor" "uuid", "p_action" "text", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_command"("p_actor" "uuid", "p_action" "text", "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_discount_history_clear"("p_actor" "uuid", "p_proof" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_discount_history_clear"("p_actor" "uuid", "p_proof" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_eligibility_history"("p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_eligibility_history"("p_actor" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_observe_subscription"("p_actor" "uuid", "p_subscription_id" "text", "p_plan" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_observe_subscription"("p_actor" "uuid", "p_subscription_id" "text", "p_plan" "text", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_rate"("tier" integer, "custom_bps" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_rate"("tier" integer, "custom_bps" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_record_payment"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_record_payment"("p" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_reject_evidence_mutation"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."browse_master_games"("p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."browse_master_games"("p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."browse_master_games"("p_page_num" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."chess_voice_quota"("p_user_id" "uuid", "p_reserve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chess_voice_quota"("p_user_id" "uuid", "p_reserve" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_auto_training_chunk"("p_course" "text", "p_trainer_key" "text", "p_unit_key" "text", "p_item_ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_auto_training_chunk"("p_course" "text", "p_trainer_key" "text", "p_unit_key" "text", "p_item_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_auto_training_chunk"("p_course" "text", "p_trainer_key" "text", "p_unit_key" "text", "p_item_ids" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_pending_access_grant_for_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_pending_access_grant_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_premium_invite"() TO "anon";
GRANT ALL ON FUNCTION "public"."claim_premium_invite"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_premium_invite"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_estimated_cost_usd" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid", "p_model" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_estimated_cost_usd" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_due_counts"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_due_counts"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_due_counts"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_due_openings_in_family"("p_user_id" "uuid", "p_family_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_due_openings_in_family"("p_user_id" "uuid", "p_family_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_due_openings_in_family"("p_user_id" "uuid", "p_family_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_auto_opening"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_auto_opening"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_auto_opening"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_due_chunk"("p_user_id" "uuid", "p_trainer_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_due_chunk"("p_user_id" "uuid", "p_trainer_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_due_chunk"("p_user_id" "uuid", "p_trainer_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_due_item"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_due_item"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_due_item"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_opening_in_family"("p_family_slug" "text", "p_current_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_opening_in_family"("p_family_slug" "text", "p_current_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_opening_in_family"("p_family_slug" "text", "p_current_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_unmastered_opening_in_family"("p_user_id" "uuid", "p_family_slug" "text", "p_current_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_unmastered_opening_in_family"("p_user_id" "uuid", "p_family_slug" "text", "p_current_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_unmastered_opening_in_family"("p_user_id" "uuid", "p_family_slug" "text", "p_current_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_opening_families"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_opening_families"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_opening_families"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_training_item_usage_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_training_item_usage_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_training_item_usage_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."master_game_general_query_candidate_ids"("p_query_first_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_game_general_query_candidate_ids"("p_query_first_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_general_query_candidate_ids"("p_query_first_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_general_query_candidate_ids"("p_query_first_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."master_game_player_candidates"("p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_game_player_candidates"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_player_candidates"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_player_candidates"("p_query" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."master_game_player_match_score"("p_player_name" "text", "p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_game_player_match_score"("p_player_name" "text", "p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_player_match_score"("p_player_name" "text", "p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_player_match_score"("p_player_name" "text", "p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."master_game_player_suggestions"("p_query" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_player_suggestions"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_player_suggestions"("p_query" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."master_game_player_suggestions_flexible"("p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_game_player_suggestions_flexible"("p_query" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_player_suggestions_flexible"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_player_suggestions_flexible"("p_query" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."master_game_search_normalize"("p_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_game_search_normalize"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_search_normalize"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_search_normalize"("p_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."master_game_text_match_score"("p_haystack" "text", "p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_game_text_match_score"("p_haystack" "text", "p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."master_game_text_match_score"("p_haystack" "text", "p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."master_game_text_match_score"("p_haystack" "text", "p_query" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_user_master_game"("p_current_game_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_user_master_game"("p_current_game_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_user_master_game"("p_current_game_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_user_opening"("p_current_opening_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_user_opening"("p_current_opening_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_user_opening"("p_current_opening_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_chess_voice_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_coach_explanation_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_image_to_position_usage"("p_user_id" "uuid", "p_reservation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_coach_explanation_usage"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_coach_explanation_usage"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_image_to_position_usage"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_image_to_position_usage"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_training_item_usage"("p_kind" "text", "p_item_key" "text", "p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_training_item_usage"("p_kind" "text", "p_item_key" "text", "p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_training_item_usage"("p_kind" "text", "p_item_key" "text", "p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_master_games"("q" "text", "page_num" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games"("q" "text", "page_num" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games"("q" "text", "page_num" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_master_games"("p_q" "text", "p_player" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games"("p_q" "text", "p_player" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games"("p_q" "text", "p_player" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_master_games_by_player"("p_player" "text", "p_color" "text", "p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games_by_player"("p_player" "text", "p_color" "text", "p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games_by_player"("p_player" "text", "p_color" "text", "p_page_num" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_master_games_flexible"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_master_games_flexible"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_master_games_flexible_core"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_core"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_core"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_core"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_master_games_flexible_general_query"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_general_query"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_general_query"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_general_query"("p_q" "text", "p_player_1" "text", "p_player_2" "text", "p_opening" "text", "p_event" "text", "p_result" "text", "p_player_1_color" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_master_games_flexible_opening_only"("p_opening" "text", "p_result" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_opening_only"("p_opening" "text", "p_result" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_opening_only"("p_opening" "text", "p_result" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_master_games_flexible_opening_only"("p_opening" "text", "p_result" "text", "p_year_from" integer, "p_year_to" integer, "p_sort" "text", "p_page_num" integer, "p_page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_curriculum_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_curriculum_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_curriculum_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_subscription_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_subscription_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_subscription_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_user_auto_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_user_auto_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_user_auto_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."training_subscription_is_premium"("p_user_id" "uuid", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."training_subscription_is_premium"("p_user_id" "uuid", "p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_training_progress"("p_user_id" "uuid", "p_course" "text", "p_theme" "text", "p_item_id" "text", "p_quality" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_training_progress"("p_user_id" "uuid", "p_course" "text", "p_theme" "text", "p_item_id" "text", "p_quality" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_training_progress"("p_user_id" "uuid", "p_course" "text", "p_theme" "text", "p_item_id" "text", "p_quality" integer) TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_accounts" TO "service_role";
GRANT SELECT ON TABLE "public"."affiliate_accounts" TO "authenticated";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."affiliate_admin_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."affiliate_admin_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."affiliate_admin_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."affiliate_admin_audit_id_seq" TO "service_role";



GRANT SELECT ON TABLE "public"."affiliate_admins" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_applications" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_checkouts" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_click_daily" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_commissions" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_payments" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."affiliate_payout_items" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_payouts" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."affiliate_referral_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."affiliate_referral_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."affiliate_referral_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."affiliate_referral_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_referrals" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."affiliate_reversals" TO "service_role";



GRANT SELECT,INSERT ON TABLE "public"."affiliate_subscription_history" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_visitors" TO "service_role";



GRANT ALL ON TABLE "public"."auto_profiles" TO "anon";
GRANT ALL ON TABLE "public"."auto_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."auto_training_chunk_unlocks" TO "service_role";
GRANT SELECT ON TABLE "public"."auto_training_chunk_unlocks" TO "authenticated";



GRANT ALL ON TABLE "public"."chess_voice_usage" TO "service_role";



GRANT ALL ON TABLE "public"."coach_explanation_usage" TO "service_role";



GRANT ALL ON TABLE "public"."game_collection_items" TO "anon";
GRANT ALL ON TABLE "public"."game_collection_items" TO "authenticated";
GRANT ALL ON TABLE "public"."game_collection_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."game_collection_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_collection_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_collection_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."game_collections" TO "anon";
GRANT ALL ON TABLE "public"."game_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."game_collections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."game_collections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_collections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_collections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."game_library" TO "anon";
GRANT ALL ON TABLE "public"."game_library" TO "authenticated";
GRANT ALL ON TABLE "public"."game_library" TO "service_role";



GRANT ALL ON SEQUENCE "public"."game_library_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_library_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_library_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."image_to_position_usage" TO "service_role";



GRANT ALL ON TABLE "public"."master_game_opening_search_catalog" TO "service_role";
GRANT SELECT ON TABLE "public"."master_game_opening_search_catalog" TO "anon";
GRANT SELECT ON TABLE "public"."master_game_opening_search_catalog" TO "authenticated";



GRANT ALL ON TABLE "public"."master_game_player_search_catalog" TO "service_role";
GRANT SELECT ON TABLE "public"."master_game_player_search_catalog" TO "anon";
GRANT SELECT ON TABLE "public"."master_game_player_search_catalog" TO "authenticated";



GRANT ALL ON TABLE "public"."master_game_player_token_search_catalog" TO "service_role";
GRANT SELECT ON TABLE "public"."master_game_player_token_search_catalog" TO "anon";
GRANT SELECT ON TABLE "public"."master_game_player_token_search_catalog" TO "authenticated";



GRANT ALL ON TABLE "public"."master_games" TO "anon";
GRANT ALL ON TABLE "public"."master_games" TO "authenticated";
GRANT ALL ON TABLE "public"."master_games" TO "service_role";



GRANT ALL ON TABLE "public"."master_games_backup" TO "anon";
GRANT ALL ON TABLE "public"."master_games_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."master_games_backup" TO "service_role";



GRANT ALL ON SEQUENCE "public"."master_games_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."master_games_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."master_games_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."opening_lines" TO "anon";
GRANT ALL ON TABLE "public"."opening_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."opening_lines" TO "service_role";



GRANT ALL ON TABLE "public"."paypal_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."pending_access_grants" TO "service_role";



GRANT ALL ON TABLE "public"."premium_invites" TO "anon";
GRANT ALL ON TABLE "public"."premium_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_invites" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."trainers" TO "anon";
GRANT ALL ON TABLE "public"."trainers" TO "authenticated";
GRANT ALL ON TABLE "public"."trainers" TO "service_role";



GRANT ALL ON TABLE "public"."training_catalog" TO "anon";
GRANT ALL ON TABLE "public"."training_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."training_catalog" TO "service_role";



GRANT ALL ON SEQUENCE "public"."training_catalog_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."training_catalog_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."training_catalog_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."training_item_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."training_item_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."training_item_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."training_item_usage_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."training_progress" TO "anon";
GRANT ALL ON TABLE "public"."training_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."training_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_auto_profile" TO "anon";
GRANT ALL ON TABLE "public"."user_auto_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."user_auto_profile" TO "service_role";



GRANT ALL ON TABLE "public"."user_board_vision_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_board_vision_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_board_vision_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_category_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_category_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_category_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_chunk_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_chunk_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_chunk_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_curriculum_area_progress" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_curriculum_area_progress" TO "authenticated";



GRANT ALL ON TABLE "public"."user_curriculum_session_evidence" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_curriculum_session_evidence" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."user_curriculum_session_evidence_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_curriculum_session_evidence_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_curriculum_session_evidence_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_curriculum_stage_progress" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_curriculum_stage_progress" TO "authenticated";



GRANT ALL ON TABLE "public"."user_curriculum_state" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_curriculum_state" TO "authenticated";



GRANT ALL ON TABLE "public"."user_curriculum_theme_progress" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."user_curriculum_theme_progress" TO "authenticated";



GRANT ALL ON TABLE "public"."user_engine_mistakes" TO "anon";
GRANT ALL ON TABLE "public"."user_engine_mistakes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_engine_mistakes" TO "service_role";



GRANT ALL ON TABLE "public"."user_game_plan_items" TO "anon";
GRANT ALL ON TABLE "public"."user_game_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."user_game_plan_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_game_plan_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_game_plan_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_game_plan_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_game_plans" TO "anon";
GRANT ALL ON TABLE "public"."user_game_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_game_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_game_plans_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_game_plans_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_game_plans_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_imported_games" TO "anon";
GRANT ALL ON TABLE "public"."user_imported_games" TO "authenticated";
GRANT ALL ON TABLE "public"."user_imported_games" TO "service_role";



GRANT ALL ON TABLE "public"."user_master_games" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_master_games" TO "authenticated";



GRANT ALL ON TABLE "public"."user_opening_library" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."user_opening_library" TO "authenticated";



GRANT ALL ON TABLE "public"."user_puzzle_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_puzzle_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_puzzle_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_study_plan" TO "anon";
GRANT ALL ON TABLE "public"."user_study_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."user_study_plan" TO "service_role";



GRANT ALL ON TABLE "public"."user_study_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_study_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_study_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_adaptive_tests" TO "anon";
GRANT ALL ON TABLE "public"."weekly_adaptive_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_adaptive_tests" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
