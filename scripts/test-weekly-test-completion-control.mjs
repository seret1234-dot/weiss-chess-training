import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { StaticRouter } = require('react-router-dom')
const bundle = await build({ entryPoints: ['src/components/AutoTrainingController.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external' })
const loaded = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, loaded, loaded.exports)
const render = (location, user = { id: 'test-user' }) => renderToStaticMarkup(React.createElement(StaticRouter, { location }, React.createElement(loaded.exports.default, { user })))

for (const path of ['/play-computer', '/play-vs-computer']) {
  assert.equal(render(`${path}?weekly=1&auto=1`), '', 'weekly test renders neither button nor placeholder')
  assert.equal(render(`${path}?weekly=1`), '')
  assert.equal(render(`${path}?auto=1`), '')
  assert.equal(render(`${path}?auto=1&weekly=0`), '')
}
assert.equal(render('/mates/m1/back-rank?auto=1'), '')
assert.equal(render('/play-computer?endgameTransfer=1&auto=1'), '')
assert.equal(render('/mates/m1/back-rank?auto=1', null), '')
const source = await readFile('src/components/AutoTrainingController.tsx', 'utf8')
assert.match(source, /window.addEventListener\(AUTO_TRAINING_COMPLETE_EVENT/, 'automatic completion handler remains mounted')
assert.match(source, /navigate\("\/auto\?continue=1", \{ replace: true \}\)/)
console.log('PASS: All Weekly/ordinary/Master/endgame controls absent with no placeholder; automatic completion wiring preserved')
