import assert from 'node:assert/strict'
import {handleChessVoiceRequest,validateVoiceWav,transcribeVoice,MAX_VOICE_BYTES} from '../server/chess-voice-core.mjs'
function wav(seconds=1,rate=16000){const b=Buffer.alloc(44+seconds*rate*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b}
function db({allowed=true,tier='free',auth=true,anonymous=false,complete=true}={}){
 const calls=[]
 return {calls,auth:{async getUser(token){assert.equal(token,'test-session');return {data:{user:auth?{id:'server-user',is_anonymous:anonymous}:null},error:auth?null:{message:'invalid'}}}},
 async rpc(name,args){calls.push({name,args});assert.equal(args.p_user_id,'server-user');
 if(name==='chess_voice_quota')return {data:{allowed,tier,limit:tier==='premium'?2000:10,used:allowed?2:10,remaining:allowed?7:0,reservation_id:args.p_reserve?'reserved-id':undefined,code:allowed?undefined:'VOICE_QUOTA_EXCEEDED'}}
 if(name==='complete_chess_voice_usage')return {data:complete,error:complete?null:{message:'database error'}}
 return {data:true}}}
}
const request=(method='POST',audio=wav(),auth='Bearer test-session')=>new Request('http://localhost/api/chess-voice-transcribe',{method,headers:{authorization:auth,'content-type':'audio/wav','x-premium':'true'},...(method==='POST'?{body:audio}:{})})
for(const tier of ['free','premium']){const backend=db({tier});const result=await handleChessVoiceRequest(request(),{db:backend,transcribe:async()=> 'rook e eight'});assert.equal(result.status,200);const body=await result.json();assert.equal(body.transcript,'rook e eight');assert.equal(body.quota.tier,tier);assert.equal(body.quota.used,3);assert.deepEqual(backend.calls.map(x=>x.name),['chess_voice_quota','complete_chess_voice_usage']);assert.equal(body.reservation_id,undefined)}
{const backend=db({allowed:false});let called=false;const r=await handleChessVoiceRequest(request(),{db:backend,transcribe:async()=>{called=true}});assert.equal(r.status,429);assert.equal(called,false);assert.equal((await r.json()).quota.limit,10,'client Premium header cannot elevate quota')}
for(const options of [{auth:false},{anonymous:true}]){const backend=db(options);assert.equal((await handleChessVoiceRequest(request(),{db:backend})).status,401);assert.equal(backend.calls.length,0)}
{const backend=db();assert.equal((await handleChessVoiceRequest(request('POST',wav(),''),{db:backend})).status,401);assert.equal(backend.calls.length,0)}
for(const transcribe of [async()=>{throw Error('secret provider internals')},async()=>{throw Object.assign(Error('secret provider internals'),{status:401,code:'NETWORK_CODE'})},async()=>'',async()=>({text:'invalid'}),async()=> 'x'.repeat(501)]){
 const backend=db();const r=await handleChessVoiceRequest(request(),{db:backend,transcribe});assert.ok(r.status>=400);assert.ok(!(await r.text()).includes('secret'));assert.deepEqual(backend.calls.map(x=>x.name),['chess_voice_quota','release_chess_voice_usage'])
}
{const backend=db({complete:false});assert.equal((await handleChessVoiceRequest(request(),{db:backend,transcribe:async()=> 'e4'})).status,503);assert.equal(backend.calls.at(-1).name,'release_chess_voice_usage')}
{const backend=db();const r=await handleChessVoiceRequest(request('GET'),{db:backend});assert.equal(r.status,200);assert.equal(backend.calls[0].args.p_reserve,false);assert.equal(backend.calls.length,1)}
for(const bytes of [wav(5),Buffer.alloc(MAX_VOICE_BYTES+1),wav(.05),Buffer.from('not audio')]){assert.throws(()=>validateVoiceWav(bytes));const backend=db();assert.ok((await handleChessVoiceRequest(request('POST',bytes),{db:backend})).status>=400);assert.equal(backend.calls.length,0,'invalid audio never reserves/calls provider')}
const malformed=wav();malformed.writeUInt32LE(8000,24);assert.throws(()=>validateVoiceWav(malformed),'cannot lie about rate/duration with inconsistent header')
assert.equal(validateVoiceWav(wav(4,48000)),4)
{let calls=0;const text=await transcribeVoice(wav(),{apiKey:'server-only-key',fetcher:async(url,options)=>{
 calls++;assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.headers.Authorization,'Bearer server-only-key');assert.equal(options.body.get('model'),'gpt-transcribe');assert.deepEqual(options.body.getAll('languages[]'),['en']);assert.equal(options.body.has('language'),false);assert.ok(options.body.getAll('keywords[]').includes('rook'));assert.equal(options.body.get('file').type,'audio/wav');assert.ok(options.signal);return Response.json({text:'rook e eight'})}});assert.equal(text,'rook e eight');assert.equal(calls,1)}
console.log('PASS AI voice server: auth, anonymous rejection, server-owned tier/quota, reservation completion/release, failures, bounded actual WAV duration, no secrets, exact model/language/keywords; no real API calls')
