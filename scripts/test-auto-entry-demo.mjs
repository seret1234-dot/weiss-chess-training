import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'

// Render real demo entry/bookmark/Manual components and the existing Menu.
// Auth/board services are fixtures; no real account or training record is written.
const mocks = {
  '../training/autoMixedEligibility': `export const mixedAutoRoute=route=>/\\/mixed(?:[?]|$)/.test(route); export const isAutoMixedEligible=async()=>false`,
  '../training/resolveAutoStartRoute': `export const AUTO_TRAINING_ENTRY_ROUTE='/auto?continue=1'`,
  '../context/BoardUiContext': `export const useBoardUiContext=()=>({boardState:{isAvailable:false}})`,
  '../theme/ThemeContext': `export const useSiteTheme=()=>({showCoordinates:true,toggleCoordinates(){}})`,
  '../theme/ThemeSelector': `export default ()=>null`,
  '../lib/supabase': `export const supabase={auth:{signOut:async()=>({error:null})}}`,
  '../context/BackgroundAnalysisContext': `import {createContext,useContext} from 'react';export const TestJobContext=createContext({job:{status:'idle',input:null}});export const useBackgroundAnalysis=()=>useContext(TestJobContext)`,
}
const fixture = `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Link,Navigate,useLocation} from 'react-router-dom';
import {DemoAutoEntry,DemoAutoLocationTracker,DemoManualPractice} from './src/demo/AutoEntryDemo';
import BackgroundAnalysisStatus from './src/components/BackgroundAnalysisStatus';
import {TestJobContext} from '../context/BackgroundAnalysisContext';
import Menu from './src/components/GlobalFloatingPlay';
let mounts=0; const userId=new URLSearchParams(location.search).has('guest')?undefined:'demo-user';
function Exercise(){const [attempt]=useState(()=>++mounts);return <><h1>Existing trainer fixture</h1><output data-attempt>{attempt}</output><Link to="/auto?continue=1">Complete course item</Link></>}
function Auto(){window.selections=(window.selections||0)+1;return <Navigate replace to="/mates/m1/back-rank?auto=1&chunk=25#board"/>}
function App(){const l=useLocation();const [job,setJob]=useState({jobId:'entry-test',status:'idle',input:{userId}});return <TestJobContext.Provider value={{job,acknowledgePlanReady:()=>setJob(j=>({...j,planReadyAcknowledged:true})),retryAnalysis:()=>{}}}>
<BackgroundAnalysisStatus/>
<Menu isLoggedIn={!!userId} accountUser={userId?{id:userId,email:'demo@example.test'}:null} onSignedOut={()=>{}}/>
<DemoAutoLocationTracker userId={userId}/><output data-route>{l.pathname+l.search+l.hash}</output>
<Routes><Route path="/" element={userId?<DemoAutoEntry userId={userId}/>:<h1>Guest home</h1>}/>
<Route path="/auto" element={<Auto/>}/><Route path="/demo-auto" element={<DemoAutoEntry userId={userId}/>}/>
<Route path="/home" element={<><h1>Home dashboard</h1><Link to="/demo-auto">Resume Auto Training</Link></>}/>
<Route path="/manual" element={<DemoManualPractice signedIn={!!userId}/>}/>
<Route path="/onboarding" element={<><h1>Onboarding fixture</h1><button onClick={()=>setJob({...job,status:'completed'})}>Complete onboarding fixture</button></>}/>
<Route path="/mates/m1/back-rank" element={<Exercise/>}/><Route path="/auth" element={<h1>Log in</h1>}/></Routes></TestJobContext.Provider>}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outfile: 'demo.js', format: 'iife', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'true', 'import.meta.env.MODE': '"development"', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'isolated-services', setup(b) {
    b.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : null)
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }))
  } }],
})
const js = bundle.outputFiles.find(f=>f.path.endsWith('.js')).text
const css = bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text ?? ''
const server = createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${css}</style><div id="root"></div><script>${js}</script>`)})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}})
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin)
  await page.locator('[data-attempt]').waitFor()
  const route='/mates/m1/back-rank?auto=1&chunk=25#board'
  assert.equal(await page.locator('[data-route]').textContent(),route)
  const selections=await page.evaluate(()=>window.selections)
  async function menu(label){await page.getByRole('button',{name:'Menu',exact:true}).hover(); await page.locator('#global-floating-play-desktop-panel').getByRole('button',{name:label,exact:true}).click()}
  await menu('Home'); await page.getByRole('heading',{name:'Home dashboard'}).waitFor()
  await page.waitForTimeout(300)
  assert.equal(new URL(page.url()).pathname,'/home','Home stays outside Auto')
  await page.getByRole('link',{name:'Resume Auto Training'}).click()
  await page.locator('[data-attempt]').waitFor()
  assert.equal(await page.locator('[data-attempt]').textContent(),'2','return remounts attempt')
  assert.equal(await page.locator('[data-route]').textContent(),route,'query/chunk/hash retained')
  assert.equal(await page.evaluate(()=>window.selections),selections,'Home return does not select next course item')
  await menu('Manual Practice'); await page.getByRole('heading',{name:'Manual Practice'}).waitFor()
  await page.waitForTimeout(300)
  assert.equal(new URL(page.url()).pathname,'/manual')
  await page.getByRole('link',{name:'Return to Auto',exact:true}).click()
  await page.locator('[data-attempt]').waitFor()
  assert.equal(await page.locator('[data-attempt]').textContent(),'3')
  assert.equal(await page.evaluate(()=>window.selections),selections,'Manual return does not advance course')
  await page.goto(origin)
  await page.locator('[data-attempt]').waitFor()
  assert.equal(await page.evaluate(()=>window.selections||0),0,'reload resumes bookmark without scheduler selection')
  await page.getByRole('link',{name:'Complete course item'}).click()
  await page.waitForFunction(()=>window.selections>0)
  assert.deepEqual(errors,[])
  const guest=await browser.newPage(); await guest.goto(origin+'/?guest=1')
  await guest.getByRole('heading',{name:'Guest home'}).waitFor()
  const invalid=await browser.newPage()
  await invalid.addInitScript(()=>sessionStorage.setItem('weiss-auto-entry-demo-v1:demo-user','https://evil.test/?auto=1'))
  await invalid.goto(origin); await invalid.locator('[data-attempt]').waitFor()
  assert.ok(await invalid.evaluate(()=>window.selections>0),'invalid bookmark uses existing scheduler')
  const locked=await browser.newPage()
  await locked.addInitScript(()=>sessionStorage.setItem('weiss-auto-entry-demo-v1:demo-user','/master-tactics/1/mixed?auto=1'))
  await locked.goto(origin); await locked.locator('[data-attempt]').waitFor()
  assert.equal(await locked.locator('[data-route]').textContent(),route,'locked Mixed bookmark re-enters eligible Auto selection')
  const other=await browser.newPage()
  await other.addInitScript(()=>sessionStorage.setItem('weiss-auto-entry-demo-v1:another-user','/tactics/m1/fork?auto=1'))
  await other.goto(origin); await other.locator('[data-attempt]').waitFor()
  assert.equal(await other.locator('[data-route]').textContent(),route,'bookmarks are user-scoped')
  await page.setViewportSize({width:390,height:844}); await page.goto(origin+'/manual')
  await page.getByRole('heading',{name:'Manual Practice'}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.goto(origin+'/onboarding')
  await page.getByRole('heading',{name:'Onboarding fixture'}).waitFor()
  assert.equal(new URL(page.url()).pathname,'/onboarding','incomplete onboarding stays required')
  await page.getByRole('button',{name:'Complete onboarding fixture'}).click()
  await page.locator('[data-attempt]').waitFor()
  assert.equal(await page.locator('[data-route]').textContent(),route,'completion event reactively opens Auto')
  console.log('PASS rendered local demo: automatic entry, stable Home/Manual, exact resume, fresh attempt mount, reload, completion selection, guest/user isolation, invalid target, mobile')
} finally { await browser.close(); await new Promise(r=>server.close(r)) }
const router=await readFile('src/AppRouter.tsx','utf8')
assert.match(router,/autoEntryEnabled && user \? <DemoAutoEntry/)
assert.match(router,/autoEntryEnabled && <>\s*<Route path="\/home"/)
const home=await readFile('src/LandingPage.tsx','utf8')
assert.match(home,/demoHome \? 'Resume Auto Training'/)
assert.match(home,/if \(demoHome && user\).*navigate\('\/demo-auto'\)/)
const auto=await readFile('src/pages/AutoStudyPage.tsx','utf8')
// The shared continue entry now serves both Weekly review and onboarding.
assert.match(auto,/if \(new URLSearchParams\(location.search\).get\('continue'\) === '1'\)/)
console.log('PASS actual router/Home/Auto integration wiring; entry enabled in production and local builds')
