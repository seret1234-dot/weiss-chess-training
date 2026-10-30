// Isolated mounted-controller navigation test, not a quota/backend substitute.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

// Natural chunk completion must enter the resolver, not the manual plan page.
// Master wrappers use these same Pattern trainers.
for (const file of ['src/trainers/patternMate/PatternMateTrainer.tsx', 'src/trainers/patternTactic/PatternTacticTrainer.tsx']) {
 const source = readFileSync(file, 'utf8')
 assert.equal(source.includes("window.location.assign('/auto')"), false, file + ': no manual plan-page completion destination')
 assert.equal(source.split("window.location.assign('/auto?continue=1')").length - 1, 2, file + ': overlay and inline completion both enter Auto resolver')
}

const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, {useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom'
import Controller from './src/components/AutoTrainingController'
import {AutoAllowanceBoundary} from './src/training/AutoAllowanceBoundary'
import {AUTO_ALLOWANCE_STOP} from './src/training/autoChunkAllowance'
import {AUTO_TRAINING_COMPLETE_EVENT} from './src/training/autoTrainingRoute'
function Trainer(){
 const location=useLocation()
 useEffect(()=>{
  if(location.pathname==='/master-tactics/1/bishop-fork') queueMicrotask(()=>window.dispatchEvent(new CustomEvent(AUTO_ALLOWANCE_STOP,{detail:{route:location.pathname+location.search,limited:true}})))
 },[location.key])
 return <section aria-label="Playable activity"><h1>Exercise</h1></section>
}
function App(){
 const location=useLocation(),navigate=useNavigate()
 return <><output data-testid="route">{location.pathname+location.search}</output>
 <button onClick={()=>navigate('/mates/m1/back-rank?auto=1')}>Open unlocked</button>
 <Controller user={{id:'controller-test'}}/>
 <AutoAllowanceBoundary>{location.pathname==='/auto'?<>
 <button onClick={()=>navigate('/tactics/m1/bishop-fork?auto=1&chunk=0')}>Resolve eligible</button>
 <button onClick={()=>navigate('/tactics/m1/bishop-fork?auto=1&chunk=1')}>Resolve same trainer next chunk</button>
 <button onClick={()=>navigate('/master-tactics/1/bishop-fork?auto=1')}>Resolve capped</button>
 </>:<Trainer/>}</AutoAllowanceBoundary>
 <button onClick={()=>{window.dispatchEvent(new Event(AUTO_TRAINING_COMPLETE_EVENT));window.dispatchEvent(new Event(AUTO_TRAINING_COMPLETE_EVENT))}}>Natural completion events</button>
 </>
}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[new URLSearchParams(window.location.search).get('entry')||'/mates/m1/back-rank?auto=1']}><App/></MemoryRouter>)
` }, bundle:true, write:false, format:'iife', platform:'browser', jsx:'automatic', define:{'process.env.NODE_ENV':'"test"','import.meta.env.DEV':'false','import.meta.env.MODE':'"test"','import.meta.env.VITE_AUTO_ENTRY_DEMO':'"false"'} })
const server=createServer((req,res)=>{
 res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html')
 res.end(req.url==='/test.js'?compiled.outputFiles[0].text:'<!doctype html><div id="root"></div><script src="/test.js"></script>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true})
const page=await browser.newPage(), errors=[]
page.on('pageerror',e=>errors.push(e.message))
const control=()=>page.getByTestId('finish-drill-continue')
async function ready(){await page.getByRole('region',{name:'Playable activity'}).waitFor();assert.equal(await control().count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Opening next item|Finish drill & continue/)}
try{
 await page.goto(base);await ready()
 await page.getByRole('button',{name:'Natural completion events',exact:true}).click();await page.getByRole('button',{name:'Resolve eligible',exact:true}).click();await ready()
 console.log('PASS eligible destination clears prior Continue state without remount/refresh')
 await page.getByRole('button',{name:'Natural completion events',exact:true}).click();await page.getByRole('button',{name:'Resolve same trainer next chunk',exact:true}).click();await ready()
 console.log('PASS same pathname/different chunk clears pending state')
 await page.getByRole('button',{name:'Natural completion events',exact:true}).click()
 await page.getByRole('button',{name:'Resolve eligible',exact:true}).click();await ready()
 console.log('PASS completion-event transition remains usable')
 await page.getByRole('button',{name:'Natural completion events',exact:true}).click();await page.getByRole('button',{name:'Resolve capped',exact:true}).click()
 await page.getByRole('heading',{name:"Today's free training is complete.",exact:true}).waitFor()
 assert.equal(await control().count(),0)
 assert.equal(await page.getByRole('region',{name:'Playable activity'}).count(),0)
 await page.getByRole('button',{name:'Open unlocked',exact:true}).click();await ready()
 console.log('PASS quota stop hides control/board; returning to unlocked route has no stale pending state')
 await page.goto(base+'/?entry='+encodeURIComponent('/master-tactics/1/bishop-fork?auto=1'))
 await page.getByRole('heading',{name:"Today's free training is complete.",exact:true}).waitFor()
 assert.equal(await control().count(),0)
 await page.reload();await page.getByRole('heading',{name:"Today's free training is complete.",exact:true}).waitFor();assert.equal(await control().count(),0)
 await page.goto(base);await ready();await page.reload();await ready()
 console.log('PASS fresh/reloaded eligible and capped routes never preserve pending state')
 await page.goto(base+'/?entry='+encodeURIComponent('/mates/m1/back-rank'))
 await ready();await page.getByRole('button',{name:'Natural completion events',exact:true}).click();assert.equal(await page.getByTestId('route').innerText(),'/mates/m1/back-rank','Manual completion does not enter Auto')
 assert.deepEqual(errors,[])
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
