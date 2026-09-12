// Executes the ACTUAL migration in a disposable local PostgreSQL cluster.
// No Supabase URL, credentials or production account is used.
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/16/bin'
const dir = await mkdtemp(join(tmpdir(), 'weiss-auto-quota-'))
const port = await new Promise(resolve => { const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))}) })
const run=(name,args)=>execFileSync(join(bin,name+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:60000, ...(name==='pg_ctl'?{stdio:'ignore'}:{})})
const args=['-h','127.0.0.1','-p',String(port),'-U','quota_test','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1']
const sql=q=>run('psql',[...args,'-c',q]).trim()
const user='11111111-2222-4333-8444-555555555555', other='21111111-2222-4333-8444-555555555555'
const prefix=id=>`set role authenticated; set request.jwt.claim.sub='${id}'; `
const claim=(course,key,unit,items=[])=>`select public.claim_auto_training_chunk('${course}','${key}','${unit}',array[${items.map(x=>`'${x}'`).join(',')}]::text[]);`
const take=(course,key,unit,items=[],id=user)=>JSON.parse(sql(prefix(id)+claim(course,key,unit,items)))
let started=false
try {
 run('initdb',['-D',dir,'-U','quota_test','--auth=trust','--no-locale','-E','UTF8'])
 started=true
 run('pg_ctl',['-D',dir,'-l',join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'])
 sql(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.subscriptions(user_id uuid,status text,current_period_end timestamptz,provider text);
 create table public.user_chunk_progress(user_id uuid,trainer_key text,chunk_index integer,is_mastered boolean,mastered_puzzles_count integer,next_review_at timestamptz);
 create table public.training_progress(user_id uuid,course text,theme text,item_id text,mastery integer,next_review_at timestamptz);
 insert into auth.users values('${user}'),('${other}');`)
 sql(await readFile('supabase/migrations/20260911124113_auto_training_chunk_allowance.sql','utf8'))
 assert.throws(()=>sql(claim('pattern','tactic-fork','1')),/AUTH_REQUIRED/)
 assert.throws(()=>sql('set role anon; '+claim('pattern','tactic-fork','1')),/permission denied/)
 let q=take('pattern','tactic-fork','1'); assert.equal(q.used,1);assert.equal(q.remaining,1)
 q=take('openings','opening:italian','1-1',['1-1']);assert.equal(q.used,2);assert.equal(q.allowed,true)
 assert.equal(take('openings','opening:italian','1-2',['1-2']).allowed,false)
 assert.equal(take('master_games','731','1-1',['1-1']).allowed,false)
 assert.equal(take('pattern','tactic-fork','1').used,2) // refresh / another tab
 sql(`insert into public.user_chunk_progress values('${user}','tactic-review',1,true,30,now()-interval '1 day');`)
 q=take('pattern','tactic-review','1');assert.equal(q.allowed,true);assert.equal(q.used,2);assert.equal(q.reason,'ALREADY_UNLOCKED')
 assert.equal(take('pattern','next-new','1').allowed,false) // after due review
 sql(`insert into public.user_chunk_progress values('${user}','back-rank-mate-1',7,true,30,now()-interval '1 day');`)
 assert.equal(take('pattern','back-rank-mate-1:full-precut-v1','7').reason,'ALREADY_UNLOCKED')
 assert.equal(take('pattern','back-rank-mate-1:full-precut-v1','1').reason,'ALREADY_UNLOCKED') // existing completion credit
 assert.equal(take('pattern','back-rank-mate-1:full-precut-v1','2').allowed,false)
 sql(`alter table public.user_chunk_progress add column next_due_at timestamptz;
 insert into public.user_chunk_progress(user_id,trainer_key,chunk_index,is_mastered,mastered_puzzles_count,next_due_at) values('${user}','arabian-mate-1',0,false,0,now()-interval '1 day');`)
 assert.equal(take('pattern','arabian-mate-1:full-precut-v1','1').reason,'ALREADY_UNLOCKED')
 sql(`insert into public.user_chunk_progress(user_id,trainer_key,chunk_index,is_mastered,mastered_puzzles_count) values('${user}','smothered-mate-1:m1-v1',4,true,30);`)
 assert.equal(take('pattern','smothered-mate-1:full-precut-v1','1').reason,'ALREADY_UNLOCKED')
 assert.equal(take('pattern','smothered-mate-1:full-precut-v1','2').allowed,false)
 sql(`insert into public.training_progress values('${user}','master_games','saved-game','1-3',5,now()-interval '1 day');`)
 assert.equal(take('master_games','saved-game','1-3',['1-3']).used,2)
 // A prefetch/empty loader row does NOT grant a free unlock.
 sql(`insert into public.user_chunk_progress(user_id,trainer_key,chunk_index,is_mastered,mastered_puzzles_count) values('${user}','empty-row',1,false,0);`)
 assert.equal(take('pattern','empty-row','1').allowed,false)
 assert.equal(take('pattern','other-account','1',[],other).used,1)
 // Simulate yesterday's durable charges; no browser timer/day argument exists.
 sql(`update public.auto_training_chunk_unlocks set charged_on=(now() at time zone 'UTC')::date-1 where user_id='${user}' and charged_on is not null;`)
 assert.equal(take('pattern','tactic-fork','1').used,0) // finish midnight-straddling chunk, no new charge
 assert.equal(take('master_games','731','1-1',['1-1']).used,1)
 assert.equal(take('master_games','731','1-2',['1-2']).used,2) // segments, NOT whole game
 assert.equal(take('master_games','731','1-3',['1-3']).allowed,false)
 sql(`insert into subscriptions values('${user}','active',now()+interval '1 day','paypal');`)
 assert.equal(take('pattern','premium-new','1').reason,'PREMIUM')
 sql(`update subscriptions set current_period_end=now()-interval '1 day';`)
 assert.equal(take('pattern','expired-new','1').allowed,false)
 assert.equal(take('pattern','premium-new','1').allowed,true) // previously unlocked while Premium
 // Independent connections race for one remaining daily slot.
 const exec=promisify(execFile)
 const raced=await Promise.all(Array.from({length:5},(_,i)=>exec(join(bin,'psql.exe'),[...args,'-c',prefix(other)+claim('endgame','kpk','chunk-'+i)],{windowsHide:true}).then(r=>JSON.parse(r.stdout.trim()))))
 assert.equal(raced.filter(r=>r.allowed).length,1)
 assert.equal(sql(prefix(other)+`select count(*) from public.auto_training_chunk_unlocks;`),'2') // RLS ownership
 assert.throws(()=>sql(prefix(user)+`delete from public.auto_training_chunk_unlocks;`),/permission denied/)
 assert.throws(()=>sql(prefix(user)+`insert into public.auto_training_chunk_unlocks(user_id,course,trainer_key,unit_key) values('${user}','pattern','bypass','1');`),/permission denied/)
 assert.equal(sql(`select relrowsecurity from pg_class where oid='public.auto_training_chunk_unlocks'::regclass;`),'t')
 console.log('PASS: real PostgreSQL quota, UTC rollover, stages, due/unlocked reviews, concurrency, Premium/expiry, ownership/RLS and denied writes')
 if(process.env.TEST_EXISTING_VOICE_QUOTA==='1'){
  // Reuse the unchanged legacy SQL assertions in this isolated cluster instead
  // of requiring its normally hard-coded, separately running port 55487.
  const voice=(await readFile('scripts/test-ai-chess-voice-quota.mjs','utf8')).replace("'55487'",JSON.stringify(String(port))).replace("'voice_test'","'quota_test'")
  await import('data:text/javascript;base64,'+Buffer.from(voice).toString('base64'))
 }
} finally {
 if(started)run('pg_ctl',['-D',dir,'-w','stop'])
 console.log('Isolated cluster stopped; diagnostic files retained at '+dir)
}
