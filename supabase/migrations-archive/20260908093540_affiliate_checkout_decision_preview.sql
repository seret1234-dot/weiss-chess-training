begin;
-- Service-only read-only selection. Preview and the locked checkout command use
-- this exact function; neither browser-supplied identity nor eligibility is trusted.
create function public.affiliate_checkout_selection(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
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
revoke all on function public.affiliate_checkout_selection(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.affiliate_checkout_selection(uuid,jsonb) to service_role;

-- Replace only the checkout branch. All accounting/admin/referral writes, locks,
-- original history guard, table grants and RLS remain unchanged.
do $migration$
declare definition text; start_at int; end_at int; old_block text; new_block text;
begin
 definition:=pg_get_functiondef('public.affiliate_command(uuid,text,jsonb)'::regprocedure);
 start_at:=strpos(definition,$marker$elsif p_action='checkout' then$marker$);
 end_at:=strpos(definition,' -- Internal server-only operation after PayPal confirms an unpaid cancelled/expired subscription.');
 if start_at=0 or end_at<=start_at or strpos(definition,'affiliate_checkout_selection')>0 then raise exception 'Reviewed checkout branch not found'; end if;
 old_block:=substring(definition from start_at for end_at-start_at);
 if strpos(old_block,'affiliate_discount_history_clear')=0 then raise exception 'Verified history guard missing'; end if;
 new_block:=$replacement$elsif p_action='checkout' then
  result:=affiliate_checkout_selection(p_actor,p_data);
  if not (result->>'can_create')::boolean then raise exception '%',result->>'reason'; end if;
  if p_data ? 'expected_plan' and p_data->>'expected_plan' is distinct from result->>'plan_id' then raise exception 'Checkout decision changed; preview again'; end if;
  select * into c from affiliate_checkouts where user_id=p_actor and closed_at is null;
  if c.id is not null then return to_jsonb(c); end if;
  insert into affiliate_checkouts(user_id,plan_id,period,affiliate_id,discount_bps)
  values(p_actor,result->>'plan_id',p_data->>'period',(result->>'affiliate_id')::uuid,case when (result->>'eligible')::boolean then 1000 else 0 end) returning * into c;
  return to_jsonb(c);
 end if;
$replacement$;
 execute replace(definition,old_block,new_block);
end $migration$;
commit;
