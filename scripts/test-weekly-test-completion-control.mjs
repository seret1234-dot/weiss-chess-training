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
  assert.match(render(`${path}?auto=1`), /Finish drill &amp; continue/, 'ordinary automatic training keeps its control')
  assert.match(render(`${path}?auto=1&weekly=0`), /Finish drill &amp; continue/)
}
assert.match(render('/mates/m1/back-rank?auto=1'), /Finish drill &amp; continue/)
assert.match(render('/play-computer?endgameTransfer=1&auto=1'), /Finish drill &amp; continue/)
assert.equal(render('/mates/m1/back-rank?auto=1', null), '')
const source = await readFile('src/components/AutoTrainingController.tsx', 'utf8')
assert.ok(source.indexOf('window.addEventListener(AUTO_TRAINING_COMPLETE_EVENT') < source.indexOf('params.get("weekly")'), 'weekly UI guard does not bypass the existing completion-event effect')
assert.match(source, /navigate\("\/auto\?continue=1", \{ replace: true \}\)/)
console.log('PASS: Weekly test CTA absent with no placeholder; ordinary/endgame drill controls and automatic completion wiring preserved')
