// Executes the additive started-at migration in a disposable local PostgreSQL
// cluster. It never uses Supabase credentials or customer data.
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'

const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/16/bin'
const dir = await mkdtemp(join(tmpdir(), 'weiss-auto-started-progress-'))
const port = await new Promise((resolve) => {
  const server = createServer()
  server.listen(0, '127.0.0.1', () => {
    const selected = server.address().port
    server.close(() => resolve(selected))
  })
})
const run = (name, args) => execFileSync(join(bin, `${name}.exe`), args, {
  encoding: 'utf8', windowsHide: true, timeout: 60_000,
  ...(name === 'pg_ctl' ? { stdio: 'ignore' } : {}),
})
const args = ['-h', '127.0.0.1', '-p', String(port), '-U', 'started_test', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']
const sql = (query) => run('psql', [...args, '-c', query]).trim()
const userA = '11111111-2222-4333-8444-555555555555'
const userB = '21111111-2222-4333-8444-555555555555'
let started = false

try {
  run('initdb', ['-D', dir, '-U', 'started_test', '--auth=trust', '--no-locale', '-E', 'UTF8'])
  started = true
  run('pg_ctl', ['-D', dir, '-l', join(dir, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'])
  sql(`create schema auth;
    create table auth.users(id uuid primary key);
    create table public.user_chunk_progress(
      user_id uuid not null references auth.users(id), trainer_key text not null,
      chunk_index integer not null, is_mastered boolean not null default false,
      mastered_puzzles_count integer not null default 0, next_review_at timestamptz,
      primary key (user_id, trainer_key, chunk_index)
    );
    insert into auth.users values ('${userA}'), ('${userB}');`)
  sql(await readFile('supabase/migrations/20261030201607_auto_chunk_started_progress.sql', 'utf8'))
  assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='user_chunk_progress' and column_name='started_at'"), '1')

  // Loader setup: null remains distinct from a learner-started chunk.
  sql(`insert into public.user_chunk_progress(user_id,trainer_key,chunk_index) values
    ('${userA}','tactic-bishop-fork-m2:m2-verified-final-v1',1),
    ('${userB}','tactic-bishop-fork-m2:m2-verified-final-v1',1);`)
  assert.equal(sql(`select count(*) from public.user_chunk_progress where user_id='${userA}' and started_at is null`), '1')

  // This is the durable write issued after chess.js accepts a legal move.
  sql(`update public.user_chunk_progress set started_at='2026-10-30T12:00:00Z'
    where user_id='${userA}' and trainer_key='tactic-bishop-fork-m2:m2-verified-final-v1' and chunk_index=1;`)
  // Each sql call is a new psql connection: this verifies refresh/re-fetch persistence.
  assert.equal(sql(`select to_char(started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from public.user_chunk_progress where user_id='${userA}' and trainer_key='tactic-bishop-fork-m2:m2-verified-final-v1'`), '2026-10-30T12:00:00Z')
  assert.equal(sql(`select count(*) from public.user_chunk_progress where user_id='${userB}' and started_at is null`), '1', 'another account stays untouched')

  // Completing keeps the normal completion/review evidence; restart clears only
  // the active account and current chunk back to an untouched row.
  sql(`update public.user_chunk_progress set is_mastered=true, mastered_puzzles_count=30, next_review_at='2026-11-06T12:00:00Z'
    where user_id='${userA}' and trainer_key='tactic-bishop-fork-m2:m2-verified-final-v1' and chunk_index=1;`)
  assert.equal(sql(`select is_mastered::text || ':' || mastered_puzzles_count::text from public.user_chunk_progress where user_id='${userA}'`), 'true:30')
  sql(`update public.user_chunk_progress set is_mastered=false, mastered_puzzles_count=0, next_review_at=null, started_at=null
    where user_id='${userA}' and trainer_key='tactic-bishop-fork-m2:m2-verified-final-v1' and chunk_index=1;`)
  assert.equal(sql(`select count(*) from public.user_chunk_progress where user_id='${userA}' and is_mastered=false and mastered_puzzles_count=0 and started_at is null`), '1')
  assert.equal(sql(`select count(*) from public.user_chunk_progress where user_id='${userB}' and is_mastered=false and started_at is null`), '1', 'the reset cannot affect another account')
  console.log('PASS: isolated PostgreSQL durable started marker distinguishes blank rows, survives re-fetch, preserves completion, and isolates accounts')
} finally {
  if (started) run('pg_ctl', ['-D', dir, '-w', 'stop'])
  console.log(`Isolated cluster stopped; diagnostic files retained at ${dir}`)
}
