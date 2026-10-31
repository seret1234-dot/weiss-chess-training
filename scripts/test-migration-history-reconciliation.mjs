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
assert.equal(createHash('sha256').update(baseline).digest('hex'), '7654a52b5e3507eba931709dbb7a546a6ca423d5e513fbb0b9d63e316b038e27')
assert.doesNotMatch(baseline, /^COPY\s+public\./mi, 'baseline must contain no public-table data')
assert.doesNotMatch(baseline, /^INSERT\s+INTO\s+(?:public|auth)\./mi, 'baseline must contain no application or Auth rows')
const mapping = await readFile('supabase/MIGRATION_HISTORY_RECONCILIATION.md', 'utf8')
for (const file of archived) assert.match(mapping, new RegExp(file.replaceAll('.', '\\.'), 'u'), `${file} must be mapped`)
console.log('PASS: active migration chain is baseline plus approved additions; archived history is preserved and mapped')
