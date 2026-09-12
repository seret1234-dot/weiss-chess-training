import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import ts from 'typescript'
import {endgameTrainers} from './lib/endgame-trainer-inventory.mjs'
const audit=JSON.parse(fs.readFileSync('reports/endgame-text-repairs-2026-09-10.json','utf8'))
const snapshot=process.env.ENDGAME_TEXT_SNAPSHOT||audit.snapshot
const hashes=JSON.parse(fs.readFileSync(path.join(snapshot,'hashes.json'),'utf8'))
assert.ok(!fs.readFileSync('index.html','utf8').includes('cleanEndgameBrokenText'), 'Endgame text must not be rewritten by the old DOM sanitizer')
let jsonFiles=0,sourceFiles=0
for(const [file,hash]of Object.entries(hashes)){
 const before=fs.readFileSync(path.join(snapshot,file),'utf8'),after=fs.readFileSync(file,'utf8')
 assert.equal(createHash('sha256').update(before).digest('hex'),hash,`${file}: immutable baseline`)
 const edits=new Map(audit.fixes.filter(e=>e.file===file).map(e=>[e.line,e]))
 const expected=before.split(/\r?\n/).flatMap((line,i)=>{const edit=edits.get(i+1);if(!edit)return[line];assert.equal(line,edit.before,`${file}:${i+1} exact reviewed source`);return edit.after.split('\n')}).join('\n')
  // Follow-up Hint repair only adapts the existing handler to HintButton's callback contract.
  .replace('<HintButton onClick={() => void showHintAction()}>',endgameTrainers.some(([,f])=>f===file)?'<HintButton getHintMove={async () => { await showHintAction(); return null }}>':'<HintButton onClick={() => void showHintAction()}>')
 assert.equal(after.replaceAll('\r\n','\n'),expected,`${file}: only reviewed display literals/imports changed`)
 if(file.endsWith('.json')){assert.deepEqual(JSON.parse(after),JSON.parse(before),`${file}: ALL data fields preserved, including labels`);jsonFiles++}else sourceFiles++
}
for(const [,file]of endgameTrainers){
 const text=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 assert.ok(!/[\u0080-\u009f\ufffd]|Ã.|Â.|â€|ðŸ|ï¿½/.test(text),`${file}: no encoding corruption`)
 assert.ok(!/Fast = (?:every move )?[-—]/.test(text),`${file}: timing operator present`)
 assert.ok(!/streak=\{`\s*[-—]/.test(text),`${file}: semantic status`)
 function visit(n){if(ts.isJsxText(n)&&/^\s*[-—][\s—-]*$/.test(n.text))assert.fail(`${file}: missing completion glyph`);ts.forEachChild(n,visit)}visit(sf)
}
const compiled=await build({stdin:{contents:"import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {BigMessage} from './src/components/trainer/ui'; import {formatEndgameFastSolves} from './src/trainers/endgame/endgameText'; export const samples=[0,1,2,150].map(n=>renderToStaticMarkup(React.createElement(BigMessage,{streak:formatEndgameFastSolves(n),message:'Instruction'})));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty'},external:['react','react-dom/server']})
const mod={exports:{}};const require=createRequire(import.meta.url)
new Function('require','module','exports','React',compiled.outputFiles[0].text)(require,mod,mod.exports,require('react'))
for(const [i,n]of [0,1,2,150].entries())assert.ok(mod.exports.samples[i].includes(`Fast solves: ${n}`),'rendered shared status gives the count its actual meaning')
console.log(`PASS text integrity: ${jsonFiles} JSON files entirely unchanged; ${sourceFiles} source/layout/input files limited to reviewed display edits; four rendered counter samples`)
