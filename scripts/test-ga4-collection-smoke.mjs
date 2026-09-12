// Actual Google tag, without auth fixtures or synthetic business events.
// Default: local production bundle, intercept collection. --production: verify
// canonical production and allow this controlled, anonymous visit to reach GA.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'
const live=process.argv.includes('--production')
const server=live?null:await preview({mode:'production',preview:{host:'127.0.0.1',port:0,open:false}})
const base=live?'https://weisschess.com':server.resolvedUrls.local[0].replace(/\/$/,'')
const collection=/https:\/\/[^/]*(?:google-analytics\.com|analytics\.google\.com|doubleclick\.net)\//
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1280,height:720}})
const events=[],responses=[],errors=[],scripts=[]
context.on('response',r=>{if(collection.test(r.url()))responses.push(r.status())})
context.on('request',r=>{if(r.url().startsWith('https://www.googletagmanager.com/gtag/js'))scripts.push(r.url())})
await context.route(collection,route=>{
 const req=route.request()
 for(const row of (req.postData()||'').split('\n'))events.push(new URL(req.url()+(row?'&'+row:'' )).searchParams)
 return live?route.continue():route.abort()
})
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
const views=()=>events.filter(e=>e.get('en')==='page_view')
async function settle(){await page.getByRole('button',{name:'Menu',exact:true}).waitFor();await page.waitForTimeout(6500)}
async function go(path){await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))},path);await settle()}
try{
 await page.goto(base+'/privacy?email=ga-validation%40example.invalid&code=GA-SAFETY-MARKER#token=GA-SAFETY-MARKER');await settle()
 assert.equal(scripts.length,0);assert.equal(events.length,0,'no Google request before consent')
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click();await settle()
 assert.equal(views().length,1);assert.equal(scripts.length,1)
 await page.mouse.wheel(0,20000);await settle()
 assert.equal(events.filter(e=>e.get('en')==='scroll').length,1,'enabled Enhanced Measurement scroll is observed once')
 for(const path of ['/','/home','/manual','/mates/m1/back-rank','/pricing']){
  const count=views().length;await go(path);assert.equal(views().length,count+1,path+' one pageview')
 }
 assert.equal(events.filter(e=>e.get('en')==='subscription_page_viewed').length,1,'existing pricing event once')
 const before=views().length;await page.goBack();await settle();await page.goForward();await settle();await page.reload();await settle()
 assert.equal(views().length,before+3,'back/forward/refresh once each')
 for(const event of events){
  assert.equal(event.get('tid'),'G-RLHDSPZ8WH')
  assert.doesNotMatch(decodeURIComponent(event.toString()),/ga-validation|GA-SAFETY-MARKER|127\.0\.0\.1|localhost/)
  if(event.get('dl'))assert.equal(new URL(event.get('dl')).origin,'https://weisschess.com')
 }
 assert.deepEqual(errors,[])
 if(live){assert(responses.some(status=>status>=200&&status<300),'Google collection accepted the controlled production visit');assert(responses.every(status=>status>=200&&status<300))}
 console.log(JSON.stringify({mode:live?'LIVE production collection':'local actual Google tag; collection intercepted',tagLoads:scripts.length,pageviews:views().length,events:events.map(e=>({event:e.get('en'),location:e.get('dl'),title:e.get('dt'),measurementId:e.get('tid')})),responseStatuses:responses,errors},null,2))
 console.log('PASS real scroll/pageview sanitization, consent, navigation and existing pricing event')
}finally{await browser.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve))}
