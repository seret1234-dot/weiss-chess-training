import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
import {installAiVoiceMock} from './ai-voice-rendered-support.mjs'
import {endgameTrainers} from './lib/endgame-trainer-inventory.mjs'
const dist=path.resolve('dist'),port=4235,artifact=await fs.mkdtemp(path.join(os.tmpdir(),'endgame-rendered-text-'))
const record=process.argv.includes('--record'),results=[],failures=[],runtimeWarnings=[]
const repaired=['stalemate','lucena','philidor','pawns','zugzwang','fortress','shouldering']
const titles={shouldering:'KPK — Shouldering',stalemate:'Stalemate — Defensive stalemate',pawns:'KPK — Pawn Races',zugzwang:'KPK — Zugzwang',fortress:'Fortress — Fortress','knnkp-forced':'KNN vs KP — Forced Mate'}
const patterns=[['replacement/control/mojibake',/[\u0080-\u009f\ufffd]|Ã.|Â.|â€|ðŸ|ï¿½|[□◻�]/u],['duplicated separator',/(?:[-—–][ \t]*){2,}[ \t]*(?:\d|[A-Za-z])/u],['meaningless status',/^[ \t]*[-—–][ \t]*\d+[ \t]*$/mu],['damaged timing label',/Fast = (?:every move )?[-—]/u]]
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.woff2':'font/woff2'}
// Match the existing Vite/Vercel isolation headers for actual engine assets.
const server=createServer(async(req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');const p=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(dist+path.sep)){res.writeHead(403).end();return}try{const b=await fs.readFile(p);res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(b)}catch{res.setHeader('Content-Type','text/html');res.end(await fs.readFile(path.join(dist,'index.html')))}})
let browser
try{
 await new Promise(r=>server.listen(port,'127.0.0.1',r));browser=await chromium.launch({headless:true})
 for(const [route]of endgameTrainers){
  const name=route.split('/').pop(),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await installAiVoiceMock(page)
  await page.goto(`http://127.0.0.1:${port}${route}`);await page.getByLabel('Input',{exact:true}).waitFor({timeout:30000});await page.waitForTimeout(800)
  const capture=async state=>{
   const text=await page.locator('body').innerText(),status=await page.locator('.endgame-section--status').innerText(),title=await page.locator('.trainer-shell-title').innerText()
   const entry={route,state,title,status,text};results.push(entry)
   // FEN castling/en-passant placeholders are data, not damaged separators.
   // Restrict the dash-number check to the status card: negative engine scores are valid.
   const prose=text.replace(/(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+/g,'[FEN]')
   for(const [reason,re]of patterns){const target=reason==='meaningless status'?status:prose;if(re.test(target))failures.push({route,state,reason,match:target.match(re)?.[0]})}
   if(repaired.includes(name)&&!/^Fast solves: \d+\n/.test(status))failures.push({route,state,reason:'missing semantic fast-solve counter',status})
   if(titles[name]&&title!==titles[name])failures.push({route,state,reason:'incorrect title separator',title})
   await fs.writeFile(path.join(artifact,`${name}-${state}.txt`),text)
  }
  await capture('active')
  await page.locator('.endgame-secondary summary').click();await capture('details')
  const progressMap=page.locator('.endgame-reference-card').filter({has:page.getByText('Chunk positions',{exact:true})})
  if(!record&&[...repaired,'kqkp7','knnkp','knnkp-forced','kpk','bn','krkp'].includes(name)){const text=await progressMap.innerText();assert.ok(text.includes('✓'),'restored completion checkmarks');assert.ok(!/^[ \t]*[-—][ \t-—]*$/m.test(text),'no damaged completion glyphs')}
  const help=page.locator('.endgame-explanation-toggle');if(await help.count()){await help.click();await capture('help');await help.click()}
  await page.locator('.endgame-secondary summary').click()
  await page.getByRole('button',{name:'Silent error',exact:true}).click();await capture('silent-error')
  await page.getByRole('button',{name:'Restart position',exact:true}).click();await page.waitForTimeout(200)
  await page.getByRole('button',{name:'Hint',exact:true}).click();await page.waitForTimeout(600);await capture('hint')
  await page.getByRole('button',{name:'Next puzzle',exact:true}).click();await page.waitForTimeout(700);await capture('next-puzzle')
  if(['bn','shouldering','stalemate','lucena','philidor','pawns','zugzwang','fortress'].includes(name))await page.screenshot({path:path.join(artifact,`${name}.png`),fullPage:true})
  runtimeWarnings.push(...errors.map(message=>({route,message})));console.log(`AUDIT ${route}: ${results.filter(x=>x.route===route).length} rendered states`);await page.close()
 }
}finally{await fs.writeFile(path.join(artifact,'audit.json'),JSON.stringify({results,failures,runtimeWarnings},null,2));console.log(`Rendered text artifacts: ${artifact}`);console.log(JSON.stringify({failures,runtimeWarnings},null,2));await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
if(!record){
 assert.deepEqual(failures,[],'all 18 Endgame trainers render clean semantic text')
 assert.deepEqual(runtimeWarnings,[],'all active Endgame Hint paths must be free of runtime errors')
}
