import { createServerSupabase, authenticateUser } from './image-to-position-core.mjs'

export const MAX_VOICE_BYTES = 44 + 48000 * 2 * 4
export const VOICE_MODEL = 'gpt-transcribe'
export const VOICE_KEYWORDS = ['king','queen','rook','bishop','knight','pawn','takes','capture','castle','kingside','queenside',
  'a','b','c','d','e','f','g','h','one','two','three','four','five','six','seven','eight','check','mate','promotion']
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const publicFailure = Symbol('chess-voice-public-error')
function failure(status, code, message) { return Object.assign(new Error(message), { status, code, [publicFailure]: true }) }
export function validateVoiceWav(bytes) {
  const b = Buffer.from(bytes)
  if (b.length < 44 || b.length > MAX_VOICE_BYTES) throw failure(413,'VOICE_AUDIO_LIMIT','Use a short command of at most four seconds.')
  const rate=b.readUInt32LE(24), size=b.readUInt32LE(40)
  if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||
    b.readUInt32LE(4)!==b.length-8||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||
    rate<8000||rate>48000||b.readUInt32LE(28)!==rate*2||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||
    b.toString('ascii',36,40)!=='data'||size!==b.length-44||size%2!==0) throw failure(415,'VOICE_AUDIO_FORMAT','Unsupported audio recording.')
  const duration=size/(rate*2)
  if(duration<0.12||duration>4) throw failure(413,'VOICE_AUDIO_LIMIT','Use a short command of at most four seconds.')
  return duration
}
export async function readVoiceBody(request) {
  if(Number(request.headers.get('content-length'))>MAX_VOICE_BYTES) throw failure(413,'VOICE_AUDIO_LIMIT','Audio is too large.')
  if(!/^audio\/wav(?:;|$)/i.test(request.headers.get('content-type')||'')) throw failure(415,'VOICE_AUDIO_FORMAT','WAV audio required.')
  const reader=request.body?.getReader(); if(!reader) throw failure(400,'VOICE_AUDIO_MISSING','Audio required.')
  const chunks=[]; let size=0, timer
  try {
    const read=async()=>{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;
      if(size>MAX_VOICE_BYTES)throw failure(413,'VOICE_AUDIO_LIMIT','Audio is too large.');chunks.push(next.value)}return Buffer.concat(chunks)}
    return await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure(408,'VOICE_UPLOAD_TIMEOUT','Audio upload timed out.')),10000)})])
  } finally {clearTimeout(timer); await reader.cancel().catch(()=>{}); chunks.length=0}
}
export async function transcribeVoice(bytes, { fetcher=fetch, apiKey=process.env.OPENAI_API_KEY }={}) {
  if(!apiKey?.trim()) throw failure(503,'VOICE_UNAVAILABLE','AI Voice is not configured.')
  const form=new FormData()
  form.set('model',VOICE_MODEL); form.set('response_format','json')
  form.set('file',new Blob([bytes],{type:'audio/wav'}),'command.wav')
  form.set('prompt','A player speaking one short English chess move. Transcribe only what is spoken; do not suggest, correct, or evaluate a move. Silence has no transcript.')
  form.append('languages[]','en')
  for(const keyword of VOICE_KEYWORDS)form.append('keywords[]',keyword)
  const response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey.trim()}`},body:form,signal:AbortSignal.timeout(15000),
  })
  if(!response.ok)throw failure(502,'VOICE_TRANSCRIPTION_FAILED','Could not recognize speech — try again.')
  const result=await response.json()
  if(typeof result.text!=='string'||result.text.length>500)throw failure(502,'VOICE_TRANSCRIPTION_FAILED','Could not recognize speech — try again.')
  return result.text.trim()
}
const publicQuota=q=>({tier:q.tier==='premium'?'premium':'free',limit:Number(q.limit),used:Number(q.used),remaining:Number(q.remaining),resetAt:q.reset_at})
export async function handleChessVoiceRequest(request, dependencies={}) {
  if(!['GET','POST'].includes(request.method))return reply(405,{code:'METHOD_NOT_ALLOWED',error:'Method not allowed'})
  let db,user,reservation,completed=false
  try {
    db=dependencies.db??createServerSupabase()
    user=await authenticateUser(db,request.headers.get('authorization')||'','AI Voice')
    if(user.is_anonymous)throw failure(401,'AUTH_REQUIRED','Log in to use AI Voice.')
    let audio
    if(request.method==='POST'){audio=await readVoiceBody(request);validateVoiceWav(audio)}
    const {data:quota,error}=await db.rpc('chess_voice_quota',{p_user_id:user.id,p_reserve:request.method==='POST'})
    if(error||!quota||typeof quota.allowed!=='boolean')throw failure(503,'VOICE_UNAVAILABLE','AI Voice allowance is unavailable.')
    if(request.method==='GET')return reply(200,{quota:publicQuota(quota),allowed:quota.allowed,code:quota.code})
    if(!quota.allowed)return reply(429,{code:quota.code,quota:publicQuota(quota),error:quota.code==='VOICE_QUOTA_EXCEEDED'?'AI Voice allowance used for today. Mouse and Experimental Browser Voice remain available.':'Please pause briefly before another voice attempt.'})
    reservation=quota.reservation_id
    if(!reservation)throw failure(503,'VOICE_UNAVAILABLE','AI Voice allowance is unavailable.')
    const transcript=await (dependencies.transcribe??transcribeVoice)(audio)
    if(typeof transcript!=='string'||transcript.length>500)throw failure(502,'VOICE_TRANSCRIPTION_FAILED','Could not recognize speech — try again.')
    if(!transcript.trim())throw failure(422,'VOICE_NO_SPEECH','Could not understand — try again.')
    const done=await db.rpc('complete_chess_voice_usage',{p_user_id:user.id,p_reservation_id:reservation})
    if(done.error||done.data!==true)throw failure(503,'VOICE_UNAVAILABLE','Could not confirm voice allowance — try again.')
    completed=true
    return reply(200,{transcript,quota:publicQuota({...quota,used:quota.used+1})})
  } catch(error) {
    // Never log provider error objects, transcripts, audio, tokens, or request bodies.
    const known=error?.[publicFailure]===true
    const status=known?error.status:error?.status===401?401:503
    return reply(status,{
      code:known?error.code:status===401?'AUTH_REQUIRED':'VOICE_UNAVAILABLE',
      error:known?error.message:status===401?'Log in to use AI Voice.':'AI Voice is temporarily unavailable — use Mouse or retry.',
    })
  } finally {
    if(db&&user&&reservation&&!completed){
      try {await db.rpc('release_chess_voice_usage',{p_user_id:user.id,p_reservation_id:reservation})} catch { /* Lease expires; fail closed. */ }
    }
  }
}
