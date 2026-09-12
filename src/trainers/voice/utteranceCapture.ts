/** Local PCM/VAD only: no network and no session recording. */
export type CapturedUtterance = { audio: Blob; audioDurationMs: number; speechStartedAt: number; speechEndedAt: number }
const PRE_ROLL_MS = 250
const END_SILENCE_MS = 500
const MAX_AUDIO_MS = 4000
export function encodeVoiceWav(samples: Float32Array, rate: number) {
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer)
  const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))}
  text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ')
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true)
  view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true)
  samples.forEach((value,index)=>view.setInt16(44+index*2,Math.round(Math.max(-1,Math.min(1,value))*(value<0?32768:32767)),true))
  return new Blob([buffer],{type:'audio/wav'})
}
export class UtteranceDetector {
  private frames: Float32Array[]=[]
  private pre: Float32Array[]=[]
  private count=0
  private started: number|null=null
  private ended=0
  private quietUntil=0
  constructor(private rate:number,private onUtterance:(value:CapturedUtterance)=>void,private onTooLong:()=>void,private onDiagnostic?:(message:string)=>void){}
  reset(){this.frames=[];this.pre=[];this.count=0;this.started=null;this.ended=0}
  feed(samples:Float32Array,at:number){
    const duration=samples.length/this.rate*1000
    const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length)
    const loud=rms>0.018
    if(at<this.quietUntil){if(loud)this.quietUntil=at+350;return}
    if(this.started===null){
      if(!loud){
        this.pre.push(samples.slice())
        let excess=this.pre.reduce((n,x)=>n+x.length,0)-Math.floor(this.rate*PRE_ROLL_MS/1000)
        while(excess>0){
          if(this.pre[0].length<=excess){excess-=this.pre.shift()!.length}
          else{this.pre[0]=this.pre[0].slice(excess);excess=0}
        }
        return
      }
      // Reaction timing is the detected speech onset, not the start of pre-roll.
      this.started=at-duration;this.frames=this.pre;this.pre=[];this.count=this.frames.reduce((n,x)=>n+x.length,0)
    }
    if(this.count+samples.length>this.rate*MAX_AUDIO_MS/1000){this.onDiagnostic?.(`[capture] rejected: four-second audio limit; capturedAudioDurationMs=${this.count/this.rate*1000}; speechStartedAt=${this.started}; speechEndedAt=${this.ended}`);this.reset();this.quietUntil=at+350;this.onTooLong();return}
    this.frames.push(samples.slice());this.count+=samples.length
    if(loud)this.ended=at
    if(!loud&&at-this.ended>=END_SILENCE_MS){
      const start=this.started,end=this.ended,out=new Float32Array(this.count);let offset=0
      const audioDurationMs=this.count/this.rate*1000
      for(const frame of this.frames){out.set(frame,offset);offset+=frame.length}
      this.reset()
      if(end-start>=120)this.onUtterance({audio:encodeVoiceWav(out,this.rate),audioDurationMs,speechStartedAt:start,speechEndedAt:end})
      else this.onDiagnostic?.(`[capture] rejected: speech shorter than noise guard; capturedAudioDurationMs=${audioDurationMs}; speechStartedAt=${start}; speechEndedAt=${end}`)
    }
  }
}
export function aiAudioSupported(){return typeof navigator!=='undefined'&&!!navigator.mediaDevices?.getUserMedia&&typeof AudioContext!=='undefined'&&typeof AudioWorkletNode!=='undefined'}
export async function openUtteranceCapture(onUtterance:(value:CapturedUtterance)=>void,onTooLong:()=>void,onDeviceLost:()=>void,onDiagnostic?:(message:string)=>void){
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
  let context:AudioContext|undefined,source:MediaStreamAudioSourceNode|undefined,node:AudioWorkletNode|undefined,muted:GainNode|undefined
  let paused=false,closed=false,detector:UtteranceDetector|undefined
  const stop=()=>{if(closed)return;closed=true;detector?.reset();if(node)node.port.onmessage=null;node?.disconnect();source?.disconnect();muted?.disconnect();for(const track of stream.getTracks())track.stop();void context?.close().catch(()=>{})}
  try{
    context=new AudioContext({sampleRate:16000})
    if(context.sampleRate>48000)throw Error('Unsupported microphone sample rate')
    await context.audioWorklet.addModule(new URL('./pcm-capture.worklet.js',import.meta.url).href)
    source=context.createMediaStreamSource(stream);node=new AudioWorkletNode(context,'chess-utterance-pcm');muted=context.createGain();muted.gain.value=0
    detector=new UtteranceDetector(context.sampleRate,onUtterance,onTooLong,onDiagnostic)
    node.port.onmessage=event=>{if(!closed&&!paused&&event.data instanceof Float32Array)detector!.feed(event.data,performance.now())}
    for(const track of stream.getAudioTracks())track.onended=()=>{if(!closed){onDeviceLost();stop()}}
    source.connect(node);node.connect(muted);muted.connect(context.destination);await context.resume()
    return {stop,pause(value:boolean){paused=value;detector?.reset()}}
  }catch(error){stop();throw error}
}
