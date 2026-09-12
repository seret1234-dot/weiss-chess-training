import { useEffect,useRef,useState } from 'react'
import { aiAudioSupported,openUtteranceCapture } from './utteranceCapture'
import { AiVoiceError,requestAiVoice } from './aiTranscriptionProvider'
import type { VoiceQuota } from './aiTranscriptionProvider'
import type { SpeechTiming } from './speechRecognition'

export function useAiTranscription({enabled,positionKey,getPositionShownAt,onTranscript,onDiagnostic}:{
  enabled:boolean;positionKey:string;getPositionShownAt:()=>number|null
  onTranscript:(transcript:string,timing:SpeechTiming)=>boolean|'continue'
  onDiagnostic?:(message:string)=>void
}){
  const current=useRef({enabled,positionKey,getPositionShownAt,onTranscript,onDiagnostic})
  current.current={enabled,positionKey,getPositionShownAt,onTranscript,onDiagnostic}
  const [status,setStatus]=useState('Microphone off'),[quota,setQuota]=useState<VoiceQuota|null>(null),[blocked,setBlocked]=useState(''),[ready,setReady]=useState(false),[retry,setRetry]=useState(0)
  const supported=aiAudioSupported()
  useEffect(()=>{
    setReady(false)
    if(!enabled||!supported){setStatus(supported?'Microphone off':'AI Voice needs a secure browser with microphone support');return}
    let disposed=false,busy=false,capture:Awaited<ReturnType<typeof openUtteranceCapture>>|undefined,timer:ReturnType<typeof setTimeout>|undefined
    const abort=new AbortController()
    let startupRetries=0
    const valid=()=>!disposed&&current.current.enabled&&current.current.positionKey===positionKey
    const diagnostic=(message:string)=>{if(import.meta.env?.DEV===true&&valid())current.current.onDiagnostic?.(message)}
    async function start(){
      setBlocked('');setStatus('Checking AI Voice allowance…')
      let startupStage='allowance'
      try{
        const initial=await requestAiVoice(null,abort.signal)
        if(!valid())return
        setQuota(initial.quota)
        if(!initial.allowed){setBlocked(initial.code??'VOICE_QUOTA_EXCEEDED');setStatus('AI Voice allowance used for today');return}
        setStatus('Starting microphone…')
        startupStage='capture'
        capture=await openUtteranceCapture(async utterance=>{
          if(!valid()||busy){diagnostic('[capture] ignored: inactive position or transcription already in flight');return}
          const positionShownAt=current.current.getPositionShownAt()
          if(positionShownAt===null||utterance.speechStartedAt<positionShownAt)return
          busy=true;capture?.pause(true);setStatus('Processing…')
          let hold=false
          const transcriptionStartedAt=performance.now()
          diagnostic(`[capture] capturedAudioDurationMs=${utterance.audioDurationMs}; speechStartedAt=${utterance.speechStartedAt}; speechEndedAt=${utterance.speechEndedAt}; positionShownAt=${positionShownAt}; reactionMs=${utterance.speechStartedAt-positionShownAt}`)
          try{
            const result=await requestAiVoice(utterance.audio,abort.signal)
            if(!valid()||current.current.getPositionShownAt()!==positionShownAt)return
            setQuota(result.quota)
            const transcriptionCompletedAt=performance.now()
            diagnostic(`[transcription] transcriptionCompletedAt=${transcriptionCompletedAt}; transcriptionLatencyMs=${transcriptionCompletedAt-transcriptionStartedAt}; returnedTranscript=${JSON.stringify(result.transcript)}`)
            if(typeof result.transcript!=='string'||!result.transcript.trim())throw new AiVoiceError('Could not understand — try again','VOICE_NO_SPEECH')
            const submitted=current.current.onTranscript(result.transcript,{positionShownAt,speechStartedAt:utterance.speechStartedAt,
              speechEndedAt:utterance.speechEndedAt,transcriptionCompletedAt,recognitionCompletedAt:transcriptionCompletedAt})
            // Normal trainer submission changes/locks the position. Silent error
            // consumes this utterance but keeps listening in the same position.
            hold=submitted===true
            if(result.quota.remaining===0){hold=true;setBlocked('VOICE_QUOTA_EXCEEDED');setReady(false);setStatus('AI Voice allowance used for today');capture?.stop()}
          }catch(error){
            if(!valid())return
            const e=error instanceof AiVoiceError?error:new AiVoiceError('Recognition/network error — try again.','VOICE_UNAVAILABLE')
            if(e.quota)setQuota(e.quota)
            const transcriptionCompletedAt=performance.now()
            setReady(false);setStatus(e.message);diagnostic(`[transcription] failure=${e.code}; transcriptionCompletedAt=${transcriptionCompletedAt}; transcriptionLatencyMs=${transcriptionCompletedAt-transcriptionStartedAt}; no chess answer submitted`)
            if(['AUTH_REQUIRED','INVALID_SESSION','VOICE_QUOTA_EXCEEDED'].includes(e.code)){hold=true;setBlocked(e.code);setReady(false);capture?.stop()}
            // No chess/scoring callback on infrastructure failure.
          }finally{
            busy=false
            if(valid()&&!hold){timer=setTimeout(()=>{if(valid()){capture?.pause(false);setReady(true);setStatus('🎙 Listening');diagnostic('[capture] listening resumed; awaiting a new utterance (no transcription retry)')}},700)}
          }
        },()=>{if(valid())setStatus('Command too long — use at most four seconds.')},()=>{if(valid()){setReady(false);setStatus('Microphone disconnected — use Mouse or retry');diagnostic('[capture] failure: microphone disconnected')}},diagnostic)
        if(!valid()){capture.stop();return}
        setReady(true);setStatus('🎙 Listening')
      }catch(error){
        if(!valid())return
        diagnostic(`[${startupStage}] failure=${error instanceof AiVoiceError?error.code:error instanceof Error?error.name:'unknown'}; no chess answer submitted`)
        setBlocked(error instanceof AiVoiceError?error.code:'')
        setStatus(error instanceof AiVoiceError?error.message:'Microphone unavailable — allow permission, use Mouse, or retry.')
        if(error instanceof AiVoiceError&&error.code==='VOICE_UNAVAILABLE'&&startupRetries<3){
          startupRetries++;timer=setTimeout(()=>{if(valid())void start()},1000*startupRetries)
        }
      }
    }
    void start()
    return()=>{disposed=true;abort.abort();clearTimeout(timer);capture?.stop()}
  },[enabled,positionKey,retry,supported])
  return {supported,status,quota,blocked,ready,retry:()=>setRetry(x=>x+1)}
}
