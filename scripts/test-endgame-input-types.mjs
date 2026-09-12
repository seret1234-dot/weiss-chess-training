import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {endgameTrainers,sharedLegacyTemplates} from './lib/endgame-trainer-inventory.mjs'
const baseline=process.env.ENDGAME_BEFORE_SNAPSHOT
assert.ok(baseline,'ENDGAME_BEFORE_SNAPSHOT must identify the pre-task audit snapshot')
const originals=[...endgameTrainers.map(x=>x[1]),...sharedLegacyTemplates]
const added=['src/trainers/endgame/EndgameAttempt.ts','src/trainers/endgame/useEndgameInput.tsx','src/trainers/endgame/EndgameTrainerShell.tsx']
const options={noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,allowSyntheticDefaultImports:true,resolveJsonModule:true,skipLibCheck:true,allowJs:true,checkJs:false,strict:false,types:['vite/client']}
function diagnostics(before){
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host)
 if(before)host.readFile=file=>{const relative=path.relative(process.cwd(),file).replaceAll('\\','/');return originals.includes(relative)?fs.readFileSync(path.join(baseline,relative),'utf8'):read(file)}
 const program=ts.createProgram([...originals,...(before?[]:added)],options,host)
 // TypeScript truncates object summaries by property count; adding a valid slot
 // changes that count without changing the underlying legacy diagnostic.
 return ts.getPreEmitDiagnostics(program).filter(d=>d.file&&[...originals,...added].includes(path.relative(process.cwd(),d.file.fileName).replaceAll('\\','/'))).map(d=>`${path.relative(process.cwd(),d.file.fileName)} ${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText,' ').replace(/\.\.\. \d+ more \.\.\./g,'... more ...')}`)
}
const before=diagnostics(true),after=diagnostics(false),remaining=[...before]
const introduced=after.filter(d=>{const i=remaining.indexOf(d);if(i>=0){remaining.splice(i,1);return false}return true})
assert.deepEqual(introduced,[],'no new scoped TypeScript diagnostics')
console.log(`PASS focused Endgames TypeScript: no new diagnostics; ${before.length} pre-existing diagnostics (${after.length} remaining), baseline compared without line-number noise`)
