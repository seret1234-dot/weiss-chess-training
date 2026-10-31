import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithEsbuild } from 'vite'

const moduleUrl = new URL('../src/openings/libraryData.ts', import.meta.url)
const source = await readFile(moduleUrl, 'utf8')
const transformed = await transformWithEsbuild(source, moduleUrl.pathname, { loader: 'ts', format: 'esm', target: 'es2022' })
const library = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`)

class Query {
  constructor(client, table) { this.client = client; this.table = table; this.calls = [] }
  select(...args) { this.calls.push(['select', ...args]); return this }
  eq(...args) { this.calls.push(['eq', ...args]); return this }
  order(...args) { this.calls.push(['order', ...args]); return this }
  range(...args) { this.calls.push(['range', ...args]); return this }
  maybeSingle() { this.calls.push(['maybeSingle']); return this }
  upsert(...args) { this.calls.push(['upsert', ...args]); return this }
  delete() { this.calls.push(['delete']); return this }
  then(resolve, reject) {
    this.client.queries.push({ table: this.table, calls: this.calls })
    return Promise.resolve(this.client.responses.shift() ?? { data: [], count: 0, error: null }).then(resolve, reject)
  }
}
class FakeClient {
  constructor(responses = []) { this.responses = [...responses]; this.queries = []; this.rpcCalls = [] }
  from(table) { return new Query(this, table) }
  async rpc(name, args) { this.rpcCalls.push({ name, args }); return this.responses.shift() ?? { data: [], error: null } }
}

const id1 = '0004fd85-87f9-4203-bfed-e1d22199bb35'
const id2 = '0010d711-2281-446a-a068-5b2e11c82b08'

const countClient = new FakeClient([{ count: 17, error: null }])
assert.equal(await library.getSavedOpeningCount(countClient, 'user-a'), 17)

const idsClient = new FakeClient([{ data: [{ opening_id: id1 }, { opening_id: id2 }], error: null }])
assert.deepEqual(await library.getSavedOpeningIds(idsClient, 'user-a'), [id1, id2])
assert.deepEqual(idsClient.queries[0].calls.at(-1), ['range', 0, 999])

const savedClient = new FakeClient([{ data: { opening_id: id1 }, error: null }])
assert.equal(await library.isOpeningSaved(savedClient, 'user-a', id1), true)

const addClient = new FakeClient([{ error: null }, { error: null }])
await library.addOpeningToLibrary(addClient, 'user-a', id1)
await library.addOpeningToLibrary(addClient, 'user-a', id1)
for (const query of addClient.queries) {
  const call = query.calls.find(([method]) => method === 'upsert')
  assert.deepEqual(call[1], { user_id: 'user-a', opening_id: id1 })
  assert.deepEqual(call[2], { onConflict: 'user_id,opening_id', ignoreDuplicates: true })
}

const removeClient = new FakeClient([{ error: null }, { error: null }])
await library.removeOpeningFromLibrary(removeClient, 'user-a', id1)
await library.removeOpeningFromLibrary(removeClient, 'user-a', id1)
assert.ok(removeClient.queries.every((query) => query.calls.some(([method]) => method === 'delete')))

const pageClient = new FakeClient([{
  data: [{ opening_id: id1, added_at: '2026-09-06T12:00:00Z', opening_line: { id: id1, slug: 'sicilian-line', name: 'Sicilian Line', family: 'Sicilian Defense', family_slug: 'sicilian-defense', variation: 'Najdorf', eco: 'B90', ply_count: 16 } }],
  count: 31,
  error: null,
}])
const page = await library.fetchSavedOpeningsPage(pageClient, 'user-a', 2, 30)
assert.equal(page.total, 31)
assert.equal(page.openings[0].familySlug, 'sicilian-defense')
assert.deepEqual(pageClient.queries[0].calls.filter(([method]) => method === 'order'), [
  ['order', 'added_at', { ascending: false }],
  ['order', 'opening_id', { ascending: false }],
])
assert.deepEqual(pageClient.queries[0].calls.at(-1), ['range', 30, 59])

const nextClient = new FakeClient([{ data: [{ id: id2, slug: 'next-line' }], error: null }])
assert.deepEqual(await library.getNextSavedOpening(nextClient, id1), { id: id2, slug: 'next-line' })
assert.deepEqual(nextClient.rpcCalls, [{ name: 'next_user_opening', args: { p_current_opening_id: id1 } }])

await assert.rejects(() => library.addOpeningToLibrary(addClient, '', id1), /Log in/)
await assert.rejects(() => library.addOpeningToLibrary(addClient, 'user-a', 'not-a-uuid'), /Invalid opening/)

const [migration, router, trainer, libraryPage, practicePage, searchPage] = await Promise.all([
  readFile(new URL('../supabase/migrations-archive/20260905215331_secure_user_opening_library.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/AppRouter.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/OpeningTrainerPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/openings/MyOpeningsPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/openings/MyOpeningsPracticePage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/OpeningsLibraryPage.tsx', import.meta.url), 'utf8'),
])

assert.match(migration, /primary key \(user_id, opening_id\)/i)
assert.match(migration, /opening_id uuid/i)
assert.match(migration, /references public\.opening_lines\(id\) on delete cascade/i)
assert.equal((migration.match(/create policy [\s\S]*?to authenticated/g) ?? []).length, 3)
assert.ok((migration.match(/\(select auth\.uid\(\)\)/g) ?? []).length >= 4)
assert.match(migration, /revoke all on table public\.user_opening_library from anon, authenticated/i)
assert.match(migration, /grant select, insert, delete on table public\.user_opening_library to authenticated/i)
assert.match(migration, /security invoker/i)
assert.doesNotMatch(migration, /security definer/i)
assert.match(router, /path="\/openings\/my-openings"/)
assert.match(router, /path="\/openings\/my-openings\/practice"/)
assert.ok(router.indexOf('path="/openings/my-openings"') < router.indexOf('path="/openings/:openingId"'))
assert.match(trainer, /Add to My Openings/)
assert.match(trainer, /Remove from My Openings/)
assert.match(trainer, /rememberTrainingReturnTarget\(target\)/)
assert.match(trainer, /Next saved opening/)
assert.match(libraryPage, /OPENING_LIBRARY_PAGE_SIZE/)
assert.match(libraryPage, /Removing a bookmark never removes mastery or review progress/)
assert.match(practicePage, /getNextSavedOpening/)
assert.match(searchPage, /My Openings \(\$\{savedCount\.toLocaleString\(\)\}\)/)

for (const candidate of [source, trainer, libraryPage, practicePage]) {
  assert.doesNotMatch(candidate, /\.from\(['"]training_progress['"]\)\s*\.delete/s)
  assert.doesNotMatch(candidate, /localStorage.*(?:library|bookmark)/i)
}

console.log('PASS: My Openings uses canonical UUIDs, owner-scoped Supabase rows, idempotent writes, newest-first 30/page pagination, saved-only practice, and bookmark-only removal')
