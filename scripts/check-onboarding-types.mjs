import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const options = { noEmit:true, skipLibCheck:true, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022,
 module:ts.ModuleKind.ESNext, moduleResolution:ts.ModuleResolutionKind.Bundler, esModuleInterop:true,
 allowSyntheticDefaultImports:true, allowJs:true, strict:false, types:['vite/client'] }
function diagnostics(baseline) {
 const host = ts.createCompilerHost(options), read = host.readFile
 if (baseline) host.readFile = file => {
  const relative = path.relative(process.cwd(),file), previous = path.join(baseline,relative)
  return !relative.startsWith('..') && fs.existsSync(previous) ? fs.readFileSync(previous,'utf8') : read(file)
 }
 return ts.getPreEmitDiagnostics(ts.createProgram(['src/AppRouter.tsx'],options,host)).map(d =>
  `${path.relative(process.cwd(),d.file?.fileName??'')}: TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`).sort()
}
const current = diagnostics()
if (process.env.ONBOARDING_BASELINE) {
 const before = diagnostics(process.env.ONBOARDING_BASELINE)
 console.log('Baseline diagnostics:',before.length,'Current diagnostics:',current.length)
 const added = current.filter(item=>!before.includes(item))
 console.log(added.join('\n'))
 assert.deepEqual(added,[],'No new TypeScript diagnostics in the application graph')
} else { console.log(current.join('\n')); assert.equal(current.length,0) }
console.log('PASS onboarding TypeScript')
