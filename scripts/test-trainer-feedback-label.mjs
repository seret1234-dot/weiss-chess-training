import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright'
import ts from 'typescript'

// Audit every JSX producer, including legacy trainers: counters, threshold
// settings and help prose are not the standalone speed badge being removed.
const consumers = []
async function audit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`
    if (entry.isDirectory()) await audit(file)
    else if (/\.[jt]sx$/.test(file)) {
      const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = node => {
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'BigMessage') {
          consumers.push(file)
          const streak = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'streak')
          assert.doesNotMatch(streak?.initializer?.getText(source) ?? '', /\bFast(?:\s+\$\{|\s*['"`])/, `${file}: no standalone Fast speed badge`)
          if (/pattern(?:Mate|Tactic)\/Pattern/.test(file)) assert.equal(streak, undefined, `${file}: instruction-only shared feedback covers all themes and Master wrappers`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
}
await audit('src')
assert.ok(consumers.length >= 20, 'whole-codebase shared feedback inventory is covered')

// Render the actual shared component, without mounting any trainer or changing
// training state. Check both removed-row geometry and retained genuine counters.
const bundle = await build({ entryPoints: ['src/components/trainer/ui.tsx'], bundle: true, write: false, outfile: 'feedback.cjs',
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs')).text)(createRequire(import.meta.url), module, module.exports)
const { BigMessage } = module.exports
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  async function render(props) {
    const markup = renderToStaticMarkup(React.createElement(BigMessage, props))
    await page.setContent(`<section>${markup}<button>Next Puzzle</button></section>`)
    return page.locator('[role="status"]').evaluate(element => ({
      children: element.children.length,
      text: element.textContent,
      instructionOffset: element.lastElementChild.getBoundingClientRect().top - element.getBoundingClientRect().top,
      height: element.getBoundingClientRect().height,
      nextTop: element.nextElementSibling.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
    }))
  }
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const baseline = await render({ streak: 'Fast', message: 'Find the mate in 1' })
    for (const message of ['Find the mate in 1', 'Find the tactic', 'Find move 2 of 2', 'Correct', 'Correct, but slow', 'Wrong, silent error', 'Wrong move — try again.']) {
      const actual = await render({ message })
      assert.equal(actual.text, message)
      assert.equal(actual.children, 1, 'no empty badge element remains')
      assert.equal(actual.instructionOffset, 4, 'instruction starts at normal container padding, with no badge gap')
      assert.ok(actual.instructionOffset < baseline.instructionOffset)
      assert.ok(actual.nextTop >= actual.bottom, 'following controls do not overlap feedback')
    }
    for (const streak of [undefined, null, '']) assert.equal((await render({ streak, message: 'Instruction' })).children, 1)
    for (const streak of [0, '🔥 3', 'Fast solves: 2', '1.4s']) {
      const actual = await render({ streak, message: 'Instruction' })
      assert.equal(actual.children, 2, 'real streak/count/time content is preserved')
      assert.equal(actual.text, `${streak}Instruction`)
    }
  }
  console.log(`PASS feedback label: ${consumers.length} shared consumers audited; standalone Fast badge absent; instruction moves up with no empty row; feedback, counters and controls preserved at desktop/laptop/mobile sizes`)
} finally { await browser.close() }

if (process.argv.includes('--types')) {
  const baseline = process.env.FEEDBACK_BEFORE_SNAPSHOT
  assert.ok(baseline, 'provide the pre-edit three-file snapshot for TypeScript comparison')
  const changed = ['src/components/trainer/ui.tsx', 'src/trainers/patternMate/PatternMateTrainer.tsx', 'src/trainers/patternTactic/PatternTacticTrainer.tsx']
  const options = { noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    allowSyntheticDefaultImports: true, resolveJsonModule: true, skipLibCheck: true,
    allowJs: true, checkJs: false, strict: false, types: ['vite/client'] }
  const originals = new Map(await Promise.all(changed.map(async file => [resolve(file), await readFile(resolve(baseline, file.split('/').at(-1)), 'utf8')])))
  function check(before) {
    const host = ts.createCompilerHost(options), read = host.readFile.bind(host)
    if (before) host.readFile = file => originals.get(resolve(file)) ?? read(file)
    const program = ts.createProgram(['src/main.tsx'], options, host)
    return ts.getPreEmitDiagnostics(program).map(d => `${d.file?.fileName ?? 'global'} ${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').replace(/\.\.\. \d+ more \.\.\./g, '... more ...')}`)
  }
  const before = check(true), after = check(false), remaining = [...before]
  const added = after.filter(d => { const i = remaining.indexOf(d); if (i < 0) return true; remaining.splice(i, 1); return false })
  assert.deepEqual(added, [], 'no new TypeScript diagnostics relative to the pre-edit worktree')
  console.log(`PASS TypeScript comparison: ${before.length} before / ${after.length} after; zero new diagnostics`)
}
