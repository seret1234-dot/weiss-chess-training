// Isolated browser fixture: fake capture/provider only; real UI/parser/timing adapter.
import React,{useRef,useState,useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Chess} from 'chess.js'
import VoiceMoveInput from '../src/trainers/voice/VoiceMoveInput'
import {useTrainerInputMode} from '../src/trainers/voice/useTrainerInputMode'
import {PuzzlePerfectionTracker} from '../src/trainers/puzzlePerfection'
import {submitVoiceMove,submitIllegalVoiceAnswer} from '../src/trainers/voice/submitVoiceMove'
function Fixture(){
 const input=useTrainerInputMode(),tracker=useRef(new PuzzlePerfectionTracker())
 const [key,setKey]=useState(0),[fen,setFen]=useState(new Chess().fen()),[done,setDone]=useState(false)
 const [result,setResult]=useState('Ready'),[calls,setCalls]=useState(0)
 function reset(){tracker.current.resetAttempt();tracker.current.activateLearnerPosition(performance.now(),['e2e4']);setFen(new Chess().fen());setDone(false);setResult('Ready');setKey(x=>x+1)}
 useEffect(reset,[])
 function mouse(){setCalls(x=>x+1);setResult('Mouse action')}
 return <><button onClick={reset}>Next fixture</button><button disabled={!input.mouseEnabled} onClick={mouse}>Mouse move</button>
 <VoiceMoveInput fen={fen} positionKey={`${key}:${fen}`} disabled={done} mode={input.mode} setMode={input.setMode} onAiReady={input.setAiReady}
 getPositionShownAt={()=>tracker.current.snapshot().positionActiveAt}
 onIllegalAnswer={(command,timing)=>submitIllegalVoiceAnswer(fen,command,timing,tracker.current,()=>{tracker.current.markSilentError();setCalls(x=>x+1);setResult('Wrong, silent error')})}
 onMove={(move,timing)=>submitVoiceMove(fen,move,timing,tracker.current,(from,to,options)=>{
 setCalls(x=>x+1)
 if(`${from}${to}`!=='e2e4'){tracker.current.markSubmittedWrongMove();setResult('Wrong move — try again.');return false}
 const board=new Chess(fen);board.move({from,to,promotion:options.promotion});setFen(board.fen());setDone(true)
 setResult(tracker.current.isPerfectSolve()?'Qualifying':'Not qualifying');return true
 })}/><p data-testid="result">{result}</p><p data-testid="calls">{calls}</p></>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
