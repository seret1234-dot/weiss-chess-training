// Paired read-only geometry audit. Fresh guest contexts; no production state writes.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
const base='http://127.0.0.1:4198'
const fen='r2q1rk1/pp1nbppp/2p1pn2/3p4/3P4/2NBPN2/PPQ2PPP/R1B2RK1 w - - 2 10'
const path='/analyze/board?fen='+encodeURIComponent(fen)
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4198','--strictPort'],{stdio:'ignore',windowsHide:true})
const browser=await chromium.launch({headless:true})
const results=[]
try {
 let ready=false
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
 assert(ready,'Local preview ready')
 for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1024,height:768}]){
  const pair={viewport}
  for(const [name,origin] of [['production','https://weisschess.com'],['candidate',base]]){
   const context=await browser.newContext({viewport,deviceScaleFactor:1,locale:'en-US',colorScheme:'dark',reducedMotion:'no-preference'})
   const page=await context.newPage()
   await page.route('**/*',route=>{
    const req=route.request()
    if(!['GET','HEAD'].includes(req.method())||/paypal\.com|stockfish|\.wasm(?:\?|$)/i.test(req.url()))return route.abort()
    return route.continue()
   })
   await page.goto(origin+path,{waitUntil:'networkidle',timeout:60000})
   await page.getByRole('status').filter({hasText:'FEN loaded.'}).waitFor()
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})
   pair[name]=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}
    const grid=document.querySelector('.analyze-review-grid')
    const style=getComputedStyle(grid),side=document.querySelector('.trainer-shell-side')
    return {workspace:rect(grid),panelVisibleRight:side.getBoundingClientRect().left+side.clientLeft+side.clientWidth,gap:innerWidth-grid.getBoundingClientRect().right,overflow:document.documentElement.scrollWidth-innerWidth,documentHeight:document.documentElement.scrollHeight,dpr:devicePixelRatio,font:style.font,fontStatus:document.fonts.status,columns:style.gridTemplateColumns,children:[...grid.children].map(rect),assets:[...document.scripts].filter(s=>s.src).map(s=>new URL(s.src).pathname)}
   })
   await context.close()
  }
  assert.equal(pair.production.dpr,pair.candidate.dpr)
  assert.equal(pair.production.font,pair.candidate.font)
  assert.equal(pair.production.fontStatus,'loaded');assert.equal(pair.candidate.fontStatus,'loaded')
  for(const key of ['gap','overflow','documentHeight'])assert(Math.abs(pair.production[key]-pair.candidate[key])<=2,`${viewport.width}: ${key} differs`)
  assert(pair.candidate.overflow<=1,`${viewport.width}: no horizontal overflow`)
  for(const key of Object.keys(pair.production.workspace))assert(Math.abs(pair.production.workspace[key]-pair.candidate.workspace[key])<=2,`${viewport.width}: workspace ${key} differs`)
  assert.equal(pair.production.children.length,pair.candidate.children.length)
  for(let i=0;i<pair.production.children.length;i++)for(const key of Object.keys(pair.production.children[i]))assert(Math.abs(pair.production.children[i][key]-pair.candidate.children[i][key])<=2,`${viewport.width}: child ${i} ${key} differs`)
  for(const state of [pair.production,pair.candidate])for(const child of state.children)assert(child.right<=state.panelVisibleRight+1,'Children remain inside the actual panel clipping edge')
  results.push(pair)
  console.log(JSON.stringify({viewport,production:pair.production.workspace,candidate:pair.candidate.workspace,gaps:[pair.production.gap,pair.candidate.gap],overflow:pair.candidate.overflow,result:'PASS'}))
 }
 await writeFile('docs/seo-analyze-production-baseline.json',JSON.stringify({browser:browser.version(),authentication:'fresh guest contexts for both origins',deviceScaleFactor:1,path,results},null,2))
}finally{await browser.close();server.kill()}
