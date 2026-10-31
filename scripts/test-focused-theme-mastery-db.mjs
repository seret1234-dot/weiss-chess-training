import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { createServer } from "node:net"

const bin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/16/bin"
const directory = await mkdtemp(join(tmpdir(), "weiss-focused-mastery-"))
const port = await new Promise((resolve) => {
  const server = createServer()
  server.listen(0, "127.0.0.1", () => {
    const selected = server.address().port
    server.close(() => resolve(selected))
  })
})
const run = (name, args) => execFileSync(join(bin, `${name}.exe`), args, { encoding: "utf8", windowsHide: true, timeout: 60_000, ...(name === "pg_ctl" ? { stdio: "ignore" } : {}) })
const query = (sql) => run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", "focused_test", "-d", "postgres", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql]).trim()
let started = false
try {
  run("initdb", ["-D", directory, "-U", "focused_test", "--auth=trust", "--no-locale", "-E", "UTF8"])
  started = true
  run("pg_ctl", ["-D", directory, "-l", join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"])
  query("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
  query(await readFile("supabase/migrations/20260729_add_curriculum_progress.sql", "utf8"))
  query(await readFile("supabase/migrations/20261031095131_focused_theme_mastery.sql", "utf8"))
  assert.equal(query("select array_to_string(perfect_chunk_indices, ',') from public.user_curriculum_theme_progress limit 1"), "", "new evidence is not backfilled into historical theme rows")
  assert.equal(query("select column_name from information_schema.columns where table_schema='public' and table_name='user_curriculum_session_evidence' and column_name='learner_chunk'"), "learner_chunk")
  assert.equal(query("select column_name from information_schema.columns where table_schema='public' and table_name='user_curriculum_theme_progress' and column_name='perfect_chunk_indices'"), "perfect_chunk_indices")
  assert.equal(query("select column_name from information_schema.columns where table_schema='public' and table_name='user_curriculum_theme_progress' and column_name='required_perfect_chunks'"), "required_perfect_chunks")
  console.log("PASS: focused theme mastery migration applies in isolated PostgreSQL without historical credit backfill")
} finally {
  if (started) run("pg_ctl", ["-D", directory, "-w", "stop"])
}
