import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {readFile,writeFile} from 'node:fs/promises'
import {startSeoServer} from './seo-http-fixture.mjs'
// Public guest-only lab. Explicit public-artifact mapping is NOT a production routing test.
const legacyShell=process.env.SEO_SHELL_BASELINE==='1'
const {server,base}=await startSeoServer({publicShells:true,legacyShell}),browser=await chromium.launch({headless:true}),results=[]
const manifest=JSON.parse(await readFile('dist/seo-manifest.json','utf8'))
const paths=[...manifest.filter(r=>r.indexable&&!r.standalone).map(r=>r.path),'/endgames','/checkmate-patterns/back-rank-mate','/chess-tactics/bishop-fork','/endgame-guides/lucena','/chess-guides/learn-openings']
const catalogs={}
for(const [route,file] of [['master-mates','indexes/mates-theme-catalog.json'],['master-tactics','catalog.json']]){
 const html=await readFile('dist/_route-metadata/'+route+'.html','utf8')
 catalogs[file]=JSON.parse(html.match(/id="public-hub-catalog" type="application\/json">([\s\S]*?)<\/script>/)[1])
}
function measure(){
 const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}
 const h1=document.querySelector('h1'),seo=document.querySelector('.seo-public-content')
 const grid=document.querySelector('[data-pricing-plans]')||document.querySelector('.catalog-page__grid')||[...document.querySelectorAll('div,section')].find(e=>getComputedStyle(e).display==='grid'&&e.children.length>1&&[...e.children].some(c=>c.matches('a,button')))
 const hero=document.querySelector('.catalog-page__hero')||h1?.parentElement
 return {height:document.documentElement.scrollHeight,h1:box(h1),title:h1?.textContent,hero:box(hero),grid:box(grid),seo:box(seo),how:box(document.querySelector('.home-how')),copies:document.querySelectorAll('.seo-public-content').length,h1Count:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth}
}
try{
 for(const width of [1920,1280,390])for(const url of paths.filter(p=>!process.env.SEO_MOUNT_ROUTE||p===process.env.SEO_MOUNT_ROUTE)){
  const context=await browser.newContext({viewport:{width,height:width===1920?1080:width===1280?720:844}}),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  let release;const gate=new Promise(r=>release=r)
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url())
   if(u.hostname.endsWith('.supabase.co')){
    for(const [file,catalog]of Object.entries(catalogs))if(u.pathname.endsWith('/'+file))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)})
    return route.fulfill({status:200,contentType:'application/json',body:'[]'})
   }
   if(u.origin!==base)return route.abort()
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:u.pathname==='/api/price-profile'?200:401,contentType:'application/json',body:u.pathname==='/api/price-profile'?JSON.stringify({affiliateCheckout:true,mode:'live',currency:'USD',monthlyPrice:'$10.61',yearlyPrice:'$69.62',monthlyPlanId:'fixture-monthly',yearlyPlanId:'fixture-yearly'}):'{"error":"Authentication required"}'})
   if(u.pathname.endsWith('.js'))await gate
   return route.continue()
  })
  await page.goto(base+url,{waitUntil:'commit'})
  await page.locator('.seo-public-content').waitFor()
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--theme-text')||!document.querySelector('script[src]'))
  const before=await page.evaluate(measure)
  await page.evaluate(()=>{window.__mountFrames=[];window.__mountTrack=true;const tick=()=>{if(!window.__mountTrack)return;const h=document.querySelector('h1'),s=document.querySelector('.seo-public-content');window.__mountFrames.push({height:document.documentElement.scrollHeight,h1:h?.getBoundingClientRect().y??null,seo:s?.getBoundingClientRect().y??null,copies:document.querySelectorAll('.seo-public-content').length,missingText:h?null:document.body.innerText.slice(0,180)});requestAnimationFrame(tick)};tick()})
  release();await page.waitForLoadState('load');await page.waitForTimeout(1600)
  const after=await page.evaluate(measure),frames=await page.evaluate(()=>{window.__mountTrack=false;return window.__mountFrames})
  if(url==='/pricing'){
   assert(await page.getByText('$10.61',{exact:true}).isVisible(),'Pricing fixture must render real monthly display, not a missing-config error')
   assert(await page.getByText('$69.62',{exact:true}).isVisible(),'Pricing fixture must render yearly display')
  }
  const threshold=width<600?180:100 // <= small fraction of viewport; not a zero-shift rule.
  const deltas={height:after.height-before.height,h1:(after.h1?.y??0)-(before.h1?.y??0),hero:(after.hero?.y??0)-(before.hero?.y??0),seo:(after.seo?.y??0)-(before.seo?.y??0),grid:before.grid&&after.grid?after.grid.y-before.grid.y:0}
  const failed=[]
  for(const [key,value]of Object.entries(deltas))if(Math.abs(value)>threshold)failed.push(key+' delta '+value)
  if(before.h1Count!==1||after.h1Count!==1||after.copies!==1)failed.push('headings/copies')
  if(frames.some(f=>f.h1===null||f.copies!==1))failed.push('missing or duplicate content frame')
  const frameShift={height:Math.max(...frames.map(f=>Math.abs(f.height-before.height))),h1:Math.max(...frames.map(f=>Math.abs((f.h1??0)-(before.h1?.y??0)))),seo:Math.max(...frames.map(f=>Math.abs((f.seo??0)-(before.seo?.y??0))))}
  for(const [key,value]of Object.entries(frameShift))if(value>threshold)failed.push('intermediate frame '+key+' shift '+value)
  if(errors.length)failed.push(...errors)
  await page.keyboard.press('Tab')
  const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,visible:!!document.activeElement?.getClientRects().length}))
  if(!focus.visible)failed.push('keyboard focus not visible')
  const overflowElements=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})))
  const existingHiddenOverflow=url==='/board-vision'&&width===390&&before.overflow&&after.overflow&&overflowElements.length>0&&overflowElements.every(e=>e.class==='sr-only'&&e.right<=width+8)
  if((before.overflow||after.overflow)&&!existingHiddenOverflow)failed.push('horizontal overflow')
  if(existingHiddenOverflow)console.log('NOTE unchanged Board Vision 7px scroll extent from clipped sr-only spans; no visible element overflow')
  results.push({url,width,before,after,deltas,threshold,frames:frames.length,frameShift,missingFrames:frames.filter(f=>f.h1===null||f.copies!==1).slice(0,4),overflowElements,failed})
  console.log(JSON.stringify({url,width,deltas,failed}))
  await context.close()
 }
 await writeFile(legacyShell?'docs/seo-mount-before.json':'docs/seo-mount-results.json',JSON.stringify({environment:legacyShell?'Reconstructed prior shell structure against current app; not a historical capture':'Local generated public shells, isolated guest fixtures, no external calls; not deployed routing or field CWV',results},null,2))
 const failed=results.filter(r=>r.failed.length)
 console.log('Mount gate:',failed.length?'FAIL':'PASS',failed.length,'/',results.length)
 if(!legacyShell)assert.equal(failed.length,0,'Public shell mount must not produce severe structural jumps')
}finally{await browser.close();server.close()}
