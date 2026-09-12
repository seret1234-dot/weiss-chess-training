import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium } from 'playwright'
import { Chess } from 'chess.js'
import { endgameTrainers } from './lib/endgame-trainer-inventory.mjs'
const root=process.cwd(),port=4233
const hintsOnly=process.argv.includes('--hints-only')
// Hint-only fixtures can supply a winning score for the Zugzwang conversion
// case. Draw trainers and existing voice/mastery fixtures retain neutral scores.
const engine=`import {Chess} from 'chess.js';export class BNEngine{destroy(){} async analyze(fen){const g=new Chess(fen),moves=g.moves({verbose:true});const m=moves.find(m=>m.san.endsWith('#'))||moves[0];return{bestMove:m?m.from+m.to+(m.promotion||''):null,eval:${hintsOnly?'window.__hintEval??0':'0'},mate:m?.san.endsWith('#')?1:null}}}`
const provider=`export class AiVoiceError extends Error{};export async function requestAiVoice(audio){const quota={tier:'free',limit:10,used:0,remaining:10};return audio?{quota,transcript:window.__transcript}:{quota,allowed:true}}`
const capture=`export const aiAudioSupported=()=>true;export async function openUtteranceCapture(on){const c={on,paused:false,stopped:false};window.__capture=c;return{pause(v){c.paused=v},stop(){c.stopped=true}}}`
const supabase=`const query=new Proxy(function(){},{get(_t,k){return k==='then'?(resolve)=>Promise.resolve({data:[],error:null}).then(resolve):()=>query},apply(){return query}});export const supabase={auth:{getUser:async()=>({data:{user:null}})},from:()=>query};`
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{ThemeProvider}from'./src/theme/ThemeContext';import{HintActionProvider}from'./src/context/HintActionContext';${endgameTrainers.map(([_,f],i)=>`import C${i} from './${f}';`).join('\n')}const list=[${endgameTrainers.map((_,i)=>'C'+i).join(',')}];window.__normalMoves=[];const C=list[Number(new URLSearchParams(location.search).get('trainer'))||0];createRoot(document.getElementById('root')).render(<BrowserRouter><ThemeProvider><HintActionProvider><C/></HintActionProvider></ThemeProvider></BrowserRouter>);`
const bundle=await build({stdin:{contents:fixture,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:'fixture',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env.DEV':'false','import.meta.env.PROD':'true'},plugins:[{name:'endgame-isolation',setup(b){
 b.onResolve({filter:/(?:lib\/bnEngine|lib\/supabase|\/utteranceCapture|\/aiTranscriptionProvider|hooks\/useRegisterPlayableBoard|services\/coach\/coachPopup)$/},a=>({path:a.path,namespace:'endgame-mock'}))
 b.onLoad({filter:/.*/,namespace:'endgame-mock'},a=>({contents:a.path.endsWith('bnEngine')?engine:a.path.endsWith('supabase')?supabase:a.path.endsWith('utteranceCapture')?capture:a.path.endsWith('aiTranscriptionProvider')?provider:a.path.endsWith('useRegisterPlayableBoard')?'export function useRegisterPlayableBoard(){}':'export function showCoachMistake(){};export function hideCoachMistake(){}',loader:'js',resolveDir:root}))
 b.onLoad({filter:/Trainer\.tsx$/},async a=>{
  if(!endgameTrainers.some(x=>path.resolve(x[1])===a.path))return
  let text=await fs.readFile(a.path,'utf8')
  text=text.replace(/(const currentPosition = positions\[currentIndex\] \?\? null;?)/,'$1; window.__testPosition=currentPosition;')
  text=text.replace(/(function onDrop\(sourceSquare: string, targetSquare: string, promotion\?:[^\n]+\{)/,'$1\n window.__normalMoves.push({fen:game.fen(),from:sourceSquare,to:targetSquare,promotion});')
  return{contents:text,loader:'tsx',resolveDir:path.dirname(a.path)}
 })
 b.onLoad({filter:/TrainerShell\.tsx$/},async a=>{
  let text=await fs.readFile(a.path,'utf8');text=text.replace('const handleActive =',`window.__endgameShell={fen,onPieceDrop,boardOrientation,arePiecesDraggable,customSquareStyles};\n const handleActive =`)
  return{contents:text,loader:'tsx',resolveDir:path.dirname(a.path)}
 })
 b.onLoad({filter:/useEndgameInput\.tsx$/},async a=>{
  let text=await fs.readFile(a.path,'utf8');text=text.replace('  return {\n    attempt,','  const exposed = {\n    attempt,').replace(/\n}\s*$/,'\n window.__endgameInput=exposed; return exposed\n}')
  return{contents:text,loader:'tsx',resolveDir:path.dirname(a.path)}
 })
}}]})
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||''
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${port}`),p=url.pathname
 if(p==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return}
 if(p==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);return}
 if(p==='/'){res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');return}
 const file=path.resolve(root,'public','.'+p)
 if(!file.startsWith(path.resolve(root,'public')+path.sep)){res.writeHead(403).end();return}
 try{res.setHeader('Content-Type',p.endsWith('.json')?'application/json':p.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(await fs.readFile(file))}catch{res.writeHead(404).end()}
})
let browser
try{
 await new Promise(r=>server.listen(port,'127.0.0.1',r));browser=await chromium.launch({headless:true})
 const selected=process.env.ENDGAME_TEST_INDEX?endgameTrainers.map((v,i)=>[v,i]).filter(([_,i])=>i===Number(process.env.ENDGAME_TEST_INDEX)):endgameTrainers.map((v,i)=>[v,i])
 for(const [[route],i] of selected){
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  if(hintsOnly)page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.addInitScript(()=>{Math.random=()=>0})
  await page.goto(`http://127.0.0.1:${port}/?trainer=${i}`)
  const input=page.getByLabel('Input',{exact:true});await input.waitFor({timeout:30000}).catch(async e=>{throw Error(`${e.message}\n${errors.join('\n')}\n${(await page.locator('body').innerText()).slice(0,1800)}`)})
  // Older evaluate/convert trainers intentionally require a Win/Draw answer first.
  const silent=page.getByRole('button',{name:'Silent error',exact:true})
  if(i===6){
   if(hintsOnly){
    const fen=await page.evaluate(()=>window.__endgameShell.fen)
    await page.getByRole('button',{name:'Hint',exact:true}).click()
    await page.waitForFunction(()=>document.body.textContent.includes('Hint: choose '))
    assert.equal(await page.evaluate(()=>window.__endgameShell.fen),fen,'evaluation hint does not move a piece')
    assert.deepEqual(errors,[],'KQKP7 classification Hint')
    console.log('PASS KQKP7 classification Hint: existing Win/Draw advice')
   }
   // KQKP7's first eight chunks are evaluation-only, deliberately not chess moves.
   await silent.click();assert.equal(await page.evaluate(()=>window.__endgameInput.attempt.snapshot().hadSilentError),true)
   for(let chunk=0;chunk<8;chunk++){
    const id=await page.evaluate(()=>window.__testPosition.id)
    await page.getByRole('button',{name:'Next',exact:true}).click()
    await page.waitForFunction(id=>window.__testPosition?.id&&window.__testPosition.id!==id,id)
   }
   await page.waitForFunction(()=>window.__testPosition?.theme!=='evaluation')
  }
  if(!await page.evaluate(()=>window.__endgameShell?.arePiecesDraggable)){
   const target=await page.evaluate(()=>window.__testPosition?.result)
   for(const label of target==='draw'?['Draw','Drawn']:['Win','Winning']){const answer=page.getByRole('button',{name:label,exact:true});if(await answer.count()){await answer.click();break}}
  }
  await page.waitForFunction(()=>window.__endgameShell?.fen&&window.__endgameInput&&document.querySelector('select'))
  if(hintsOnly){
   await page.waitForFunction(()=>window.__endgameShell.arePiecesDraggable)
   const hint=page.getByRole('button',{name:'Hint',exact:true})
   if(i===15){
    const fen=await page.evaluate(()=>window.__endgameShell.fen)
    await page.evaluate(()=>window.__hintEval=0);await hint.click()
    await page.waitForFunction(()=>document.querySelector('.endgame-section--status')?.textContent.includes('Hint unavailable'))
    assert.equal(await page.evaluate(()=>window.__endgameShell.fen),fen,'unvalidated hint never moves a piece')
    assert.deepEqual(errors,[],'no engine-approved candidate retains the existing unavailable response')
    await page.evaluate(()=>window.__hintEval=1000)
    console.log('PASS Zugzwang unavailable hint: existing validation retained')
   }
   for(const state of ['play','repeated','restart','next']){
    if(state==='restart')await page.getByRole('button',{name:'Restart position',exact:true}).click()
    if(state==='next')await page.getByRole('button',{name:'Next puzzle',exact:true}).click()
    await page.waitForTimeout(250)
    // Evaluation-only draws intentionally remain classification questions, not
    // conversion drills. Preserve the existing Hint guard without solving them.
    if(!await page.evaluate(()=>window.__endgameShell.arePiecesDraggable)&&await page.getByText('First decision',{exact:true}).count()){
     const fen=await page.evaluate(()=>window.__endgameShell.fen)
     const attempt=await page.evaluate(()=>window.__endgameInput.attempt.snapshot())
     await hint.click();await page.waitForTimeout(100)
     assert.equal(await page.evaluate(()=>window.__endgameShell.fen),fen,'classification Hint does not move pieces')
     assert.deepEqual(await page.evaluate(()=>window.__endgameInput.attempt.snapshot()),attempt,'classification Hint preserves attempt')
     assert.deepEqual(errors,[],`${route}: classification Hint produces no runtime errors`)
     console.log(`PASS HINT ${route} ${state}: existing classification guard/advice, unchanged board/attempt`)
     continue
    }
    await page.waitForFunction(()=>window.__endgameShell.arePiecesDraggable).catch(async e=>{throw Error(`${route} ${state}: ${e.message}\n${JSON.stringify(await page.evaluate(()=>({shell:window.__endgameShell,position:window.__testPosition})))}\n${await page.locator('body').innerText()}`)})
    const fen=await page.evaluate(()=>window.__endgameShell.fen)
    const attempt=await page.evaluate(()=>window.__endgameInput.attempt.snapshot())
    await hint.click()
    await page.waitForFunction(()=>{
     const marked=Object.keys(window.__endgameShell.customSquareStyles||{}).length
     return document.querySelector('.endgame-section--status')?.textContent.includes('Hint')&&(marked>0||document.querySelector('style[data-global-hint-highlights]'))
    },null,{timeout:10000}).catch(async e=>{throw Error(`${route} ${state}: ${e.message}\n${JSON.stringify(await page.evaluate(()=>window.__endgameShell))}\n${await page.locator('body').innerText()}`)})
    assert.equal(await page.evaluate(()=>window.__endgameShell.fen),fen,`${route} ${state}: Hint never moves a piece`)
    assert.deepEqual(await page.evaluate(()=>window.__endgameInput.attempt.snapshot()),attempt,`${route} ${state}: existing attempt state preserved`)
    assert.deepEqual(errors,[],`${route} ${state}: no runtime errors`)
    console.log(`PASS HINT ${route} ${state}: original helper, visible highlights, unchanged board/attempt`)
   }
   await page.close();continue
  }
  assert.deepEqual(await input.locator('option').allTextContents(),['Mouse','AI Voice','Mouse + AI Voice'])
  const geometry=()=>page.evaluate(()=>Object.fromEntries(['.trainer-shell-board-column','.trainer-shell-side'].map(s=>[s,document.querySelector(s).getBoundingClientRect().width])))
  const before=await geometry()
  await input.selectOption('ai-voice');await page.getByRole('status').filter({hasText:'Listening'}).waitFor({timeout:20000}).catch(async e=>{throw Error(`${e.message}\n${errors.join('\n')}\n${JSON.stringify(await page.evaluate(()=>({shell:window.__endgameShell,position:window.__testPosition,capture:window.__capture}))) }\n${(await page.locator('body').innerText()).slice(0,3500)}`)})
  assert.equal(await page.evaluate(()=>window.__endgameShell.arePiecesDraggable),false,'AI-only pauses mouse once ready')
  await input.selectOption('ai-both');await page.getByRole('status').filter({hasText:'Listening'}).waitFor()
  assert.equal(await page.evaluate(()=>window.__endgameShell.arePiecesDraggable),true,'Mouse + AI Voice retains mouse')
  assert.deepEqual(await geometry(),before,`${route}: input UI does not change board/panel proportions`)
  for(const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768},{width:1280,height:720},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(350)
   await input.selectOption('mouse');const mouse=await geometry()
   await input.selectOption('ai-both');await page.getByRole('status').filter({hasText:'Listening'}).waitFor()
   assert.deepEqual(await geometry(),mouse,`${route} ${viewport.width}: voice preserves board/panel widths`)
   const layout=await page.evaluate(()=>{const controls=document.querySelector('.trainer-shell-board-controls'),board=document.querySelector('.trainer-shell-board-column');return{overflow:document.documentElement.scrollWidth-innerWidth,controlsWithin:controls.getBoundingClientRect().width<=board.getBoundingClientRect().width+1}})
   assert.ok(layout.overflow<=1,`${route} ${viewport.width}: no horizontal overflow (${layout.overflow})`)
   assert.ok(layout.controlsWithin,'voice controls remain inside board column')
   if(viewport.width>768){
    const dimensions=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};const panel=document.querySelector('.trainer-shell-side');return{documentOverflow:document.documentElement.scrollHeight-innerHeight,panelOverflow:panel.scrollHeight-panel.clientHeight,overflowY:getComputedStyle(panel).overflowY,board:rect('.trainer-shell-managed-board-slot'),panel:rect('.trainer-shell-side'),input:rect('.trainer-shell-board-controls')}})
    assert.ok(dimensions.documentOverflow<=1,`${route} ${viewport.width}: no page scroll ${JSON.stringify(dimensions)}`)
    assert.ok(dimensions.panelOverflow<=1,`${route} ${viewport.width}: no panel overflow ${JSON.stringify(dimensions)}`)
    assert.ok(!['auto','scroll'].includes(dimensions.overflowY),'no internal scrollbar')
    for(const [name,r] of Object.entries({board:dimensions.board,input:dimensions.input,panel:dimensions.panel}))assert.ok(r.y>=0&&r.bottom<=viewport.height&&r.right<=viewport.width,`${route}: ${name} fully visible`)
    for(const name of ['Silent error','Hint','Restart position','Next puzzle']){const b=page.getByRole('button',{name,exact:true}),r=await b.boundingBox();assert.ok(r&&r.y>=0&&r.y+r.height<=viewport.height,`${route}: ${name} visible without scrolling`)}
    const nav=page.getByText(/^(Chunk navigation|Navigation)$/);const n=await nav.boundingBox();assert.ok(n&&n.y+n.height<=viewport.height,'Chunk navigation visible')
    console.log(`LAYOUT ${route} ${viewport.width}x${viewport.height}: board ${dimensions.board.width}px; panel ${dimensions.panel.width}x${dimensions.panel.height}px; page/panel overflow ${dimensions.documentOverflow}/${dimensions.panelOverflow}`)
   }
   await silent.scrollIntoViewIfNeeded();const bounds=await silent.boundingBox();assert.ok(bounds.width>=95&&bounds.height<80,`${route}: Silent error is a reachable full-width action`)
   assert.equal(await page.locator('button.site-inline-hint').count(),1,'existing inline Hint retained')
   assert.ok(await page.getByRole('button',{name:/Hint/}).count(),`${route}: existing inline/mobile Hint remains accessible`)
  }
  await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(200)
  const fen=await page.evaluate(()=>window.__endgameShell.fen),calls=await page.evaluate(()=>window.__normalMoves.length)
  async function say(text){await page.evaluate(text=>{window.__transcript=text;const t=performance.now();window.__capture.on({audio:new Blob(['test']),audioDurationMs:1000,speechStartedAt:t,speechEndedAt:t+250})},text);await page.waitForTimeout(800)}
  await say('hello');await say('queen...')
  assert.equal(await page.evaluate(()=>window.__normalMoves.length),calls)
  assert.equal(await page.evaluate(()=>window.__endgameInput.attempt.snapshot().hadSilentError),false)
  // Find a clearly parsed illegal command without assuming which material exists.
  const board=new Chess(fen),legal=board.moves({verbose:true})
  const types={q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn',k:'king'}
  const type=Object.keys(types).find(t=>!board.board().flat().some(p=>p?.color===board.turn()&&p.type===t))||'q'
  await say(`${types[type]} e two`)
  assert.equal(await page.evaluate(()=>window.__endgameInput.attempt.snapshot().hadSilentError),true,`${route}: illegal -> shared Silent error`)
  assert.equal(await page.evaluate(()=>window.__endgameShell.fen),fen,'illegal speech never changes board')
  assert.equal(await page.evaluate(()=>window.__normalMoves.length),calls,'illegal speech never invokes board move')
  await silent.click();assert.equal(await page.evaluate(()=>window.__endgameShell.fen),fen,'button and illegal voice share no-board path')
  await page.getByRole('status').filter({hasText:'Listening'}).waitFor()
  const move=legal[0];assert.ok(move,`${route}: loaded a playable exercise`)
  await say(`${types[move.piece]} ${move.from} to ${move.to}${move.promotion?' promote '+types[move.promotion]:''}`)
  assert.equal(await page.evaluate(()=>window.__normalMoves.length),calls+1,`${route}: legal voice reaches original handler`)
  assert.equal(await page.evaluate(()=>window.__endgameInput.attempt.qualify(true)),false,`${route}: wrong then correct cannot regain credit`)
  assert.ok(!errors.length,`${route}: ${errors.join('; ')}`)
  console.log(`PASS ${route}: exact menu, mouse/AI coexistence, original legal handler, ignored speech, illegal/button parity, attempt consequence, listening, layout`)
  if(i===3){
   for(const scenario of ['clean','illegal','legal-wrong','button']){
    await page.evaluate(()=>localStorage.clear());await page.reload();await input.waitFor()
    await page.waitForFunction(()=>window.__endgameShell?.arePiecesDraggable)
    await input.selectOption('ai-both');await page.getByRole('status').filter({hasText:'Listening'}).waitFor()
    const start=await page.evaluate(()=>window.__endgameShell.fen),g=new Chess(start),moves=g.moves({verbose:true})
    const mate=moves.find(m=>m.san.endsWith('#')),wrong=moves.find(m=>!m.san.endsWith('#'));assert.ok(mate&&wrong)
    await page.evaluate(()=>{window.__qualifications=[];const a=window.__endgameInput.attempt,q=a.qualify.bind(a);a.qualify=v=>{const result=q(v);window.__qualifications.push({timing:v,result});return result}})
    if(scenario==='illegal')await say('knight e two')
    if(scenario==='button')await silent.click()
    if(scenario==='legal-wrong'){
     await say(`${types[wrong.piece]} ${wrong.from} to ${wrong.to}`)
     await page.waitForFunction(()=>window.__endgameInput.attempt.snapshot().hadIntentionalError)
     await page.waitForFunction(start=>window.__endgameShell.fen===start&&window.__endgameShell.arePiecesDraggable,start)
     await page.getByRole('status').filter({hasText:'Listening'}).waitFor()
    }
    // Simulate transcription finishing late but speech beginning 0.5s after the
    // current learner timer: qualification must use onset, not this API delay.
    await page.evaluate(text=>{window.__transcript=text;const onset=window.__endgameInput.controls.props.getPositionShownAt()+500;window.__capture.on({audio:new Blob(['test']),audioDurationMs:900,speechStartedAt:onset,speechEndedAt:onset+900})},`${types[mate.piece]} ${mate.from} to ${mate.to}`)
    await page.waitForFunction(()=>window.__qualifications.length===1)
    assert.deepEqual(await page.evaluate(()=>window.__qualifications),[{timing:true,result:scenario==='clean'}],`actual Piece Mate solve registration: ${scenario}`)
    const progress=await page.locator('body').innerText()
    assert.ok(progress.includes(scenario==='clean'?'1 / 5 fast solves':'0 / 5 fast solves'),`${scenario}: actual /5 counter`)
    assert.ok(new Chess(await page.evaluate(()=>window.__endgameShell.fen)).isCheckmate(),'original handler reaches mate')
    await page.getByRole('status').filter({hasText:'Listening'}).waitFor({timeout:10000})
    console.log(`PASS Piece Mate actual completion ${scenario}: original handler, /5 credit, speech-start timing, next-puzzle listening`)
   }
  }
  await page.close()
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
