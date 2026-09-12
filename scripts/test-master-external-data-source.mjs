import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
 LOCAL_MASTER_PUZZLES_BASE_URL,
 resolveMasterPuzzlesBaseUrl,
} from '../src/masterPuzzles/resolveBaseUrl.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const expectedRemote = 'https://lahzgtcpbshmzsqoqswf.supabase.co/storage/v1/object/public/master-puzzles/v1/v1'
const configuredRemote = process.env.VITE_MASTER_PUZZLES_BASE_URL

assert.equal(resolveMasterPuzzlesBaseUrl(`${expectedRemote}/`), expectedRemote)
assert.equal(resolveMasterPuzzlesBaseUrl(''), LOCAL_MASTER_PUZZLES_BASE_URL)
assert.equal(resolveMasterPuzzlesBaseUrl(undefined), LOCAL_MASTER_PUZZLES_BASE_URL)
if (configuredRemote) assert.equal(resolveMasterPuzzlesBaseUrl(configuredRemote), expectedRemote)

const masterTactics = await readFile(join(root, 'src/masterTactics/data.ts'), 'utf8')
const masterMates = await readFile(join(root, 'src/masterMates/data.ts'), 'utf8')
const dataSource = await readFile(join(root, 'src/masterPuzzles/dataSource.ts'), 'utf8')
const regularMateConfigs = await readFile(join(root, 'src/trainers/patternMate/pageConfigs.ts'), 'utf8')
const viteConfig = await readFile(join(root, 'vite.config.ts'), 'utf8')
const vercelIgnore = await readFile(join(root, '.vercelignore'), 'utf8')

assert.match(masterTactics, /requestMasterPuzzleData/)
assert.doesNotMatch(masterTactics, /['"]\/data\/master-puzzles\/v1/)
assert.doesNotMatch(masterTactics, /fetch\(/)
assert.match(masterMates, /requestMasterPuzzleData/)
assert.match(dataSource, /VITE_MASTER_PUZZLES_BASE_URL/)
assert.match(viteConfig, /excludeExternalMasterCorpus/)
assert.match(viteConfig, /VITE_MASTER_PUZZLES_BASE_URL/)
assert.match(viteConfig, /data\/master-puzzles/)
assert.match(vercelIgnore, /\/public\/data\/master-puzzles\//)
assert.doesNotMatch(regularMateConfigs, /masterPuzzles|VITE_MASTER_PUZZLES_BASE_URL/)

async function collectFiles(directory) {
 const result = []
 for (const entry of await readdir(directory, { withFileTypes: true })) {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) result.push(...await collectFiles(path))
  else result.push(path)
 }
 return result
}

const distRoot = join(root, 'dist')
if (process.argv.includes('--dist')) {
 assert.ok(existsSync(distRoot), 'Production dist must exist')
 assert.ok(!existsSync(join(distRoot, 'data/master-puzzles')), 'External build must not contain any Master runtime or archive corpus')
 const files = await collectFiles(distRoot)
 const javascriptFiles = files.filter((path) => path.endsWith('.js'))
 const javascript = (await Promise.all(javascriptFiles.map((path) => readFile(path, 'utf8')))).join('\n')
 assert.ok(javascript.includes(expectedRemote), 'Production JavaScript must contain the configured Supabase base URL')
 const sizes = await Promise.all(files.map(async (path) => (await stat(path)).size))
 console.log(JSON.stringify({ result: 'Master external data source and dist contract passed', distFiles: files.length, distBytes: sizes.reduce((sum, size) => sum + size, 0) }))
} else {
 console.log('Master external data source contract passed.')
}
