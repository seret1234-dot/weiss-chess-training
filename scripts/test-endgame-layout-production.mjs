import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
import {installAiVoiceMock} from './ai-voice-rendered-support.mjs'
import {endgameTrainers} from './lib/endgame-trainer-inventory.mjs'
const dist=path.resolve('dist'),port=4234,artifact=await fs.mkdtemp(path.join(os.tmpdir(),'endgame-no-scroll-'))
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.woff2':'font/woff2'}
const server=createServer(async(req,res)=>{let p=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(dist+path.sep)&&p!==dist){res.writeHead(403).end();return}try{const body=await fs.readFile(p);res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(body)}catch{res.setHeader('Content-Type','text/html');res.end(await fs.readFile(path.join(dist,'index.html')))}})
let browser;const results=[]
try{
 await new Promise(r=>server.listen(port,'127.0.0.1',r));browser=await chromium.launch({headless:true})
 for(const [route] of endgameTrainers){
  if(process.env.ENDGAME_LAYOUT_ROUTE&&route!==process.env.ENDGAME_LAYOUT_ROUTE)continue
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await installAiVoiceMock(page)
  await page.goto(`http://127.0.0.1:${port}${route}`);const input=page.getByLabel('Input',{exact:true});await input.waitFor({timeout:30000});await input.selectOption('ai-both')
  for(const [width,height] of [[1920,1080],[1680,900],[1600,900],[1366,768],[1280,720],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(650)
   const result=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const p=document.querySelector('.trainer-shell-side');return{pageY:document.documentElement.scrollHeight-innerHeight,pageX:document.documentElement.scrollWidth-innerWidth,panelY:p.scrollHeight-p.clientHeight,panelX:p.scrollWidth-p.clientWidth,overflowY:getComputedStyle(p).overflowY,board:rect('.trainer-shell-managed-board-slot'),panel:rect('.trainer-shell-side'),input:rect('.trainer-shell-board-controls'),footer:rect('.compliance-footer')}})
   results.push({route,width,height,...result});assert.ok(result.pageX<=1,`${route} ${width}: horizontal overflow ${JSON.stringify(result)}`)
   if(width>768){
    const frame=await page.locator('.trainer-shell-board-frame').boundingBox()
    assert.ok(Math.abs(frame.x-(width-result.panel.right))<=2,`${route}: board/panel workspace centered`)
    assert.ok(result.panel.width>=600&&result.panel.width<=680,'readable desktop panel width')
    const minimumBoard=height>=1080?700:height>=900?570:height>=768?440:390
    assert.ok(result.board.width>=minimumBoard&&result.board.width<=800,`${route}: board uses available viewport: ${result.board.width}`)
    assert.ok(result.pageY<=1,`${route} ${width}: page overflow ${JSON.stringify(result)}`)
    assert.ok(result.panelY<=1&&result.panelX<=1,`${route} ${width}: panel overflow ${JSON.stringify(result)}`)
    assert.ok(!['auto','scroll'].includes(result.overflowY),'no internal panel scrolling')
    for(const name of ['board','panel','input']){const r=result[name];assert.ok(r.y>=0&&r.right<=width+1&&r.bottom<=height,`${name} visible: ${JSON.stringify(result)}`)}
    for(const name of ['Silent error','Hint','Restart position','Next puzzle']){const button=page.getByRole('button',{name,exact:true}),r=await button.boundingBox();assert.ok(r&&r.y>=0&&r.y+r.height<=height,`${route}: ${name} visible without scrolling`);assert.ok(await button.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no clipped button text');assert.ok(await button.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),`${route}: ${name} not covered by another control`)}
    await page.locator('.endgame-secondary summary').click({trial:true})
    if(await page.locator('.endgame-explanation-toggle').count())await page.locator('.endgame-explanation-toggle').click({trial:true})
    assert.ok(await page.locator('.trainer-shell-title').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+12,r.y+r.height/2))}),'title not obscured by the global Back control')
    const nav=await page.getByText(/^(Chunk navigation|Navigation)$/).boundingBox();assert.ok(nav&&nav.y+nav.height<=height)
   }else{
    await page.getByRole('button',{name:'Silent error',exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>scrollY>0),'normal mobile page scrolling')
    for(const name of ['Silent error','Hint','Restart position','Next puzzle'])await page.getByRole('button',{name,exact:true}).click({trial:true,timeout:5000})
    await page.locator('.endgame-section--navigation button').last().click({trial:true,timeout:5000})
    await page.locator('.endgame-secondary summary').click({trial:true,timeout:5000})
   }
   if(route.endsWith('shouldering')||route.endsWith('/kqk')||route.endsWith('/bn'))await page.screenshot({path:path.join(artifact,`${route.split('/').pop()}-${width}.png`),fullPage:true})
   console.log(`PASS ${route} ${width}x${height}: board=${result.board.width}; panel=${result.panel.width}x${result.panel.height}; page=${result.pageY}; panel overflow=${result.panelY}`)
  }
  // Secondary information is retained and keyboard-operable, not clipped away.
  await page.locator('.endgame-secondary summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.endgame-secondary').getAttribute('open'),'')
  assert.ok(await page.getByText('Puzzle info',{exact:true}).isVisible());assert.ok(await page.getByText('Message',{exact:true}).isVisible())
  assert.deepEqual(errors,[],`${route}: runtime errors`);await page.close()
 }
}finally{await fs.writeFile(path.join(artifact,'measurements.json'),JSON.stringify(results,null,2));console.log(`Layout artifacts: ${artifact}`);await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
