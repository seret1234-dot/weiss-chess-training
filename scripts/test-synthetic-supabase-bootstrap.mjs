// Rebuilds the schema-only production snapshot in disposable PostgreSQL.
// It uses no Supabase credentials, customer rows, or Auth identities.
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { createServer } from "node:net"

const bin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/16/bin"
const directory = await mkdtemp(join(tmpdir(), "weiss-synthetic-bootstrap-"))
const port = await new Promise(resolve => { const server = createServer(); server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)) }) })
const run = (name, args, options = {}) => execFileSync(join(bin, `${name}.exe`), args, { encoding: "utf8", windowsHide: true, timeout: 120_000, ...options })
const psqlAs = (user, args) => run("psql", ["-h", "127.0.0.1", "-p", String(port), "-U", user, "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", ...args])
const psql = (args) => psqlAs("bootstrap_test", args)
let started = false
try {
  run("initdb", ["-D", directory, "-U", "bootstrap_test", "--auth=trust", "--no-locale", "-E", "UTF8"])
  started = true
  run("pg_ctl", ["-D", directory, "-l", join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { stdio: "ignore" })
  psql(["-c", `create role postgres superuser login; create role supabase_admin superuser login; create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema extensions; create extension pgcrypto with schema public; create extension pg_trgm with schema public; create extension unaccent with schema extensions;`])
  // Production is PostgreSQL 17; the installed disposable cluster is 16 and
  // does not recognize PostgreSQL 17's MAINTAIN privilege. The snapshot stays
  // byte-for-byte intact; only the temporary validator copy omits that grant.
  const snapshot = await readFile("supabase/migrations/20261030000000_synthetic_production_schema_baseline.sql", "utf8")
  const localSnapshot = join(directory, "production-public-schema.local.sql")
  await writeFile(localSnapshot, snapshot.replaceAll(",MAINTAIN", ""))
  psqlAs("postgres", ["-f", localSnapshot])
  psqlAs("postgres", ["-f", "supabase/migrations/20261030201607_auto_chunk_started_progress.sql"])
  psqlAs("postgres", ["-f", "supabase/migrations/20261031095131_focused_theme_mastery.sql"])

  const scalar = (sql) => psql(["-t", "-A", "-c", sql]).trim()
  assert.equal(scalar("select count(*) from information_schema.tables where table_schema='public' and table_name in ('user_auto_profile','user_chunk_progress','user_curriculum_state','user_curriculum_theme_progress','user_curriculum_session_evidence')"), "5")
  assert.equal(scalar("select count(*) from information_schema.columns where table_schema='public' and ((table_name='user_chunk_progress' and column_name='started_at') or (table_name='user_curriculum_session_evidence' and column_name='learner_chunk') or (table_name='user_curriculum_theme_progress' and column_name in ('perfect_chunk_indices','required_perfect_chunks')))"), "4")
  assert.equal(scalar("select count(*) from pg_policies where schemaname='public' and tablename='user_auto_profile'"), "4")
  assert.equal(scalar("select count(*) from pg_indexes where schemaname='public' and indexname in ('user_chunk_progress_resumable_lookup_idx','user_curriculum_session_focused_chunk_idx')"), "2")
  assert.equal(scalar("select count(*) from pg_trigger where tgrelid='public.user_auto_profile'::regclass and not tgisinternal"), "1")

  // Hosted branch provisioning executes the baseline as supabase_admin, then
  // transfers each snapshot object to postgres. Exercise both default-ACL DO
  // blocks under that exact creator role in an isolated probe schema.
  const aclBlocks = [...snapshot.matchAll(/DO \$\$[\s\S]*?END \$\$;/g)].map(match => match[0])
  assert.equal(aclBlocks.length, 2, "baseline must have executor-scoped default-ACL preamble and restore blocks")
  const hostedProbeDirectory = join(directory, "hosted-default-acl-probe")
  const hostedPreamble = join(hostedProbeDirectory, "preamble.sql")
  const hostedRestore = join(hostedProbeDirectory, "restore.sql")
  await mkdir(hostedProbeDirectory)
  await writeFile(hostedPreamble, aclBlocks[0].replaceAll("SCHEMA public", "SCHEMA grant_probe"))
  await writeFile(hostedRestore, aclBlocks[1].replaceAll("SCHEMA public", "SCHEMA grant_probe"))
  psqlAs("supabase_admin", ["-c", "create schema grant_probe authorization supabase_admin"])
  psqlAs("supabase_admin", ["-f", hostedPreamble])
  psqlAs("supabase_admin", ["-c", "create table grant_probe.hosted_creator_probe(id integer primary key); alter table grant_probe.hosted_creator_probe owner to postgres"])
  const hostedScalar = (sql) => psqlAs("bootstrap_test", ["-t", "-A", "-c", sql]).trim()
  assert.equal(hostedScalar("select count(*) from unnest(array['anon','authenticated','service_role']) role where has_table_privilege(role, 'grant_probe.hosted_creator_probe', 'TRUNCATE') or has_table_privilege(role, 'grant_probe.hosted_creator_probe', 'TRIGGER') or has_table_privilege(role, 'grant_probe.hosted_creator_probe', 'REFERENCES')"), "0")
  psqlAs("supabase_admin", ["-f", hostedRestore])
  psqlAs("bootstrap_test", ["-c", "drop schema grant_probe cascade"])
  console.log("PASS: synthetic Production schema bootstrap plus started and focused mastery migrations")
} finally {
  if (started) run("pg_ctl", ["-D", directory, "-w", "stop"], { stdio: "ignore" })
  console.log(`Isolated cluster stopped; diagnostic files retained at ${directory}`)
}
