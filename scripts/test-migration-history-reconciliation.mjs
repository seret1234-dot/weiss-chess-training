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
assert.equal(createHash('sha256').update(baseline).digest('hex'), '05637a73c6f6e781e8d637acf01d0fbdca32f714bbfbfb29e89b12b7da82abae')
assert.doesNotMatch(baseline, /^COPY\s+public\./mi, 'baseline must contain no public-table data')
assert.doesNotMatch(baseline, /^INSERT\s+INTO\s+(?:public|auth)\./mi, 'baseline must contain no application or Auth rows')
const firstApplicationTable = baseline.indexOf('CREATE TABLE IF NOT EXISTS "public".')
const lastApplicationTable = baseline.lastIndexOf('CREATE TABLE IF NOT EXISTS "public".')
for (const objectType of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const revoke = baseline.indexOf(`REVOKE ALL ON ${objectType} FROM "${role}"`)
    const grant = baseline.lastIndexOf(`GRANT ALL ON ${objectType} TO "${role}"`)
    assert.ok(revoke >= 0 && revoke < firstApplicationTable, `restrictive ${objectType} defaults for ${role} must precede application tables`)
    assert.ok(grant > lastApplicationTable, `Production ${objectType} defaults for ${role} must be restored after application tables`)
  }
}
const mapping = await readFile('supabase/MIGRATION_HISTORY_RECONCILIATION.md', 'utf8')
for (const file of archived) assert.match(mapping, new RegExp(file.replaceAll('.', '\\.'), 'u'), `${file} must be mapped`)
console.log('PASS: active migration chain is baseline plus approved additions; archived history is preserved and mapped')
