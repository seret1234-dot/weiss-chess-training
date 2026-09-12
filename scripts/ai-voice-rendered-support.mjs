// Local rendered-test support only. No live auth, audio or API requests.
export async function installAiVoiceMock(page){
 const user={id:'00000000-0000-0000-0000-000000000061',aud:'authenticated',role:'authenticated',email:'voice-fixture@example.invalid',user_metadata:{onboarding_completed:true},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'}
 await page.route('**/lahzgtcpbshmzsqoqswf.supabase.co/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}))
 await page.route('**/lahzgtcpbshmzsqoqswf.supabase.co/rest/v1/**',route=>{
   const path=new URL(route.request().url()).pathname
   const body=path.includes('/rpc/')?{tier:'free',limit:10,used:0,remaining:10}:path.endsWith('/subscriptions')?null:[]
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
 })
 await page.route('**/api/chess-voice-transcribe',async route=>{
   const quota={tier:'free',limit:10,used:0,remaining:10,resetAt:'2026-09-10T00:00:00Z'}
   const transcript=await page.evaluate(()=>window.__aiTranscript)
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({quota,allowed:true,...(route.request().method()==='POST'?{transcript}:{})})})
 })
 await page.addInitScript(user=>{
   localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify({access_token:'local-fixture-token',refresh_token:'local-fixture-refresh',expires_at:4102444800,expires_in:86400,token_type:'bearer',user}))
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}],getAudioTracks:()=>[]})}})
   class Node{connect(){}disconnect(){}}
   window.AudioContext=class{sampleRate=16000;audioWorklet={addModule:async()=>{}};destination={};createMediaStreamSource(){return new Node()}createGain(){return Object.assign(new Node(),{gain:{value:0}})}resume(){return Promise.resolve()}close(){return Promise.resolve()}}
   window.AudioWorkletNode=class extends Node{port={onmessage:null};constructor(){super();window.__aiCaptureNode=this}}
 },user)
}
export async function sayAi(page,transcript){
 await page.evaluate(transcript=>{
   window.__aiTranscript=transcript
   window.__WEISS_PERFECTION_TEST_NOW+=30
   // Exercise actual PCM/VAD/WAV capture and the actual browser API adapter.
   const node=window.__aiCaptureNode
   for(let i=0;i<70;i++){
     window.__WEISS_PERFECTION_TEST_NOW+=10
     node.port.onmessage?.({data:new Float32Array(160).fill(i<16?.1:0)})
   }
 },transcript)
}
