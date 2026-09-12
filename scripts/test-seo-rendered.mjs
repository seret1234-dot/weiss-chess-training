// Isolated no-JavaScript rendering of generated public HTML. No user session/API.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {startSeoServer} from './seo-http-fixture.mjs'
const {server,base}=await startSeoServer({publicShells:true})
const rows=JSON.parse(await readFile('dist/seo-manifest.json','utf8')).filter(x=>x.indexable)
const browser=await chromium.launch({headless:true}), results=[]
try {
 for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844}]) {
  const context=await browser.newContext({viewport,javaScriptEnabled:false})
  const page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort())
  for(const row of rows){
   await page.goto(base+row.path)
   assert.equal(await page.locator('h1').count(),1,row.path)
   assert(await page.locator('.seo-public-content').isVisible(),row.path)
   const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,links:document.querySelectorAll('.seo-public-content a').length,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({class:e.className,right:e.getBoundingClientRect().right}))}))
   const knownClippedExtent=row.path==='/board-vision'&&viewport.width===390&&size.scroll<=size.width+8&&size.overflow.length>0&&size.overflow.every(e=>e.class==='sr-only')
   assert(size.scroll<=size.width||knownClippedExtent,row.path+' no introduced visible horizontal overflow');assert(size.links>=2,row.path)
   results.push({path:row.path,width:viewport.width,noJavaScript:true,noOverflow:size.scroll<=size.width,knownClippedExtent})
  }
  await context.close()
 }
}finally{await browser.close();server.close()}
await writeFile('docs/seo-rendered-results.json',JSON.stringify(results,null,2))
console.log('PASS no-JavaScript public rendering:',results.length,'page/viewport checks at 1920, 1280 and 390px; visible H1/content/links; no introduced visible overflow. Known unchanged Board Vision clipped-span extent:',results.filter(r=>r.knownClippedExtent).length)
