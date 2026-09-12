import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
const mockCapture=`export const aiAudioSupported=()=>true;export async function openUtteranceCapture(on,tooLong,lost){
 if(window.denyMic)throw new Error('permission denied');
 const slot={on,paused:false,stopped:false};window.capture=slot;return{pause(v){slot.paused=v},stop(){slot.stopped=true}}}`
const mockProvider=`export class AiVoiceError extends Error{constructor(message,code,quota){super(message);this.code=code;this.quota=quota}}
export async function requestAiVoice(audio,signal){window.requests=(window.requests||0)+(audio?1:0);
 const quota=window.quota||{tier:'free',limit:10,used:0,remaining:10,resetAt:'2026-09-10T00:00:00Z'};
 if(!audio){if(window.initialError){window.initialError=false;throw new AiVoiceError('Recognition/network error','VOICE_UNAVAILABLE')}return{quota,allowed:quota.remaining>0}}
 if(window.delay)await new Promise(r=>setTimeout(r,window.delay));
 if(window.fail)throw new AiVoiceError('Recognition/network error — try again.','VOICE_UNAVAILABLE');
 if(window.noSpeech)throw new AiVoiceError('Could not understand — try again','VOICE_NO_SPEECH');
 if(window.missingTranscript)return{quota};
 return{transcript:window.transcript??'e four',quota};}`
const bundle=await build({entryPoints:['scripts/ai-voice-input-test-fixture.tsx'],bundle:true,write:false,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"','import.meta.env.DEV':'true'},plugins:[{name:'isolated-ai',setup(b){
 b.onResolve({filter:/\/(utteranceCapture|aiTranscriptionProvider)$/},a=>({path:a.path,namespace:'ai-mock'}))
 b.onLoad({filter:/.*/,namespace:'ai-mock'},a=>({contents:a.path.endsWith('utteranceCapture')?mockCapture:mockProvider,loader:'js'}))
}}]})
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:'<div id="root"></div><script type="module" src="/fixture.js"></script>')})
let browser
try{
 await new Promise(r=>server.listen(4227,'127.0.0.1',r));browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4227');const mode=page.getByLabel('Input',{exact:true})
 await mode.selectOption('ai-both')
 const listen=()=>page.getByRole('status').filter({hasText:'🎙 Listening'}).waitFor()
 const reset=async()=>{await page.getByRole('button',{name:'Next fixture'}).click();await listen()}
 const say=async(text)=>page.evaluate(text=>{const slot=window.capture;if(slot.paused||slot.stopped)throw Error('not listening');window.transcript=text;const now=performance.now();const utterance={audio:new Blob(['fake']),audioDurationMs:850,speechStartedAt:now,speechEndedAt:now+100};slot.on(utterance);if(window.duplicateCapture)slot.on(utterance)},text)
 const result=()=>page.getByTestId('result').textContent()
 await listen();assert.equal(await page.getByRole('button',{name:'Mouse move'}).isEnabled(),true)
 await page.getByRole('button',{name:'Mouse move'}).click();assert.equal(await result(),'Mouse action');await reset()
 await page.evaluate(()=>window.delay=3200);await say('e four');await page.getByTestId('result').filter({hasText:'Qualifying'}).waitFor();assert.equal(await result(),'Qualifying','API latency never becomes reaction time')
 const logs=()=>page.locator('details').filter({hasText:'Speech recognition diagnostics'}).textContent()
 for(const field of ['capturedAudioDurationMs=850','speechStartedAt=','speechEndedAt=','reactionMs=','transcriptionCompletedAt=','transcriptionLatencyMs=','returnedTranscript="e four"','[parser]'])assert.ok((await logs()).includes(field),field)
 await page.evaluate(()=>window.delay=0);await reset();await say('queen e two');await page.getByTestId('result').filter({hasText:'Wrong, silent error'}).waitFor();await listen();await say('e four');await page.getByTestId('result').filter({hasText:'Not qualifying'}).waitFor()
 await reset();await say('d four');await page.getByTestId('result').filter({hasText:'Wrong move'}).waitFor();await listen();await say('e four');await page.getByTestId('result').filter({hasText:'Not qualifying'}).waitFor()
 await reset();const count=await page.getByTestId('calls').textContent();await say('hello');await page.waitForTimeout(800);await listen();assert.equal(await page.getByTestId('calls').textContent(),count)
 assert.ok((await logs()).includes('[parser] rejection:'))
 for(const failure of ['empty','whitespace','missing','provider-no-speech']){
  await page.evaluate(failure=>{window.missingTranscript=failure==='missing';window.noSpeech=failure==='provider-no-speech'},failure)
  const requests=await page.evaluate(()=>window.requests)
  await say(failure==='whitespace'?'   ':'');await page.getByRole('status').filter({hasText:'Could not understand'}).waitFor();await listen()
  assert.equal(await page.getByTestId('calls').textContent(),count,`${failure} must not score`)
  assert.equal(await page.evaluate(()=>window.requests),requests+1,`${failure} resumes capture, never retries transcription`)
  assert.ok((await logs()).includes('[transcription] failure=VOICE_NO_SPEECH'))
 }
 await page.evaluate(()=>{window.missingTranscript=false;window.noSpeech=false;window.duplicateCapture=true;window.delay=200})
 const duplicateCalls=Number(await page.getByTestId('calls').textContent()),duplicateRequests=await page.evaluate(()=>window.requests)
 await say('d four');await page.getByTestId('result').filter({hasText:'Wrong move'}).waitFor();await listen()
 assert.equal(Number(await page.getByTestId('calls').textContent()),duplicateCalls+1,'clear wrong move reaches trainer exactly once')
 assert.equal(await page.evaluate(()=>window.requests),duplicateRequests+1,'duplicate capture never retranscribes')
 await page.evaluate(()=>{window.duplicateCapture=false;window.delay=0});await reset()
 const afterDuplicateCount=await page.getByTestId('calls').textContent()
 await page.evaluate(()=>window.fail=true);await say('e four');await page.getByRole('status').filter({hasText:'network error'}).waitFor();await listen();assert.equal(await page.getByTestId('calls').textContent(),afterDuplicateCount,'network failure never scores')
 await page.evaluate(()=>{window.fail=false;window.delay=1000});await say('e four');await reset();await page.waitForTimeout(1200);assert.equal(await result(),'Ready','old puzzle response ignored')
 await page.evaluate(()=>{window.delay=0;window.quota={tier:'free',limit:10,used:10,remaining:0}});await page.getByRole('button',{name:'Next fixture'}).click();await page.getByText('Upgrade',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Mouse move'}).isEnabled(),true)
 await mode.selectOption('ai-voice');assert.equal(await page.getByRole('button',{name:'Mouse move'}).isEnabled(),true,'exhausted AI-only fails safely to Mouse')
 await page.evaluate(()=>{window.quota={tier:'premium',limit:2000,used:0,remaining:2000};window.initialError=true});await page.getByRole('button',{name:'Retry microphone'}).click();await listen();assert.equal(await page.getByRole('button',{name:'Mouse move'}).isEnabled(),false)
 await page.evaluate(()=>window.denyMic=true);await page.getByRole('button',{name:'Retry microphone'}).click();await page.getByRole('status').filter({hasText:'Microphone unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'Mouse move'}).isEnabled(),true,'permission denial leaves mouse usable')
 assert.ok((await logs()).includes('[capture] failure=Error'),'capture and transcription failures distinguished')
 await page.evaluate(()=>window.denyMic=false);await page.getByRole('button',{name:'Retry microphone'}).click();await listen()
 await mode.selectOption('mouse');assert.equal(await page.getByRole('button',{name:'Mouse move'}).isEnabled(),true);assert.deepEqual(errors,[])
 console.log('PASS rendered AI: normal/wrong/illegal handlers, API latency, failure/restart, stale result, next puzzle listening, quota lock/upgrade, Premium, Mouse coexistence/fallback; mocked microphone/API, no live recordings')
}finally{await browser?.close();await new Promise(r=>server.close(r))}
