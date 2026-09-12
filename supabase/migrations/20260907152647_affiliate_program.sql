-- Additive affiliate ledger. No production activation or provider plan creation.
-- Money and privileged operations are service-role-only, transactional RPCs.
create table public.affiliate_admins (user_id uuid primary key references auth.users(id), created_at timestamptz not null default now());
create table public.affiliate_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 code text not null unique check(code ~ '^[a-z0-9][a-z0-9-]{2,31}$'),
 display_name text not null check(length(display_name) between 1 and 100),
 status text not null default 'active' check(status in ('active','suspended')),
 tier int not null default 1 check(tier between 1 and 5),
 custom_bps int check(custom_bps between 0 and 10000),
 paypal_email text, profile_links jsonb not null default '[]', chess_title text,
 terms_version text not null, terms_accepted_at timestamptz not null default now(),
 created_at timestamptz not null default now(), activated_at timestamptz not null default now(), suspended_at timestamptz
);
create table public.affiliate_applications (
 id uuid primary key default gen_random_uuid(), affiliate_id uuid not null references public.affiliate_accounts(id),
 requested_tier int not null check(requested_tier in (2,3,4)), title text, profile_url text, links jsonb not null default '[]',
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewer uuid references auth.users(id), reason text
);
create unique index affiliate_pending_application on public.affiliate_applications(affiliate_id,requested_tier) where status='pending';
create table public.affiliate_visitors (
 token_hash text primary key, affiliate_id uuid not null references public.affiliate_accounts(id),
 clicked_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days', destination text not null
);
create table public.affiliate_click_daily (
 affiliate_id uuid not null references public.affiliate_accounts(id), day date not null default current_date, clicks bigint not null default 0,
 primary key(affiliate_id,day)
);
create index affiliate_visitors_expiry on public.affiliate_visitors(expires_at);
create table public.affiliate_referrals (
 user_id uuid primary key references auth.users(id), affiliate_id uuid not null references public.affiliate_accounts(id),
 attributed_at timestamptz not null default now(), expires_at timestamptz not null, locked_at timestamptz
);
create index affiliate_referrals_owner on public.affiliate_referrals(affiliate_id);
create table public.affiliate_referral_history (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id),
 affiliate_id uuid not null references public.affiliate_accounts(id), attributed_at timestamptz not null default now(), expires_at timestamptz not null
);
create index affiliate_referral_history_time on public.affiliate_referral_history(user_id,attributed_at desc);
create unique index affiliate_referral_history_click on public.affiliate_referral_history(user_id,affiliate_id,attributed_at);
create table public.affiliate_checkouts (
 user_id uuid not null references auth.users(id), id uuid primary key default gen_random_uuid(),
 plan_id text not null, period text not null check(period in ('monthly','yearly')), affiliate_id uuid references public.affiliate_accounts(id),
 discount_bps int not null check(discount_bps between 0 and 10000), subscription_id text unique,
 created_at timestamptz not null default now(), closed_at timestamptz
);
create unique index affiliate_one_open_checkout on public.affiliate_checkouts(user_id) where closed_at is null;
create table public.affiliate_payments (
 payment_id text primary key, event_id text not null unique, user_id uuid not null references auth.users(id), subscription_id text not null,
 currency text not null check(currency='USD'), gross_minor bigint not null check(gross_minor>0), tax_minor bigint not null check(tax_minor>=0 and tax_minor<=gross_minor),
 occurred_at timestamptz not null, refunded_gross_minor bigint not null default 0,
 refunded_eligible_minor bigint not null default 0, created_at timestamptz not null default now(),
 check(refunded_gross_minor between 0 and gross_minor), check(refunded_eligible_minor between 0 and gross_minor-tax_minor),
 check(refunded_gross_minor-refunded_eligible_minor between 0 and tax_minor)
);
create index affiliate_payments_customer on public.affiliate_payments(user_id,occurred_at);
create index affiliate_payments_subscription on public.affiliate_payments(subscription_id);
create table public.affiliate_payouts (
 id uuid primary key default gen_random_uuid(), batch_month date not null, affiliate_id uuid not null references public.affiliate_accounts(id),
 currency text not null check(currency='USD'), amount_minor bigint not null check(amount_minor>=5000), paypal_email text not null,
 status text not null default 'prepared' check(status in ('prepared','paid','cancelled')), reference text unique,
 created_at timestamptz not null default now(), paid_at timestamptz, created_by uuid not null references auth.users(id)
);
create unique index affiliate_monthly_payout on public.affiliate_payouts(affiliate_id,currency,batch_month) where status<>'cancelled';
create table public.affiliate_commissions (
 id uuid primary key default gen_random_uuid(), affiliate_id uuid not null references public.affiliate_accounts(id),
 payment_id text unique references public.affiliate_payments(payment_id), currency text not null check(currency='USD'),
 eligible_minor bigint not null, rate_bps int not null check(rate_bps between 0 and 10000), amount_minor bigint not null,
 reversed_minor bigint not null default 0 check(reversed_minor>=0),
 status text not null default 'pending' check(status in ('pending','available','paid','reversed')),
 created_at timestamptz not null default now(), hold_until timestamptz not null default now()+interval '30 days', available_at timestamptz,
 payout_id uuid references public.affiliate_payouts(id), adjustment_reason text,
 check(payment_id is null or (eligible_minor>=0 and amount_minor>=0 and reversed_minor<=amount_minor))
);
create index affiliate_commissions_balance on public.affiliate_commissions(affiliate_id,currency,status);
create index affiliate_commissions_hold on public.affiliate_commissions(hold_until) where status='pending';
create index affiliate_commissions_payout on public.affiliate_commissions(payout_id);
create table public.affiliate_payout_items (
 payout_id uuid not null references public.affiliate_payouts(id), commission_id uuid not null references public.affiliate_commissions(id),
 amount_minor bigint not null, primary key(payout_id,commission_id)
);
create table public.affiliate_reversals (
 event_id text primary key, reversal_id text not null unique, payment_id text not null references public.affiliate_payments(payment_id),
 gross_minor bigint not null check(gross_minor>0), commission_minor bigint not null, reason text not null, created_at timestamptz not null default now()
);
create table public.affiliate_admin_audit (
 id bigint generated always as identity primary key, actor uuid not null references auth.users(id), action text not null,
 subject_id text not null, reason text not null check(length(reason)>0), before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create index affiliate_admin_audit_subject on public.affiliate_admin_audit(subject_id,created_at desc);
create index affiliate_applications_owner on public.affiliate_applications(affiliate_id,created_at desc);
create index affiliate_reversals_payment on public.affiliate_reversals(payment_id);
create index affiliate_payout_items_commission on public.affiliate_payout_items(commission_id);
do $$ declare t text; begin
 foreach t in array array['affiliate_admins','affiliate_accounts','affiliate_applications','affiliate_visitors','affiliate_click_daily','affiliate_referrals','affiliate_referral_history','affiliate_checkouts','affiliate_payments','affiliate_payouts','affiliate_commissions','affiliate_payout_items','affiliate_reversals','affiliate_admin_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
-- Server credentials can append evidence, never rewrite/delete/truncate it or appoint administrators.
revoke all on public.affiliate_admins from service_role;
grant select on public.affiliate_admins to service_role;
revoke update,delete,truncate,references,trigger on public.affiliate_admin_audit,public.affiliate_referral_history,public.affiliate_reversals,public.affiliate_payout_items from service_role;
create function public.affiliate_reject_evidence_mutation() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Affiliate evidence is append-only'; end $$;
revoke all on function public.affiliate_reject_evidence_mutation() from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['affiliate_admin_audit','affiliate_referral_history','affiliate_reversals','affiliate_payout_items'] loop
  execute format('create trigger affiliate_evidence_immutable before update or delete or truncate on public.%I for each statement execute function public.affiliate_reject_evidence_mutation()',t);
 end loop;
end $$;
grant usage,select on sequence public.affiliate_admin_audit_id_seq to service_role;
grant usage,select on sequence public.affiliate_referral_history_id_seq to service_role;
grant select on public.affiliate_accounts to authenticated;
create policy affiliate_profile_read on public.affiliate_accounts for select to authenticated using(user_id=(select auth.uid()));

create function public.affiliate_rate(tier int, custom_bps int) returns int language sql immutable set search_path=public,pg_temp as $$
 select coalesce(custom_bps,case tier when 1 then 1500 when 2 then 2000 when 3 then 3000 when 4 then 2500 when 5 then 3500 end)
$$;
revoke all on function public.affiliate_rate(int,int) from public,anon,authenticated;
grant execute on function public.affiliate_rate(int,int) to service_role;
-- SECURITY INVOKER RPCs need only these verified Auth identity columns.
grant select(id,email,email_confirmed_at,is_anonymous) on auth.users to service_role;
grant select on public.subscriptions to service_role;

-- Caller identity is supplied ONLY by the authenticated server, never by browser input.
create function public.affiliate_command(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
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
  select * into c from affiliate_checkouts where user_id=p_actor and closed_at is null;
  if c.id is not null then
   if c.period<>p_data->>'period' then raise exception 'Finish or cancel the existing checkout before changing billing period'; end if;
   return to_jsonb(c);
  end if;
  select * into r from affiliate_referrals where user_id=p_actor and (locked_at is not null or expires_at>now());
  select * into a from affiliate_accounts where id=r.affiliate_id and status='active' and user_id<>p_actor;
  eligible := a.id is not null and not exists(select 1 from affiliate_payments where user_id=p_actor)
    and not exists(select 1 from subscriptions s where s.user_id=p_actor and not exists(select 1 from affiliate_checkouts ac where ac.user_id=p_actor and ac.subscription_id=s.provider_subscription_id)); -- unknown legacy history fails closed; our unpaid cancelled intents do not consume eligibility
  if eligible and nullif(p_data->>'discount_plan','') is null then raise exception 'Affiliate introductory PayPal plan is not configured'; end if;
  insert into affiliate_checkouts(user_id,plan_id,period,affiliate_id,discount_bps)
  values(p_actor,case when eligible then p_data->>'discount_plan' else p_data->>'normal_plan' end,p_data->>'period',a.id,case when eligible then 1000 else 0 end) returning * into c;
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
end $$;
revoke all on function public.affiliate_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.affiliate_command(uuid,text,jsonb) to service_role;

create function public.affiliate_record_payment(p jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
revoke all on function public.affiliate_record_payment(jsonb) from public,anon,authenticated;
grant execute on function public.affiliate_record_payment(jsonb) to service_role;
