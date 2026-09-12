import { supabase } from '../../lib/supabase'
export type VoiceQuota={tier:'free'|'premium';limit:number;used:number;remaining:number;resetAt:string}
export class AiVoiceError extends Error {
  constructor(message:string,public code:string,public quota?:VoiceQuota){super(message)}
}
/** Vendor-independent browser boundary: audio goes only to our authenticated API. */
export async function requestAiVoice(audio:Blob|null,signal:AbortSignal):Promise<{transcript?:string;quota:VoiceQuota;allowed?:boolean;code?:string}>{
  const {data:{session}}=await supabase.auth.getSession()
  if(!session)throw new AiVoiceError('Log in to try AI Voice.','AUTH_REQUIRED')
  const response=await fetch('/api/chess-voice-transcribe',{
    method:audio?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(audio?{'Content-Type':'audio/wav'}:{})},
    ...(audio?{body:audio}:{}),signal,cache:'no-store',
  }).catch(()=>{throw new AiVoiceError('Recognition/network error — try again.','VOICE_UNAVAILABLE')})
  const body=await response.json().catch(()=>null)
  if(!response.ok)throw new AiVoiceError(body?.error??'AI Voice is temporarily unavailable — try again.',body?.code??'VOICE_UNAVAILABLE',body?.quota)
  if(!body?.quota)throw new AiVoiceError('AI Voice returned an invalid response.','VOICE_UNAVAILABLE')
  return body
}
