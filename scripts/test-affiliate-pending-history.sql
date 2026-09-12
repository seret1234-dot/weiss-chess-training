\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values('73000000-0000-4000-8000-000000000001','history-only@test.invalid',now());
set role service_role;
do $$declare u uuid:='73000000-0000-4000-8000-000000000001';h jsonb;
begin
 perform affiliate_observe_subscription(u,'I-NEWER','yearly','APPROVAL_PENDING');
 perform affiliate_observe_subscription(u,'I-NEWER','yearly','APPROVAL_PENDING');
 if (select count(*) from affiliate_subscription_history where user_id=u)<>1 then raise exception 'Duplicate observations were not deduplicated';end if;
 h:=affiliate_eligibility_history(u);
 if h->>'blocked'<>'false' or h->'ids'<>'["I-NEWER"]'::jsonb then raise exception 'Pending identity not retained';end if;
 perform affiliate_observe_subscription(u,'I-OLDER','monthly','ACTIVE');
 h:=affiliate_eligibility_history(u);
 if h->>'blocked'<>'true' or jsonb_array_length(h->'ids')<>2 then raise exception 'Ignored older active history lost';end if;
 if exists(select from subscriptions where user_id=u) or exists(select from affiliate_payments where user_id=u) or exists(select from affiliate_referrals where user_id=u) then raise exception 'Observation changed entitlement/payment/attribution';end if;
 begin update affiliate_subscription_history set provider_status='APPROVAL_PENDING' where user_id=u;raise exception 'Evidence overwrite permitted';exception when insufficient_privilege then null;end;
 if exists(select from pg_proc where pronamespace='public'::regnamespace and proname like 'affiliate_%' and prosecdef) then raise exception 'SECURITY DEFINER added';end if;
 raise notice 'PASS history observation: idempotent pending, ignored older ACTIVE retained, no subscription/payment/referral writes, no evidence overwrite, no SECURITY DEFINER';
end $$;
reset role;
set role authenticated;
do $$begin
 begin perform affiliate_observe_subscription('73000000-0000-4000-8000-000000000001','I-FORGED','monthly','APPROVAL_PENDING');raise exception 'Public proof forgery allowed';exception when insufficient_privilege then null;end;
 begin perform affiliate_discount_history_clear('73000000-0000-4000-8000-000000000001','{}');raise exception 'Public eligibility RPC allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$begin
 begin perform affiliate_observe_subscription('73000000-0000-4000-8000-000000000001','I-FORGED','monthly','APPROVAL_PENDING');raise exception 'Anonymous proof forgery allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
