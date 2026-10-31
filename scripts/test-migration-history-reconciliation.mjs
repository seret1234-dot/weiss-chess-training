import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

const activeDirectory = 'supabase/migrations'
const archiveDirectory = 'supabase/migrations-archive'
const active = (await readdir(activeDirectory)).filter(name => name.endsWith('.sql')).sort()
assert.deepEqual(active, [
  '20261030000000_synthetic_production_schema_baseline.sql',
  '20261030201607_auto_chunk_started_progress.sql',
  '20261031095131_focused_theme_mastery.sql',
])

const archived = (await readdir(archiveDirectory)).filter(name => name.endsWith('.sql')).sort()
assert.equal(archived.length, 29, 'all historical migrations must be archived')
const baseline = await readFile(`${activeDirectory}/${active[0]}`, 'utf8')
assert.match(baseline, /ACTIVE SYNTHETIC BOOTSTRAP BASELINE/)
assert.equal(createHash('sha256').update(baseline).digest('hex'), '303b9e5dac5d7f53378b7af32d6bb496aaee96435e99c29ea31ac38bde0a250c')
assert.doesNotMatch(baseline, /^COPY\s+public\./mi, 'baseline must contain no public-table data')
assert.doesNotMatch(baseline, /^INSERT\s+INTO\s+(?:public|auth)\./mi, 'baseline must contain no application or Auth rows')
const firstApplicationTable = baseline.indexOf('CREATE TABLE IF NOT EXISTS "public".')
const lastApplicationTable = baseline.lastIndexOf('CREATE TABLE IF NOT EXISTS "public".')
const defaultPrivilegePreamble = baseline.indexOf('REVOKE ALL ON %s FROM %I')
const finalDefaultPrivilegeRestore = baseline.lastIndexOf('GRANT ALL ON %s TO %I')
assert.match(baseline, /owner_role text := current_user/)
assert.match(baseline, /owner_role NOT IN \('postgres', 'supabase_admin'\)/)
assert.match(baseline, /ARRAY\['TABLES', 'SEQUENCES', 'FUNCTIONS'\]/)
assert.match(baseline, /ARRAY\['anon', 'authenticated', 'service_role'\]/)
assert.match(baseline, /ARRAY\['postgres', 'anon', 'authenticated', 'service_role'\]/)
assert.ok(defaultPrivilegePreamble >= 0 && defaultPrivilegePreamble < firstApplicationTable, 'restrictive executor defaults must precede application tables')
assert.ok(finalDefaultPrivilegeRestore > lastApplicationTable, 'executor defaults must be restored after application tables')
const mapping = await readFile('supabase/MIGRATION_HISTORY_RECONCILIATION.md', 'utf8')
for (const file of archived) assert.match(mapping, new RegExp(file.replaceAll('.', '\\.'), 'u'), `${file} must be mapped`)
console.log('PASS: active migration chain is baseline plus approved additions; archived history is preserved and mapped')
