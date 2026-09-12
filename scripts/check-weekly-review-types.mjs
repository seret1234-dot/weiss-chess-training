import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

// Include both activity trainers in BOTH graphs now Auto reads their readiness.
// Master catalog types now also reach Pattern trainers. Include those unchanged
// trainers in BOTH graphs so existing diagnostics are compared like-for-like.
const roots = ['src/pages/analyze/AnalyzeBoardPage.tsx', 'src/pages/PlayComputerPage.tsx', 'src/pages/AutoStudyPage.tsx', 'src/OpeningTrainerPage.tsx', 'src/MasterGamesPage.tsx', 'src/trainers/patternMate/PatternMateTrainer.tsx', 'src/trainers/patternTactic/PatternTacticTrainer.tsx']
const options = { noEmit: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
 module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, esModuleInterop: true, allowSyntheticDefaultImports: true,
 allowJs: true, strict: false, types: ['vite/client'] }
function diagnostics(baseline) {
 const host = ts.createCompilerHost(options), read = host.readFile
 if (baseline) host.readFile = file => {
  const relative = path.relative(process.cwd(), file), historical = path.join(baseline, relative)
  return !relative.startsWith('..') && fs.existsSync(historical) ? fs.readFileSync(historical, 'utf8') : read(file)
 }
 const program = ts.createProgram(roots, options, host)
 return ts.getPreEmitDiagnostics(program).map(d => `${path.relative(process.cwd(), d.file?.fileName ?? '')}: TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`).sort()
}
const current = diagnostics()
if (process.env.WEEKLY_REVIEW_BASELINE) {
 const before = diagnostics(process.env.WEEKLY_REVIEW_BASELINE)
 console.log('Baseline diagnostics:', before.length, 'Current diagnostics:', current.length)
 console.log(current.join('\n'))
 assert.deepEqual(current.filter(item => !before.includes(item)), [], 'No new TypeScript diagnostics')
} else { console.log(current.join('\n')); assert.equal(current.length, 0) }
console.log('PASS focused TypeScript: no new diagnostics')
