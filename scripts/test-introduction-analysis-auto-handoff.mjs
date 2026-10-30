import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
 stdin: {
  resolveDir: process.cwd(),
  loader: 'tsx',
  contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation,Route,Routes} from 'react-router-dom';
import IntroductionPage from './src/pages/IntroductionPage';
import {Context} from '../context/BackgroundAnalysisContext';
function App(){
 const location=useLocation(),[acknowledged,setAcknowledged]=useState(false);
 const job={jobId:'completed-introduction-job',status:'completed',planReadyAcknowledged:acknowledged,
  input:{userId:'intro-user',chesscomUsername:'tester',lichessUsername:''},gamesCompleted:12,gamesTotal:12};
 return <Context.Provider value={{job,startAnalysis:()=>{},retryAnalysis:()=>{},acknowledgePlanReady:()=>setAcknowledged(true)}}>
  <Routes><Route path="/onboarding/introduction" element={<IntroductionPage/>}/><Route path="/auto" element={<p>Auto training</p>}/></Routes>
  <output data-route>{location.pathname+location.search}</output><output data-ack>{String(acknowledged)}</output>
 </Context.Provider>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`,
 },
 bundle: true,
 write: false,
 outfile: 'introduction-handoff.js',
 format: 'iife',
 jsx: 'automatic',
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
   contents: "export const supabase={auth:{getUser:async()=>({data:{user:{id:'intro-user',user_metadata:{training_introduction_v1:{version:1,status:'pending',startedAt:'2026-09-01T00:00:00Z',requiresAnalysis:true},chessComUsername:'tester'}}},error:null}),updateUser:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{onboarding_complete:true},error:null})})})})}", loader: 'js',
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
const browser = await chromium.launch({ headless: true })

try {
 const page = await browser.newPage()
 const errors = []
 page.on('pageerror', (error) => errors.push(error.message))
 await page.goto(`http://127.0.0.1:${server.address().port}/onboarding/introduction`)
 await page.getByLabel('Introduction video').waitFor()
 assert.equal(await page.locator('[data-route]').textContent(), '/onboarding/introduction', 'a completed import does not interrupt the instruction video')
 await page.getByLabel('Introduction video').evaluate((video) => video.dispatchEvent(new Event('ended')))
 await page.waitForFunction(() => document.querySelector('[data-route]')?.textContent === '/auto?continue=1')
 assert.equal(await page.locator('[data-ack]').textContent(), 'true')
 assert.equal(await page.getByRole('button', { name: 'Skip introduction', exact: true }).count(), 0)
 assert.deepEqual(errors, [])
 console.log('PASS: a completed import/analysis job waits for video completion, then hands the learner to Auto training')
} finally {
 await browser.close()
 await new Promise((resolve) => server.close(resolve))
}
