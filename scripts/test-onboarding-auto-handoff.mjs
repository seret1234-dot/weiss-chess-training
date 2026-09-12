import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'

// Isolate job delivery, not the actual completion component or router hooks.
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{BrowserRouter,useLocation,useNavigate}from'react-router-dom';
import Status from './src/components/BackgroundAnalysisStatus';import{Context}from'../context/BackgroundAnalysisContext';
function App(){const location=useLocation(),navigate=useNavigate();const[job,setJob]=useState(()=>JSON.parse(localStorage.getItem('job')||'null')||{jobId:'test',status:'analyzing',gamesCompleted:0,gamesTotal:1,planReadyAcknowledged:false});
function update(next){localStorage.setItem('job',JSON.stringify(next));setJob(next)}
return <Context.Provider value={{job,acknowledgePlanReady:()=>update({...job,planReadyAcknowledged:true}),retryAnalysis:()=>{}}}>
<Status/><output data-route>{location.pathname+location.search}</output><output data-ack>{String(job.planReadyAcknowledged)}</output>
<button onClick={()=>update({...job,status:'completed'})}>Finish saved analysis</button>
<button onClick={()=>navigate('/home')}>Home</button><button onClick={()=>navigate('/manual')}>Manual</button><button onClick={()=>navigate('/auto')}>Inspect plan</button>
</Context.Provider>}
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);` },
 bundle: true, write: false, outfile: 'handoff.js', format: 'iife', jsx: 'automatic',
 plugins: [{ name: 'isolated-job', setup(b) {
  b.onResolve({ filter: /BackgroundAnalysisContext$/ }, () => ({ path: 'job', namespace: 'fixture' }))
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import{createContext,useContext}from'react';export const Context=createContext(null);export const useBackgroundAnalysis=()=>useContext(Context);`, loader: 'js', resolveDir: process.cwd() }))
  b.onResolve({ filter: /resolveAutoStartRoute$/ }, () => ({ path: 'auto', namespace: 'canonical' }))
  b.onLoad({ filter: /.*/, namespace: 'canonical' }, () => ({ contents: `export const AUTO_TRAINING_ENTRY_ROUTE='/auto?continue=1'`, loader: 'js' }))
 } }] })
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text
const server = createServer((_req,res) => { res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script>${js}</script>`) })
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const browser = await chromium.launch({ headless: true }), origin = `http://127.0.0.1:${server.address().port}`
try {
 for (const initial of ['/onboarding','/home','/play-computer?weekly=1&auto=1','/mates/m1/back-rank?auto=1&chunk=25']) {
  const context = await browser.newContext(), page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin+initial)
  await page.getByRole('button',{name:'Finish saved analysis'}).click()
  await page.waitForFunction(()=>document.querySelector('[data-ack]').textContent==='true')
  const expected = initial.includes('auto=1') ? initial : '/auto?continue=1'
  assert.equal(await page.locator('[data-route]').textContent(), expected)
  assert.equal(await page.getByRole('button',{name:'View My Training Plan'}).count(),0)
  assert.equal(await page.locator('.background-analysis-status').count(),0)
  await page.getByRole('button',{name:'Home',exact:true}).click(); await page.reload()
  assert.equal(await page.locator('[data-route]').textContent(),'/home','consumed completion cannot redirect after refresh')
  await page.getByRole('button',{name:'Manual',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[data-route]').textContent==='/manual')
  await page.getByRole('button',{name:'Inspect plan'}).click()
  await page.waitForFunction(()=>document.querySelector('[data-route]').textContent==='/auto')
  assert.deepEqual(errors,[]); console.log('PASS completion handoff / existing activity preserved / no overlay / refresh / manual plan:',initial)
  await context.close()
 }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)) }
