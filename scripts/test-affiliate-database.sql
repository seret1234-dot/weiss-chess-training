\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000001','affiliate@test.invalid',now()),
 ('10000000-0000-4000-8000-000000000002','other@test.invalid',now()),
 ('10000000-0000-4000-8000-000000000003','buyer@test.invalid',now()),
 ('10000000-0000-4000-8000-000000000004','admin@test.invalid',now()),
 ('10000000-0000-4000-8000-000000000005','unverified@test.invalid',null);
insert into affiliate_admins(user_id) values('10000000-0000-4000-8000-000000000004');
set role service_role;
do $$ declare a uuid; b uuid; result jsonb; payout uuid; p jsonb; before_count int;
begin
 begin perform affiliate_command('10000000-0000-4000-8000-000000000001','activate','{"code":"test-a","display_name":"A","terms_version":"2026-09-07","accept_terms":false}'); raise exception 'missing terms accepted'; exception when others then if sqlerrm='missing terms accepted' then raise; end if; end;
 begin perform affiliate_command('10000000-0000-4000-8000-000000000005','activate','{"code":"test-u","display_name":"U","terms_version":"2026-09-07","accept_terms":true}'); raise exception 'unverified accepted'; exception when others then if sqlerrm='unverified accepted' then raise; end if; end;
 result:=affiliate_command('10000000-0000-4000-8000-000000000001','activate','{"code":"test-a","display_name":"A","paypal_email":"pay@test.invalid","terms_version":"2026-09-07","accept_terms":true}'); a:=(result->>'id')::uuid;
 result:=affiliate_command('10000000-0000-4000-8000-000000000002','activate','{"code":"test-b","display_name":"B","terms_version":"2026-09-07","accept_terms":true}'); b:=(result->>'id')::uuid;
 if affiliate_rate(1,null)<>1500 or affiliate_rate(2,null)<>2000 or affiliate_rate(3,null)<>3000 or affiliate_rate(4,null)<>2500 or affiliate_rate(5,null)<>3500 or affiliate_rate(4,3200)<>3200 then raise exception 'tier rate failed'; end if;
 begin perform affiliate_command('10000000-0000-4000-8000-000000000005','manage',jsonb_build_object('id',a,'tier',5,'reason','hack')); raise exception 'nonadmin managed'; exception when others then if sqlerrm='nonadmin managed' then raise; end if; end;
 perform affiliate_command(null,'track','{"code":"test-a","destination":"/mates?chunk=25","token_hash":"visitor"}');
 perform affiliate_command('10000000-0000-4000-8000-000000000003','bind','{"token_hash":"visitor"}');
 perform affiliate_command('10000000-0000-4000-8000-000000000003','track','{"code":"test-b","destination":"/pricing","token_hash":"visitor"}');
 if (select affiliate_id from affiliate_referrals where user_id='10000000-0000-4000-8000-000000000003')<>b then raise exception 'last click failed'; end if;
 perform affiliate_command('10000000-0000-4000-8000-000000000003','track','{"code":"test-a","destination":"/pricing","token_hash":"visitor"}');
 result:=affiliate_command('10000000-0000-4000-8000-000000000003','checkout','{"period":"monthly","normal_plan":"P-NORMAL","discount_plan":"P-INTRO"}');
 if result->>'discount_bps'<>'1000' then raise exception 'discount failed'; end if;
 if (affiliate_command('10000000-0000-4000-8000-000000000003','checkout','{"period":"monthly","normal_plan":"P-NORMAL","discount_plan":"P-INTRO"}')->>'id')<>(result->>'id') then raise exception 'checkout not idempotent'; end if;
 if exists(select 1 from affiliate_payments) then raise exception 'abandoned checkout consumed benefit'; end if;
 p:=jsonb_build_object('kind','payment','payment_id','SALE1','event_id','WH-ONE','user_id','10000000-0000-4000-8000-000000000003','subscription_id','I-SUB1','currency','USD','gross_minor',90000,'tax_minor',9000,'occurred_at',clock_timestamp());
 perform affiliate_record_payment(p); perform affiliate_record_payment(p || '{"event_id":"WH-DUPLICATE"}');
 if (select count(*) from affiliate_commissions)<>1 or (select amount_minor from affiliate_commissions)<>12150 then raise exception 'discounted actual net calculation or dedupe failed'; end if;
 perform affiliate_command('10000000-0000-4000-8000-000000000003','track','{"code":"test-b","destination":"/","token_hash":"visitor"}');
 if (select affiliate_id from affiliate_referrals where user_id='10000000-0000-4000-8000-000000000003')<>a then raise exception 'converted ownership stolen'; end if;
 perform affiliate_command('10000000-0000-4000-8000-000000000004','manage',jsonb_build_object('id',a,'custom_bps',3200,'reason','future negotiated deal'));
 perform affiliate_record_payment(p || '{"payment_id":"SALE2","event_id":"WH-TWO"}');
 if (select amount_minor from affiliate_commissions where payment_id='SALE1')<>12150 or (select amount_minor from affiliate_commissions where payment_id='SALE2')<>25920 then raise exception 'rate snapshot failed'; end if;
 perform affiliate_record_payment(jsonb_build_object('kind','reversal','payment_id','SALE1','event_id','WH-REF1','reversal_id','REF1','user_id','10000000-0000-4000-8000-000000000003','currency','USD','gross_minor',45000,'reason','partial refund'));
 if (select reversed_minor from affiliate_commissions where payment_id='SALE1')<>6075 then raise exception 'partial reversal failed'; end if;
 result:=affiliate_command('10000000-0000-4000-8000-000000000001','dashboard');
 if (result->'balances'->>'available')::bigint<>0 then raise exception 'hold bypassed'; end if;
 update affiliate_commissions set hold_until=now()-interval '1 second';
 result:=affiliate_command('10000000-0000-4000-8000-000000000004','prepare_payout',jsonb_build_object('id',a,'reason','monthly test')); payout:=(result->>'id')::uuid;
 if (result->>'amount_minor')::bigint<>31995 then raise exception 'payout amount failed'; end if;
 perform affiliate_command('10000000-0000-4000-8000-000000000004','pay',jsonb_build_object('id',payout,'reason','external transfer','reference','PAYPAL-TEST-1'));
 begin perform affiliate_command('10000000-0000-4000-8000-000000000004','pay',jsonb_build_object('id',payout,'reason','duplicate','reference','PAYPAL-TEST-1')); raise exception 'double pay accepted'; exception when others then if sqlerrm='double pay accepted' then raise; end if; end;
 perform affiliate_record_payment(jsonb_build_object('kind','reversal','payment_id','SALE2','event_id','WH-REV2','reversal_id','REV2','user_id','10000000-0000-4000-8000-000000000003','currency','USD','gross_minor',90000,'reason','chargeback'));
 if not exists(select 1 from affiliate_commissions where amount_minor=-25920 and status='available') then raise exception 'paid reversal debt missing'; end if;
 perform affiliate_command('10000000-0000-4000-8000-000000000004','manage',jsonb_build_object('id',a,'status','suspended','reason','fraud review'));
 select count(*) into before_count from affiliate_commissions;
 perform affiliate_record_payment(p || '{"payment_id":"SALE3","event_id":"WH-THREE"}');
 if (select count(*) from affiliate_commissions)<>before_count then raise exception 'suspension ignored'; end if;
 if result ? 'user_id' then raise exception 'private identity leaked'; end if;
 raise notice 'PASS: activation, tier rates, authorization, last-click, discount reservation, duplicate payment, actual net revenue, rate snapshots, locked attribution, refunds, holds, payouts, debt, suspension';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from affiliate_accounts)<>1 then raise exception 'RLS own profile failed'; end if;
 begin update affiliate_accounts set custom_bps=10000; raise exception 'rate changed'; exception when insufficient_privilege then null; end;
 begin perform * from affiliate_commissions; raise exception 'private ledger exposed'; exception when insufficient_privilege then null; end;
 begin perform affiliate_command('10000000-0000-4000-8000-000000000004','list'); raise exception 'RPC exposed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: authenticated RLS and privilege denials';
end $$;
reset role;
set role anon;
do $$ begin begin perform * from affiliate_accounts; raise exception 'anon enumeration allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
