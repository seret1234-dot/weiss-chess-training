\set ON_ERROR_STOP on
begin;
-- Synthetic identities only. Executes the actual migration RPCs under service_role.
insert into auth.users(id,email,email_confirmed_at) select ('50000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'readiness'||i||'@test.invalid',now() from generate_series(1,4)i;
insert into affiliate_admins(user_id) values('50000000-0000-4000-8000-000000000004');
set role service_role;
do $$declare owner uuid:='50000000-0000-4000-8000-000000000001'; buyer uuid:='50000000-0000-4000-8000-000000000002'; admin_id uuid:='50000000-0000-4000-8000-000000000004'; a uuid;p jsonb;r jsonb;
begin
 a:=(affiliate_command(owner,'activate','{"code":"ready-coach","display_name":"Ready","paypal_email":"ready@test.invalid","terms_version":"2026-09-07","accept_terms":true}')->>'id')::uuid;
 perform affiliate_command(buyer,'track','{"code":"ready-coach","destination":"/pricing","token_hash":"ready-cookie"}');
 p:=jsonb_build_object('kind','payment','payment_id','READYPAY','event_id','READY-EVENT','user_id',buyer,'subscription_id','I-READY','currency','USD','gross_minor',10000,'tax_minor',1000,'occurred_at',clock_timestamp());
 perform affiliate_record_payment(p);
 begin perform affiliate_record_payment(p||'{"subscription_id":"I-WRONG"}');raise exception 'mismatched subscription accepted';exception when others then if sqlerrm<>'Payment identity mismatch' then raise;end if;end;
 begin perform affiliate_record_payment(p||'{"occurred_at":"2000-01-01T00:00:00Z"}');raise exception 'mismatched timestamp accepted';exception when others then if sqlerrm<>'Payment identity mismatch' then raise;end if;end;
 r:=jsonb_build_object('kind','reversal','payment_id','READYPAY','event_id','READY-R1','reversal_id','READY-R1','user_id',buyer,'currency','USD','gross_minor',1000,'refund_tax_minor',1000,'reason','verified tax-only refund');
 perform affiliate_record_payment(r);
 perform affiliate_record_payment(p||'{"payment_id":"READYPAY2","event_id":"READY-EVENT2"}');
 begin perform affiliate_record_payment(r||'{"payment_id":"READYPAY2"}');raise exception 'reversal ID reused against different payment';exception when others then if sqlerrm<>'Reversal identity mismatch' then raise;end if;end;
 begin perform affiliate_record_payment(r||'{"event_id":"READY-NEG","reversal_id":"READY-NEG","gross_minor":-1}');raise exception 'negative reversal accepted';exception when others then if sqlerrm<>'Positive reversal amount required' then raise;end if;end;
 begin perform affiliate_record_payment(r||'{"event_id":"READY-R2","reversal_id":"READY-R2"}');raise exception 'cumulative excess tax accepted';exception when others then if sqlerrm<>'Invalid authoritative refund tax' then raise;end if;end;
 perform affiliate_record_payment(r||'{"event_id":"READY-R3","reversal_id":"READY-R3","gross_minor":9000,"refund_tax_minor":0}');
 if not exists(select from affiliate_payments where payment_id='READYPAY' and refunded_gross_minor=10000 and refunded_eligible_minor=9000) then raise exception 'net/tax reconciliation failed';end if;
 perform affiliate_command(admin_id,'adjust',jsonb_build_object('id',a,'amount_minor',5000,'reason','ready due credit'));
 update affiliate_commissions set hold_until=now()-interval '1 day' where affiliate_id=a and payment_id is null;
 r:=affiliate_command(admin_id,'list');
 if r->'accounts'->0->>'available_minor'<>'5000' then raise exception 'admin list misses due pending balance';end if;
 perform affiliate_command(admin_id,'prepare_payout',jsonb_build_object('id',a,'reason','immutable batch test'));
 begin update affiliate_admin_audit set reason='rewritten';raise exception 'audit update allowed';exception when insufficient_privilege then null;end;
 begin delete from affiliate_admin_audit;raise exception 'audit deletion allowed';exception when insufficient_privilege then null;end;
 begin truncate affiliate_admin_audit;raise exception 'audit truncate allowed';exception when insufficient_privilege then null;end;
 begin update affiliate_payout_items set amount_minor=1;raise exception 'payout item changed';exception when insufficient_privilege then null;end;
 begin delete from affiliate_reversals;raise exception 'reversal deleted';exception when insufficient_privilege then null;end;
 begin update affiliate_referral_history set expires_at=now();raise exception 'history changed';exception when insufficient_privilege then null;end;
 begin insert into affiliate_admins(user_id) values(buyer);raise exception 'server self-provisioned admin';exception when insufficient_privilege then null;end;
 raise notice 'PASS: duplicate subscription/timestamp identity, cumulative refund tax, full tax-only+net refund reconciliation, due admin balances, immutable evidence and no service-role admin provisioning';
end $$;
reset role;
-- Defense in depth: even owner DML invokes the evidence guard (a DBA can deliberately alter DDL).
do $$begin
 begin update affiliate_admin_audit set reason='owner rewrite';raise exception 'owner update allowed';exception when others then if sqlerrm<>'Affiliate evidence is append-only' then raise;end if;end;
 if exists(select from pg_proc where pronamespace='public'::regnamespace and proname like 'affiliate_%' and prosecdef) then raise exception 'unexpected SECURITY DEFINER';end if;
 if exists(select from pg_class where relnamespace='public'::regnamespace and relname like 'affiliate_%' and relkind='r' and not relrowsecurity) then raise exception 'missing RLS';end if;
 raise notice 'PASS: owner evidence mutation guard, all affiliate tables RLS, no SECURITY DEFINER';
end $$;
rollback;
