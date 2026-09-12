import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
import {validateVoiceWav} from '../server/chess-voice-core.mjs'
// Actual browser AudioContext/AudioWorklet + synthetic local MediaStream.
// This is deliberately NOT represented as a human microphone/ASR test.
const worklet=await readFile('src/trainers/voice/pcm-capture.worklet.js','utf8')
const bundle=await build({stdin:{contents:`import {openUtteranceCapture} from './src/trainers/voice/utteranceCapture';
window.begin=async()=>{const source=new AudioContext({sampleRate:16000});const osc=source.createOscillator(),gain=source.createGain(),dest=source.createMediaStreamDestination();gain.gain.value=0;osc.connect(gain);gain.connect(dest);osc.start();await source.resume();
navigator.mediaDevices.getUserMedia=async()=>dest.stream;
window.capture=await openUtteranceCapture(async v=>{window.clip={bytes:Array.from(new Uint8Array(await v.audio.arrayBuffer())),durationMs:v.audioDurationMs,start:v.speechStartedAt,end:v.speechEndedAt};},()=>{window.tooLong=true},()=>{});
window.talk=()=>gain.gain.value=.1;window.quiet=()=>gain.gain.value=0;window.end=async()=>{window.capture.stop();osc.stop();await source.close()};window.ready=true;};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm'})
const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text)}else if(req.url==='/pcm-capture.worklet.js'){res.setHeader('Content-Type','text/javascript');res.end(worklet)}else{res.end('<button onclick="begin()">Start synthetic audio</button><script type="module" src="/fixture.js"></script>')}})
let browser
try{
 await new Promise(r=>server.listen(4229,'127.0.0.1',r));browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4229');await page.getByRole('button').click();await page.waitForFunction(()=>window.ready)
 await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>!!window.clip),false,'no silence upload')
 await page.evaluate(()=>window.talk());await page.waitForTimeout(500);await page.evaluate(()=>window.quiet());await page.waitForFunction(()=>window.clip)
 const clip=await page.evaluate(()=>window.clip);const duration=validateVoiceWav(Buffer.from(clip.bytes));assert.ok(duration>.5&&duration<1.4);assert.ok(clip.end>clip.start)
 assert.ok(Math.abs(clip.durationMs-duration*1000)<.001,'diagnostic duration matches actual captured WAV')
 await page.evaluate(()=>{window.clip=null;window.capture.pause(true);window.talk()});await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.clip),null)
 await page.evaluate(()=>window.end());assert.deepEqual(errors,[])
 console.log('PASS actual Chromium AudioWorklet: local synthetic MediaStream -> PCM/VAD/WAV, silence ignored, valid short duration, pause/cleanup; no physical microphone or provider call')
}finally{await browser?.close();await new Promise(r=>server.close(r))}
