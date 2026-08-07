import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Chess } from 'chess.js'

const root = process.cwd(), source = path.join(root, 'audit-reports/verified-lichess-tactics-v1/atomic-m2-structural-v2.ndjson'), local = path.join(root, '.local-verified-lichess-tactics-v1')
const acceptedFamilies = path.join(root, 'audit-reports/verified-lichess-tactics-v1/atomic-m2-exact-symmetry-family-ids-v3.ndjson')
const output = path.join(local, 'core-motif-onset-v1.ndjson'), checkpoint = path.join(local, 'core-motif-onset-v1-checkpoint.json'), report = path.join(local, 'core-motif-onset-v1-report.json'), review = path.join(local, 'core-motif-onset-v1-review.md'), errors = path.join(local, 'core-motif-onset-v1-errors.ndjson'), lock = path.join(local, 'core-motif-onset-v1.lock')
const resume = process.argv.includes('--resume')
const VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 })
const NAME = Object.freeze({ p:'Pawn', n:'Knight', b:'Bishop', r:'Rook', q:'Queen', k:'King' })
const FOCUSED = new Set(['Knight Fork','Pawn Fork','Bishop Fork','Rook Fork','Queen Fork','King Fork','Bishop Pin','Rook Pin','Queen Pin','Bishop Skewer','Rook Skewer','Queen Skewer','Discovered Attack','Discovered Check','Double Check','Deflection','Removal of Defender by Capture','Decoy / Attraction','Interference','Clearance Sacrifice','File Clearance','Rank Clearance','Diagonal Clearance','Square Clearance'])
const add = (o,k) => { o[k]=(o[k]??0)+1 }
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex')
const parse = (uci) => ({ from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||undefined })
const other = (c) => c==='w'?'b':'w'
const squares = () => Array.from('abcdefgh').flatMap(f=>Array.from('12345678').map(r=>`${f}${r}`))
const allSquares = squares()
const pieces = (game,color) => allSquares.map(square=>({square,piece:game.get(square)})).filter(x=>x.piece?.color===color)
const rays = (game, from) => {
  const piece=game.get(from); if(!piece||!['b','r','q'].includes(piece.type))return[]
  const dirs=piece.type==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:piece.type==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]], files='abcdefgh',x=files.indexOf(from[0]),y=Number(from[1])-1,out=[]
  for(const[dx,dy]of dirs){const hit=[];for(let d=1;d<8;d+=1){const xx=x+dx*d,yy=y+dy*d;if(xx<0||xx>7||yy<0||yy>7)break;const square=`${files[xx]}${yy+1}`,target=game.get(square);if(target){hit.push({square,piece:target});if(hit.length===2)break}}if(hit.length===2)out.push(hit)} return out
}
const attackTargets = (game,from,color) => pieces(game,other(color)).filter(({square,piece}) => (game.attackers(square,color)??[]).includes(from) && (piece.type==='k'||VALUE[piece.type]>=3))
const lineKey=(label,e)=>`${label}|${e.attacker??e.lineAttacker??e.revealedAttacker??''}|${e.pinnedPiece??e.frontTarget??e.rearTarget??e.revealedTarget??''}|${e.protectedTarget??e.checkedKing??''}`
function pinRelations(game,color) { const result=[]; for(const {square:attacker,piece} of pieces(game,color).filter(x=>['b','r','q'].includes(x.piece.type))) for(const [front,rear] of rays(game,attacker)){if(front.piece.color===color||rear.piece.color===color)continue;if(rear.piece.type==='k'||VALUE[rear.piece.type]>VALUE[front.piece.type])result.push({label:`${NAME[piece.type]} Pin`,attacker,pinnedPiece:front.square,protectedTarget:rear.square,pinSubtype:rear.piece.type==='k'?'Absolute Pin':'Relative Pin'})} return result }
function skewerRelations(game,color) { const result=[]; for(const {square:attacker,piece} of pieces(game,color).filter(x=>['b','r','q'].includes(x.piece.type))) for(const [front,rear] of rays(game,attacker)){if(front.piece.color===color||rear.piece.color===color)continue;if(VALUE[front.piece.type]>VALUE[rear.piece.type])result.push({label:`${NAME[piece.type]} Skewer`,attacker,frontTarget:front.square,rearTarget:rear.square})} return result }
function sliderAttacks(game,color) { const found=[]; for(const {square:attacker,piece} of pieces(game,color).filter(x=>['b','r','q'].includes(x.piece.type))) for(const [front] of rays(game,attacker))if(front.piece.color!==color)found.push({attacker,target:front.square,targetPiece:front.piece.type}); return found }
function findings(before, after, played, learner) {
  const result=[]
  const mover=after.get(played.to), enemy=other(learner)
  if(mover){const targets=attackTargets(after,played.to,learner);if(targets.length>=2)result.push({label:`${NAME[mover.type]} Fork`, evidence:{movingPiece:played.to,forkingPiece:NAME[mover.type],targets:targets.map(x=>({square:x.square,piece:NAME[x.piece.type]})),givesCheck:after.isCheck(),royalFork:targets.some(x=>x.piece.type==='k'),targetTypes:targets.map(x=>NAME[x.piece.type]).sort()}})}
  const beforePins=new Set(pinRelations(before,learner).map(x=>lineKey(x.label,x))), beforeSkewers=new Set(skewerRelations(before,learner).map(x=>lineKey(x.label,x)))
  for(const relation of pinRelations(after,learner))if(!beforePins.has(lineKey(relation.label,relation)))result.push({label:relation.label,evidence:relation})
  for(const relation of skewerRelations(after,learner))if(!beforeSkewers.has(lineKey(relation.label,relation)))result.push({label:relation.label,evidence:relation})
  const beforeAttacks=new Set(sliderAttacks(before,learner).map(x=>`${x.attacker}|${x.target}`)), newAttacks=sliderAttacks(after,learner).filter(x=>!beforeAttacks.has(`${x.attacker}|${x.target}`)&&x.attacker!==played.to&&VALUE[x.targetPiece]>=3)
  for(const attack of newAttacks)result.push({label:after.isCheck()?'Discovered Check':'Discovered Attack',evidence:{movedPiece:played.to,revealedAttacker:attack.attacker,revealedTarget:attack.target,checkedKing:after.isCheck()?pieces(after,enemy).find(x=>x.piece.type==='k')?.square:null}})
  if(after.isCheck()){const king=pieces(after,enemy).find(x=>x.piece.type==='k')?.square, checkers=king?(after.attackers(king,learner)??[]):[];if(checkers.length>=2&&checkers.includes(played.to)&&checkers.some(square=>square!==played.to))result.push({label:'Double Check',evidence:{movedPiece:played.to,checkingPieces:checkers,checkedKing:king}})}
  // Causal defender manipulation is deliberately strict: it must alter a
  // concrete defensive relation, not merely finish an already won exchange.
  if(played.captured){const captured=before.get(played.to), beforeDefends=pieces(before,enemy).filter(x=>(before.attackers(x.square,enemy)??[]).includes(played.to)&&VALUE[x.piece.type]>=3), afterNew=sliderAttacks(after,learner).filter(x=>VALUE[x.targetPiece]>=3&&!beforeAttacks.has(`${x.attacker}|${x.target}`));if(captured&&beforeDefends.length&&afterNew.length)result.push({label:'Removal of Defender by Capture',evidence:{capturedDefender:played.to,capturedPiece:NAME[captured.type],defendedTargets:beforeDefends.map(x=>x.square),consequence:afterNew.map(x=>x.target)}})}
  if(!played.captured){const afterNew=sliderAttacks(after,learner).filter(x=>!beforeAttacks.has(`${x.attacker}|${x.target}`)&&VALUE[x.targetPiece]>=3);if(afterNew.length){const [f,r]=[played.from,afterNew[0].target], kind=f[0]===r[0]?'File Clearance':f[1]===r[1]?'Rank Clearance':Math.abs(f.charCodeAt(0)-r.charCodeAt(0))===Math.abs(Number(f[1])-Number(r[1]))?'Diagonal Clearance':'Square Clearance';result.push({label:kind,evidence:{clearingPiece:played.from,clearedSquare:played.from,revealedAttacker:afterNew[0].attacker,benefitingTarget:r}})}}
  return result
}
function mechanismPresent(game, label, learner) {
  if (label.endsWith(' Fork')) {
    const type = ({ Knight:'n', Pawn:'p', Bishop:'b', Rook:'r', Queen:'q', King:'k' })[label.replace(' Fork','')]
    return pieces(game, learner).some(({ square, piece }) => piece.type === type && attackTargets(game, square, learner).length >= 2)
  }
  if (label.endsWith(' Pin')) return pinRelations(game, learner).some((relation) => relation.label === label)
  if (label.endsWith(' Skewer')) return skewerRelations(game, learner).some((relation) => relation.label === label)
  return false
}
function replay(record) { const game=new Chess(record.displayedFen), learner=game.turn(), states=[]; for(let ply=0;ply<record.sourceM2Line.length;ply+=1){const before=new Chess(game.fen()), move=game.move(parse(record.sourceM2Line[ply]));if(!move)throw new Error(`illegal stored line ${record.sourceM2Line[ply]}`);if(move.color===learner)states.push({before,after:new Chess(game.fen()),move,ordinal:states.length+1})} return {learner,states} }
function classify(record) {
  const proposed=record.atomic?.verifiedPrimary?.label
  if(!FOCUSED.has(proposed)) return null
  let trace;try{trace=replay(record)}catch(error){return {proposed,disposition:'INVALID_GEOMETRY',reason:error.message}}
  const expected=record.atomic.extraction==='TRUE_M2'?2:1, state=trace.states[expected-1]
  if(!state) return {proposed,disposition:'INVALID_GEOMETRY',reason:'missing expected learner move'}
  if(state.after.isCheckmate())return {proposed,disposition:'DIRECT_MATE_PRIMARY',reason:'learner move is checkmate',state:expected}
  const found=findings(state.before,state.after,state.move,trace.learner), matching=found.filter(x=>x.label===proposed)
  const otherStrong=found.filter(x=>x.label!==proposed)
  if(!matching.length){const existed=mechanismPresent(state.before,proposed,trace.learner);return {proposed,disposition:existed?'CLEANUP_ONLY':'INVALID_GEOMETRY',reason:existed?'named geometry existed before the learner move':'learner move does not create or execute the proposed mechanism',state:expected,otherStrong}}
  if(otherStrong.length)return {proposed,disposition:'PRIMARY_AMBIGUOUS',reason:`competing mechanism(s): ${otherStrong.map(x=>x.label).join(', ')}`,state:expected,evidence:matching[0].evidence,otherStrong}
  if(expected===2){const first=trace.states[0];if(!first)return {proposed,disposition:'INVALID_GEOMETRY',reason:'TRUE M2 missing setup move'};const firstFound=findings(first.before,first.after,first.move,trace.learner).some(x=>x.label===proposed);if(firstFound)return {proposed,disposition:'CLEANUP_ONLY',reason:'named mechanism already existed after learner setup move',state:expected,evidence:matching[0].evidence}}
  const competing=record.atomic?.verifiedSecondary?.map(x=>x.label).filter(x=>x!==proposed)??[]
  if(competing.length)return {proposed,disposition:'PRIMARY_AMBIGUOUS',reason:`old structural result carries competing primary candidate(s): ${competing.join(', ')}`,state:expected,evidence:matching[0].evidence}
  return {proposed,disposition:'VALID_PRIMARY',reason:'learner move newly creates or executes the named mechanism',stage:expected===1?'M1':'TRUE_M2',state:expected,evidence:matching[0].evidence,cleanupOnly:false,competingMotifs:[]}
}
function insertSample(samples,key,row,limit=100){const bucket=samples[key]??(samples[key]=[]), value=hash(`${row.sourcePuzzleId}|${row.proposed}|${row.disposition}`);bucket.push({...row,_rank:value});bucket.sort((a,b)=>a._rank.localeCompare(b._rank));if(bucket.length>limit)bucket.pop()}
function summary(state){const { families, samples, ...plain}=state;return {...plain,exactSymmetryFamilies:Object.fromEntries(Object.entries(families).map(([k,v])=>[k,v.size])),samples}}
async function loadExactFamilies() {
  const identities = new Map(), lines = readline.createInterface({ input: fs.createReadStream(acceptedFamilies), crlfDelay: Infinity })
  for await (const line of lines) { if (!line) continue; const row = JSON.parse(line); if (identities.has(row.canonicalIdentity)) throw new Error(`duplicate accepted V3 identity ${row.canonicalIdentity}`); identities.set(row.canonicalIdentity, row.exactSymmetryFamilyId) }
  if (!identities.size) throw new Error('accepted V3 exact-symmetry family map is empty')
  return identities
}
async function main(){
  if(fs.existsSync(lock))throw new Error('core onset writer lock exists')
  if(resume&&fs.existsSync(checkpoint))throw new Error('resume intentionally disabled pending output-stat reconciliation; restart only after review')
  if([output,checkpoint,report,review,errors].some(fs.existsSync))throw new Error('core onset outputs exist; do not overwrite accepted audit')
  const familyMap = await loadExactFamilies()
  const state={pipeline:'verified-lichess-core-motif-onset-v1',input:0,eligible:0,dispositions:{},byCourse:{},families:{},samples:{},errors:0,complete:false,acceptedV3FamilyMapEntries:familyMap.size}
  fs.writeFileSync(lock,`${process.pid}\n`)
  try{const writer=fs.createWriteStream(output), errorWriter=fs.createWriteStream(errors), lines=readline.createInterface({input:fs.createReadStream(source),crlfDelay:Infinity});for await(const line of lines){if(!line)continue;state.input+=1;const record=JSON.parse(line), audit=classify(record);if(!audit)continue;state.eligible+=1;add(state.dispositions,audit.disposition);const course=state.byCourse[audit.proposed]??(state.byCourse[audit.proposed]={});add(course,audit.disposition);if(audit.disposition==='VALID_PRIMARY'){add(course,`VALID_PRIMARY_${audit.stage}`);const family=familyMap.get(record.canonicalIdentity);if(!family)throw new Error(`missing accepted V3 family for ${record.canonicalIdentity}`);(state.families[audit.proposed]??(state.families[audit.proposed]=new Set())).add(family);audit.exactSymmetryFamilyId=family}insertSample(state.samples,`${audit.proposed}|${audit.disposition}`,{sourcePuzzleId:record.sourcePuzzleId,rating:record.rating,displayedFen:record.displayedFen,learnerMove:record.sourceM2Line[(audit.state??1)*2-2]??null,proposed:audit.proposed,disposition:audit.disposition,reason:audit.reason,evidence:audit.evidence??null,competing:audit.otherStrong?.map(x=>x.label)??audit.competingMotifs??[]});writer.write(`${JSON.stringify({sourcePuzzleId:record.sourcePuzzleId,canonicalIdentity:record.canonicalIdentity,displayedFen:record.displayedFen,rating:record.rating,sourceM2Line:record.sourceM2Line,audit})}\n`);if(state.input%10000===0)fs.writeFileSync(checkpoint,`${JSON.stringify(summary(state),null,2)}\n`)}await Promise.all([new Promise(resolve=>writer.end(resolve)),new Promise(resolve=>errorWriter.end(resolve))]);state.complete=true;const final=summary(state);fs.writeFileSync(checkpoint,`${JSON.stringify(final,null,2)}\n`);fs.writeFileSync(report,`${JSON.stringify(final,null,2)}\n`);const linesOut=['# Core tactic motif-onset audit','',`Input structural records: ${state.input}; focused-course hypotheses: ${state.eligible}; errors: ${state.errors}.`,''];for(const [course,counts]of Object.entries(state.byCourse).sort()){const valid=counts.VALID_PRIMARY??0,families=state.families[course]?.size??0,m1=counts.VALID_PRIMARY_M1??0,m2=counts.VALID_PRIMARY_TRUE_M2??0;linesOut.push(`## ${course}`,'',`- VALID_PRIMARY: ${valid}; CLEANUP_ONLY: ${counts.CLEANUP_ONLY??0}; DIRECT_MATE_PRIMARY: ${counts.DIRECT_MATE_PRIMARY??0}; DIFFERENT_PRIMARY: ${counts.DIFFERENT_PRIMARY??0}; PRIMARY_AMBIGUOUS: ${counts.PRIMARY_AMBIGUOUS??0}; INVALID_GEOMETRY: ${counts.INVALID_GEOMETRY??0}.`,`- Exact-symmetry families remaining: ${families}; M1 ${m1} (course cap ${m1>=20?Math.min(100,m1):0}); TRUE M2 ${m2} (course cap ${m2>=20?Math.min(160,m2):0}).`,'' );for(const kind of ['VALID_PRIMARY','CLEANUP_ONLY','DIRECT_MATE_PRIMARY','PRIMARY_AMBIGUOUS','INVALID_GEOMETRY']){const samples=state.samples[`${course}|${kind}`]??[];if(!samples.length)continue;linesOut.push(`### ${kind} sample`,'','| Puzzle | Rating | FEN | Learner move | Decision | Reason |','|---|---:|---|---|---|---|',...samples.slice(0,10).map(s=>`| ${s.sourcePuzzleId} | ${s.rating} | \`${s.displayedFen}\` | \`${s.learnerMove}\` | ${s.disposition} | ${s.reason} |`),'')}}fs.writeFileSync(review,`${linesOut.join('\n')}\n`);console.log(JSON.stringify(final,null,2))
  }finally{fs.rmSync(lock,{force:true})}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1})
