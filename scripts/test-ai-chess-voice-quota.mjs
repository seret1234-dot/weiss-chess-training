// Disposable PostgreSQL ONLY. Never accepts a remote database URL.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync,execFile} from 'node:child_process'
import {promisify} from 'node:util'
const exe=process.env.VOICE_TEST_PSQL??'C:/Program Files/PostgreSQL/16/bin/psql.exe'
const args=['-h','127.0.0.1','-p','55487','-U','voice_test','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1']
const database=`voice_quota_${Date.now()}`
execFileSync(exe,[...args,'-c',`create database ${database};`],{stdio:'pipe'})
args[args.indexOf('-d')+1]=database
const sql=text=>execFileSync(exe,args,{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
sql(`do $$ begin if not exists(select from pg_roles where rolname='anon')then create role anon;end if;if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;if not exists(select from pg_roles where rolname='service_role')then create role service_role bypassrls;end if;end $$;create schema auth;create table auth.users(id uuid primary key);create table public.subscriptions(user_id uuid,status text,provider text,current_period_end timestamptz);grant select on public.subscriptions to service_role;insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,12)n;`)
sql(readFileSync('supabase/migrations-archive/20260909171217_chess_voice_quota.sql','utf8'))
function quota(n,reserve=false){return JSON.parse(sql(`set role service_role;select public.chess_voice_quota('${uid(n)}',${reserve});`).split('\n').at(-1))}
function service(text){return sql(`set role service_role;${text}`).split('\n').at(-1)}
assert.equal(quota(1).remaining,10)
sql(`insert into public.subscriptions values ('${uid(2)}','active','paypal',now()+interval '1 day'),('${uid(3)}','trialing','paypal',now()+interval '1 day'),('${uid(4)}','active','paypal',now()-interval '1 second'),('${uid(5)}','inactive','paypal',now()+interval '1 year'),('${uid(6)}','active','paypal',null),('${uid(7)}','active','manual',null);`)
for(const n of [2,3,7])assert.equal(quota(n).limit,2000)
for(const n of [1,4,5,6])assert.equal(quota(n).limit,10)
const first=quota(1,true);assert.equal(first.remaining,9);assert.equal(quota(1,true).code,'VOICE_RATE_LIMITED')
assert.equal(service(`select public.release_chess_voice_usage('${uid(1)}','${first.reservation_id}');`),'t');assert.equal(quota(1).remaining,10)
const second=quota(1,true);assert.equal(service(`select public.complete_chess_voice_usage('${uid(1)}','${second.reservation_id}');`),'t');assert.equal(quota(1).used,1)
assert.equal(service(`select public.release_chess_voice_usage('${uid(1)}','${second.reservation_id}');`),'f');assert.equal(service(`select public.complete_chess_voice_usage('${uid(1)}','${second.reservation_id}');`),'f')
sql(`insert into public.chess_voice_usage(user_id,status) select '${uid(8)}','succeeded' from generate_series(1,9);`)
const parallel=await Promise.all([1,2].map(()=>promisify(execFile)(exe,[...args,'-c',`set role service_role;select public.chess_voice_quota('${uid(8)}',true);`]).then(r=>JSON.parse(r.stdout.trim().split('\n').at(-1)))))
assert.equal(parallel.filter(x=>x.allowed).length,1,'concurrent reservations cannot exceed quota')
assert.equal(quota(8).remaining,0)
for(const role of ['anon','authenticated']){
 assert.throws(()=>sql(`set role ${role};select public.chess_voice_quota('${uid(1)}',true);`),/permission denied/)
 assert.throws(()=>sql(`set role ${role};select * from public.chess_voice_usage;`),/permission denied/)
 assert.throws(()=>sql(`set role ${role};insert into public.chess_voice_usage(user_id,status)values('${uid(1)}','succeeded');`),/permission denied/)
}
assert.equal(sql(`select relrowsecurity from pg_class where oid='public.chess_voice_usage'::regclass;`),'t')
assert.equal(sql(`select count(*) from pg_proc where proname in ('chess_voice_quota','complete_chess_voice_usage','release_chess_voice_usage') and prosecdef;`),'0')
const reset=quota(1).reset_at;assert.equal(new Date(reset).getUTCHours(),0)
sql(`insert into public.chess_voice_usage(user_id,status,created_at) values('${uid(9)}','succeeded',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '1 second'),('${uid(9)}','reserved',now()-interval '3 minutes');`)
assert.equal(quota(9).remaining,10,'prior UTC day and expired reservations do not consume today')
sql(`insert into public.chess_voice_usage(user_id,status)select '${uid(10)}','succeeded' from generate_series(1,10);insert into public.subscriptions values('${uid(11)}','active','paypal',now()+interval '1 day');insert into public.chess_voice_usage(user_id,status)select '${uid(11)}','succeeded' from generate_series(1,2000);insert into public.chess_voice_usage(user_id,status)select '${uid(12)}','released' from generate_series(1,30);`)
assert.equal(quota(10,true).code,'VOICE_QUOTA_EXCEEDED')
assert.equal(quota(11,true).code,'VOICE_QUOTA_EXCEEDED')
assert.equal(quota(12,true).code,'VOICE_RATE_LIMITED','failed attempts cannot fuel unlimited API calls')
assert.equal(quota(12).remaining,10,'abuse throttle does not spend successful-use quota')
console.log('PASS PostgreSQL voice quota: 10/2000, active/trialing/expired/inactive/manual semantics, concurrent last slot, UTC reset, idempotent completion/release, RLS and forbidden anon/authenticated access')
