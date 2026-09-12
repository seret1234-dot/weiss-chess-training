import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { validateVoiceWav } from '../server/chess-voice-core.mjs'
const vite=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const {UtteranceDetector,encodeVoiceWav}=await vite.ssrLoadModule('/src/trainers/voice/utteranceCapture.ts')
 const {interpretChessAnswer}=await vite.ssrLoadModule('/src/trainers/voice/chessVoiceParser.ts')
 const utterances=[];let tooLong=0,now=0
 const diagnostics=[]
 const detector=new UtteranceDetector(16000,value=>utterances.push(value),()=>tooLong++,message=>diagnostics.push(message))
 function frames(n,loud=false){for(let i=0;i<n;i++){now+=10;detector.feed(new Float32Array(160).fill(loud?.1:0),now)}}
 frames(10000);assert.equal(utterances.length,0,'silence never uploads')
 const start=now;frames(70,true);frames(50)
 assert.equal(utterances.length,1);assert.equal(utterances[0].speechStartedAt,start);assert.equal(utterances[0].speechEndedAt,start+700)
 assert.ok(Math.abs(validateVoiceWav(Buffer.from(await utterances[0].audio.arrayBuffer()))-1.45)<.0001,'250ms pre-roll + speech + 500ms trailing silence retained')
 assert.equal(utterances[0].audioDurationMs,1450)
 frames(450,true);frames(60);assert.equal(tooLong,1);assert.equal(utterances.length,1,'overlong commands discarded, never uploaded')
 frames(5,true);frames(60);assert.equal(utterances.length,1,'short noise ignored')
 frames(20,true);detector.reset();frames(60);assert.equal(utterances.length,1,'pause/reset discards partial audio')
 frames(80,true);frames(50);assert.equal(utterances.length,2,'listening continues after rejection/reset')
 assert.equal(detector.frames.length,0,'completed raw frames are released')
 assert.equal(detector.started,null,'no session-length recording state')
 detector.reset();assert.equal(detector.pre.length,0,'disposal releases pre-roll')
 assert.ok(diagnostics.some(x=>x.includes('[capture] rejected: four-second')))
 assert.ok(diagnostics.some(x=>x.includes('noise guard')))
 // Mark quiet consonant/onset samples below VAD threshold; retain them even
 // when the 250ms ring boundary falls inside a real 128-sample worklet frame.
 let clock=0;const clips=[]
 const short=new UtteranceDetector(16000,v=>clips.push(v),()=>assert.fail('short command exceeded limit'))
 const feed=(n,value)=>{for(let i=0;i<n;i++){clock+=8;short.feed(new Float32Array(128).fill(value),clock)}}
 feed(50,.01);const onset=clock;feed(20,.1);feed(62,0)
 assert.equal(clips.length,0,'496ms silence does not close early')
 feed(1,0);assert.equal(clips.length,1)
 assert.equal(clips[0].speechStartedAt,onset,'pre-roll never shifts mastery speech-start')
 assert.equal(clips[0].speechEndedAt,onset+160)
 const wav=new DataView(await clips[0].audio.arrayBuffer())
 assert.equal(wav.getInt16(44,true),Math.round(.01*32767),'quiet beginning retained')
 assert.equal(wav.getInt16(44+3999*2,true),Math.round(.01*32767),'exact 250ms pre-roll retained')
 assert.equal(wav.getInt16(44+4000*2,true),Math.round(.1*32767),'speech starts after padding')
 assert.equal(clips[0].audioDurationMs,914)
 feed(100,0);assert.equal(clips.length,1,'continued silence never duplicates an utterance')
 const rankStart=clock;feed(20,.1);feed(53,0)
 assert.equal(clips.length,1,'424ms pause before final rank remains inside command')
 feed(20,.2);const rankEnd=clock;feed(63,0)
 assert.equal(clips.length,2,'final rank retained in the same utterance')
 assert.equal(clips[1].speechStartedAt,rankStart);assert.equal(clips[1].speechEndedAt,rankEnd)
 const rankWav=new DataView(await clips[1].audio.arrayBuffer())
 assert.equal(rankWav.getInt16(44+(4000+20*128+53*128)*2,true),Math.round(.2*32767))
 for(const clip of clips)assert.ok(clip.audioDurationMs<=4000)
 for(const rate of [8000,16000,48000])assert.equal(validateVoiceWav(Buffer.from(await encodeVoiceWav(new Float32Array(rate),rate).arrayBuffer())),1)
 const rook='4r2k/8/8/8/8/8/8/K3R3 w - - 0 1'
 assert.equal(interpretChessAnswer(rook,'rook e eight').kind,'legal')
 const queen='7k/8/6K1/7Q/8/8/8/8 w - - 0 1'
 assert.equal(interpretChessAnswer(queen,'queen h seven').kind,'legal')
 assert.equal(interpretChessAnswer(queen,'queen e three').kind,'illegal')
 assert.equal(interpretChessAnswer(queen,'hello').kind,'none')
 assert.equal(interpretChessAnswer(queen,'queen...').kind,'none')
 assert.equal(interpretChessAnswer('7k/8/8/8/8/8/8/KR3R2 w - - 0 1','rook d one').kind,'ambiguous')
 console.log('PASS AI capture: exact 250ms pre-roll, short onset/final rank retained, 500ms silence, unchanged speech timing, no duplicates, four-second total cap, noise/reset/restart, legal/illegal/ambiguous parser')
}finally{await vite.close()}
