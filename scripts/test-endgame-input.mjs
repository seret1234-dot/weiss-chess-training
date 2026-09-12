import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import ts from 'typescript'
import { endgameTrainers, sharedLegacyTemplates, dormantEndgameComponents, endgameTextRoots, endgameTextFiles, corruptedEndgameText } from './lib/endgame-trainer-inventory.mjs'
const compiled=await build({entryPoints:['src/trainers/endgame/EndgameAttempt.ts'],bundle:true,write:false,platform:'node',format:'cjs'})
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)
const {EndgameAttempt}=module.exports
const a=new EndgameAttempt();a.begin('one');assert.equal(a.qualify(true),true)
a.begin('one');a.silentError();assert.equal(a.qualify(true),false,'Silent error prevents fast credit')
a.begin('one');a.wrongMove();a.begin('one');assert.equal(a.qualify(true),false,'retry cannot erase a wrong answer')
a.begin('two');assert.equal(a.qualify(true),true,'next exercise has a fresh attempt')
a.begin('two');assert.equal(a.qualify(false),false,'existing slow-move qualification is preserved')
a.begin('three');a.voiceMove(100000,1900,9000,109000)
assert.equal(a.elapsed(100000,115000),1900,'API/engine delay does not inflate speech-start reaction')
assert.equal(a.elapsed(110000,112000),2000,'next learner timer has no stale voice offset')
a.mouseMove();assert.equal(a.elapsed(100000,115000),15000,'mouse timing is unchanged')
a.silentError();assert.equal(a.snapshot().hadSilentError,true)
assert.equal(a.nonQualifyingMessage('Solved, but slower than 3 seconds.'),'Correct','an error is not a timing failure')
a.begin('four');assert.equal(a.nonQualifyingMessage('Solved, but slower than 3 seconds.'),'Solved, but slower than 3 seconds.','existing slow feedback is preserved')
const router=fs.readFileSync('src/AppRouter.tsx','utf8')
for(const [route,file] of endgameTrainers)assert.ok(router.includes(`"${route}"`),`${file}: inventoried production route`)
for(const file of [...endgameTrainers.map(x=>x[1]),...sharedLegacyTemplates]){
 const s=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 assert.equal(sf.parseDiagnostics.length,0,`${file} parses`)
 for(const text of ['useEndgameInput','onPieceDrop={endgameInput.onDrop}','boardControls={endgameInput.controls}','{endgameInput.silentButton}','endgameInput.attempt.qualify(','endgameInput.attempt.wrongMove()','endgameInput.mouseEnabled'])assert.ok(s.includes(text),`${file}: ${text}`)
 assert.ok(!s.includes('Date.now() - moveStartedAtRef.current'),`${file}: speech-aware legacy timer adapter`)
 assert.ok(!s.includes('SpeechRecognition'),`${file}: no duplicate voice system`)
}
function walk(root){if(!fs.existsSync(root))return [];return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${root}/${e.name}`):/\.(tsx?|json|css|mjs)$/.test(e.name)?[`${root}/${e.name}`]:[])}
const textFiles=[...new Set([...endgameTrainers.map(x=>x[1]),...sharedLegacyTemplates,...dormantEndgameComponents,...endgameTextFiles,...walk('src/pages/endgames'),...endgameTextRoots.flatMap(walk)])]
for(const file of textFiles)if(fs.existsSync(file))assert.ok(!corruptedEndgameText.test(fs.readFileSync(file,'utf8')),`${file}: no corrupt Endgame text`)
if(process.env.ENDGAME_BEFORE_SNAPSHOT){
 const dir=process.env.ENDGAME_BEFORE_SNAPSHOT, audit=JSON.parse(fs.readFileSync(`${dir}/audit.json`,'utf8'))
 function constants(s){const sf=ts.createSourceFile('x.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out=[];function visit(n){if(ts.isVariableDeclaration(n)&&/^[A-Z][A-Z_0-9]+$/.test(n.name.getText(sf)))out.push(n.getText(sf));ts.forEachChild(n,visit)}visit(sf);return out}
 function correctnessFunctions(s){
  // Compare executable structure, permitting only the reviewed typography repairs
  // and comment/newline differences, never changes to move or result expressions.
  s=s.replace(/ - ™ - \u009d/g,' —').replace(/ - \u009d/g,' —').replace(/ - ™/g,' —').replace(/\ufffd/g,'—')
  const sf=ts.createSourceFile('x.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),out={},printer=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed})
  function stripInputAdapter(context){
   function visit(n){
    if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&/^endgameInput\.attempt\.(wrongMove|begin)$/.test(n.expression.expression.getText(sf)))return undefined
    if(ts.isCallExpression(n)&&n.expression.getText(sf)==='endgameInput.elapsed')return ts.factory.createBinaryExpression(ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Date'),'now'),undefined,[]),ts.SyntaxKind.MinusToken,n.arguments[0])
    return ts.visitEachChild(n,visit,context)
   }
   return n=>ts.visitNode(n,visit)
  }
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name&&/^(onDrop$|showWrongAndReset$|handleClassificationAnswer$|validate|evaluate|normalize|build|isStrict|isClearly|getBest|chooseHint|userMoveCompletesGoal|whiteCan|blackKingProtects|hasWhite)/.test(n.name.text)){const transformed=ts.transform(n,[stripInputAdapter]);out[n.name.text]=printer.printNode(ts.EmitHint.Unspecified,transformed.transformed[0],sf);transformed.dispose()}ts.forEachChild(n,visit)}visit(sf);return out
 }
 for(const file of audit.files){const before=fs.readFileSync(`${dir}/${file}`,'utf8'),after=fs.readFileSync(file,'utf8');if(file.endsWith('.tsx')){assert.deepEqual(constants(after),constants(before),`${file}: thresholds/config unchanged`);assert.deepEqual(correctnessFunctions(after),correctnessFunctions(before),`${file}: correctness logic unchanged`)}else if(file.endsWith('.json')){const scrub=v=>Array.isArray(v)?v.map(scrub):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='label').map(([k,x])=>[k,scrub(x)])):v;assert.deepEqual(scrub(JSON.parse(after)),scrub(JSON.parse(before)),`${file}: all non-label data preserved`)}}
}
console.log(`PASS Endgames: ${endgameTrainers.length} routed trainers + ${sharedLegacyTemplates.length} legacy templates; shared error/timing adapter, unchanged thresholds/correctness, ${textFiles.length} text files scanned`)
