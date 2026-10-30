import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const activeJob = (status) => ({
 jobId: `intro-${status}`,
 status,
 planReadyAcknowledged: false,
 input: { userId: 'intro-user', chesscomUsername: 'tester', lichessUsername: '' },
 gamesCompleted: status === 'analyzing' ? 4 : 0,
 gamesTotal: status === 'analyzing' ? 12 : 0,
})

const bundle = await build({
 stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation,Route,Routes} from 'react-router-dom';
import IntroductionPage from './src/pages/IntroductionPage';
import {Context} from '../context/BackgroundAnalysisContext';
function App(){
 const location=useLocation(),initial=window.__fixtureJob;
 const [acknowledged,setAcknowledged]=useState(false),[starts,setStarts]=useState(0),[retries,setRetries]=useState(0);
 return <Context.Provider value={{job:initial,startAnalysis:()=>setStarts(n=>n+1),retryAnalysis:()=>setRetries(n=>n+1),acknowledgePlanReady:()=>setAcknowledged(true)}}>
  <Routes><Route path="/onboarding/introduction" element={<IntroductionPage/>}/><Route path="/auto" element={<p>Auto training</p>}/></Routes>
  <output data-route>{location.pathname+location.search}</output><output data-ack>{String(acknowledged)}</output>
  <output data-starts>{starts}</output><output data-retries>{retries}</output>
 </Context.Provider>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`, },
 bundle: true, write: false, outfile: 'introduction-nonblocking.js', format: 'iife', jsx: 'automatic',
 plugins: [{ name: 'introduction-fixtures', setup(build) {
  build.onResolve({ filter: /BackgroundAnalysisContext$/ }, () => ({ path: 'analysis', namespace: 'fixture' }))
  build.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }))
  build.onResolve({ filter: /resolveAutoStartRoute$/ }, () => ({ path: 'auto-route', namespace: 'fixture' }))
  build.onResolve({ filter: /onboarding\/introduction$/ }, () => ({ path: 'introduction', namespace: 'fixture' }))
  build.onResolve({ filter: /onboarding\.css$/ }, () => ({ path: 'style', namespace: 'fixture' }))
  build.onLoad({ filter: /^analysis$/, namespace: 'fixture' }, () => ({
   contents: "import{createContext,useContext}from'react';export const Context=createContext(null);export const useBackgroundAnalysis=()=>useContext(Context)", loader: 'js', resolveDir: process.cwd(),
  }))
  build.onLoad({ filter: /^supabase$/, namespace: 'fixture' }, () => ({
   contents: `export const supabase={auth:{getUser:async()=>({data:{user:{id:'intro-user',user_metadata:JSON.parse(localStorage.getItem('intro-metadata')||'{"training_introduction_v1":{"version":1,"status":"pending","startedAt":"2026-09-01T00:00:00Z","requiresAnalysis":true},"chessComUsername":"tester"}')}},error:null}),updateUser:async({data})=>{localStorage.setItem('intro-metadata',JSON.stringify({...JSON.parse(localStorage.getItem('intro-metadata')||'{}'),...data}));return{error:null}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{onboarding_complete:true},error:null})})})})}`, loader: 'js',
  }))
  build.onLoad({ filter: /^auto-route$/, namespace: 'fixture' }, () => ({ contents: "export const AUTO_TRAINING_ENTRY_ROUTE='/auto?continue=1'", loader: 'js' }))
  build.onLoad({ filter: /^introduction$/, namespace: 'fixture' }, () => ({
   contents: "export const INTRODUCTION_METADATA_KEY='training_introduction_v1';export const INTRODUCTION_VIDEO_SRC='/introduction.mp4';export const readIntroduction=metadata=>metadata?.training_introduction_v1||null", loader: 'js',
  }))
  build.onLoad({ filter: /^style$/, namespace: 'fixture' }, () => ({ contents: '', loader: 'css' }))
 } }],
})

const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text
const server = createServer((_request, response) => {
 response.setHeader('Content-Type', 'text/html')
 response.end(`<div id="root"></div><script>${js}</script>`)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })

async function verifyScenario(status, { mobile = false } = {}) {
 const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true } : {})
 await context.addInitScript((job) => { window.__fixtureJob = job }, activeJob(status))
 const page = await context.newPage()
 const errors = []
 page.on('pageerror', (error) => errors.push(error.message))
 await page.goto(`${origin}/onboarding/introduction`)
 await page.getByLabel('Introduction video').waitFor()
 assert.equal(await page.locator('[data-route]').textContent(), '/onboarding/introduction', `${status} import must not block or interrupt the video`)
 assert.equal(await page.locator('[data-starts]').textContent(), '0', `${status} checkpoint must not be duplicated`)
 if (status === 'failed') {
  assert.equal(await page.getByRole('button', { name: 'Retry analysis', exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Retry analysis', exact: true }).click()
  assert.equal(await page.locator('[data-retries]').textContent(), '1')
 }
 await page.getByLabel('Introduction video').evaluate((video) => video.dispatchEvent(new Event('ended')))
 await page.waitForFunction(() => document.querySelector('[data-route]')?.textContent === '/auto?continue=1')
 assert.equal(await page.locator('[data-ack]').textContent(), status === 'completed' ? 'true' : 'false')
 assert.deepEqual(errors, [])
 return { context, page }
}

try {
 await verifyScenario('importing', { mobile: true })
 await verifyScenario('failed')
 const { context } = await verifyScenario('completed')
 const resumed = await context.newPage()
 await resumed.goto(`${origin}/onboarding/introduction`)
 await resumed.waitForFunction(() => document.querySelector('[data-route]')?.textContent === '/auto?continue=1')
 assert.equal(await resumed.getByLabel('Introduction video').count(), 0, 'resolved introduction must not replay after refresh/resume')
 await context.close()
 console.log('PASS: pending, failed, completed, mobile, and refresh/resume imports never block rating-based practice')
} finally {
 await browser.close()
 await new Promise((resolve) => server.close(resolve))
}
