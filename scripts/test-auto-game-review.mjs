import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { Chess } from 'chess.js'
const bundled=await build({entryPoints:['src/training/autoGameReview.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)
const {saveAutoGameResult:save,readAutoGameReview:read,saveAutoGameAnalysis:analyze,saveAutoExplainedReview:review}=module.exports
const entries=new Map();let writes=0
globalThis.localStorage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>{writes++;entries.set(k,v)}}
const game=new Chess();for(const move of ['f3','e5','g4','Qh4#'])game.move(move);game.header('Result','0-1')
const input={userId:'A',id:'game-1',pgn:game.pgn(),result:'0-1',playerColor:'white'}
const original=save(input);assert.equal(writes,1);assert.deepEqual(save(input),original);assert.equal(writes,1,'completion handoff is idempotent')
assert.equal(read('B',input.id),null,'B cannot read A review');assert.equal(read(null,input.id),null)
assert.throws(()=>review('A',input.id,1),/Complete analysis/)
const snapshot={classifications:{},losses:{},best:{},unavailable:{},lines:{},coverage:{white:{eligible:2,evaluated:2,unavailable:0},black:{eligible:2,evaluated:2,unavailable:0}},counts:{},accuracyWhite:100,accuracyBlack:100}
analyze('A',input.id,snapshot);const afterAnalysis=writes;analyze('A',input.id,snapshot);assert.equal(writes,afterAnalysis,'completed analysis is reused')
assert.equal(review('A',input.id,4).explainedReview.furthestPly,0,'Last is not sequential completion')
assert.throws(()=>review('A',input.id,4,true),/every move/)
review('A',input.id,0);for(let ply=1;ply<=4;ply++)review('A',input.id,ply)
const completed=review('A',input.id,4,true);assert(completed.explainedReview.completedAt)
const afterCompletion=writes;review('A',input.id,0,'skip');assert.equal(writes,afterCompletion,'terminal review rejects stale actions')
save({...input,userId:'B'});assert.equal(read('B',input.id).snapshot,undefined,'B gets only B state')
save({...input,id:'skip'});analyze('A','skip',snapshot);review('A','skip',1)
const skipped=review('A','skip',1,'skip');assert(skipped.explainedReview.skippedAt);assert.equal(skipped.explainedReview.completedAt,undefined);assert.equal(skipped.explainedReview.furthestPly,1)
for(const [id,moves,result] of [['white-mate',['e4','f6','d4','g5','Qh5#'],'1-0'],['resign',['e4'],'0-1'],['repetition',['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'],'1/2-1/2']]){
 const c=new Chess();for(const move of moves)c.move(move);c.header('Result',result)
 assert.equal(save({...input,id,pgn:c.pgn(),result}).result,result)
}
assert.throws(()=>save({...input,id:'unfinished',result:'*'}),/completed/)
for(const [id,fen] of [['stalemate','7k/5K2/6Q1/8/8/8/8/8 b - - 0 1'],['insufficient','7k/8/6K1/8/8/8/8/8 w - - 0 1']]) {
 const c=new Chess(fen);assert(c.isDraw());c.header('Result','1/2-1/2')
 save({...input,id,pgn:c.pgn(),result:'1/2-1/2'});analyze('A',id,snapshot)
 assert(review('A',id,0,true).explainedReview.completedAt,'zero-move terminal position needs no invented review move')
}
const savedA=read('A',input.id);assert.deepEqual(savedA,completed,'A still owns the original reviewed game')
console.log('PASS Auto game result/analysis/review: account isolation, legal mates/both sides, resignation/repetition, idempotency, exact PGN, Last guard, sequential completion, skip and terminal resume')
