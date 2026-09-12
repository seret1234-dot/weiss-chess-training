import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium } from 'playwright'

const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{useWeeklyReviewPlayback,weeklyReviewReadingMs}from'./src/pages/analyze/useWeeklyReviewPlayback';
function App(){const[ply,setPly]=useState(()=>Number(sessionStorage.getItem('ply')||0));const[furthest,setFurthest]=useState(0);const[done,setDone]=useState(0);
const playback=useWeeklyReviewPlayback({reviewKey:'fixture',ready:true,ply,total:3,sequentialThrough:furthest,text:'Best move.',advance:next=>{setPly(next);setFurthest(f=>next===f+1?next:f);sessionStorage.setItem('ply',String(next))},complete:()=>setDone(n=>n+1)});
return <><output data-ply>{ply}</output><output data-paused>{String(playback.paused)}</output><output data-done>{done}</output>
<output data-bounds>{JSON.stringify([weeklyReviewReadingMs(''),weeklyReviewReadingMs('word '.repeat(40)),weeklyReviewReadingMs('word '.repeat(200))])}</output>
<button onClick={playback.pause}>Pause</button><button onClick={playback.resume}>Resume</button>
<button onClick={()=>{playback.pause();setPly(3)}}>Last</button></>}
createRoot(document.getElementById('root')).render(<App/>);` }, bundle:true,write:false,format:'iife' })
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script>${result.outputFiles[0].text}</script>`)})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.waitForFunction(()=>document.querySelector('[data-ply]').textContent==='1')
 assert.deepEqual(JSON.parse(await page.locator('[data-bounds]').textContent()),[4000,14000,18000])
 await page.getByRole('button',{name:'Pause',exact:true}).click()
 await page.waitForTimeout(4200);assert.equal(await page.locator('[data-ply]').textContent(),'1')
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-paused]').textContent==='true')
 assert.equal(await page.locator('[data-ply]').textContent(),'1','paused position survives reload')
 await page.getByRole('button',{name:'Resume',exact:true}).click()
 const started=Date.now();await page.waitForFunction(()=>document.querySelector('[data-ply]').textContent==='2')
 assert.ok(Date.now()-started>=3800,'resume allows full reading time')
 await page.getByRole('button',{name:'Last',exact:true}).click()
 await page.getByRole('button',{name:'Resume',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('[data-paused]').textContent==='true')
 assert.equal(await page.locator('[data-done]').textContent(),'0','Last cannot complete skipped review')
 // Fresh isolated session demonstrates a natural sequential completion once.
 const fresh=await browser.newPage();await fresh.goto(`http://127.0.0.1:${server.address().port}`)
 await fresh.waitForFunction(()=>document.querySelector('[data-done]').textContent==='1',{timeout:20000})
 await fresh.waitForTimeout(500);assert.equal(await fresh.locator('[data-done]').textContent(),'1')
 assert.deepEqual(errors,[])
 console.log('PASS reading bounds, immediate first move, timed sequential playback, pause/resume, refresh, Last guard, final dwell and one completion')
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
