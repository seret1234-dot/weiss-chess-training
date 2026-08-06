import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { parse } from 'csv-parse'
import { Chess } from 'chess.js'
import { CSV_COLUMNS, actualStage, parseMoves } from './lib/verified-lichess-csv.mjs'

const root = process.cwd(), csv = 'C:/Users/Ariel/chess-trainer/lichess_db_puzzle.csv'
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const output = path.join(local, 'exhaustive-b2-intermezzo.ndjson'), checkpoint = path.join(local, 'exhaustive-b2-intermezzo-checkpoint.json')
const TOTAL = 5751400, resume = process.argv.includes('--resume'), tag = 'intermezzo'
const identity = () => { const s = fs.statSync(csv); return crypto.createHash('sha256').update(`${s.size}:${s.mtimeMs}`).digest('hex') }
const write = (file, value) => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file) }
const record = (row, moves, tags) => { const source = new Chess(row.FEN), shown = new Chess(row.FEN); for (const u of moves) if (!source.move({ from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined })) throw Error('illegal full line'); if (!shown.move({ from:moves[0].slice(0,2),to:moves[0].slice(2,4),promotion:moves[0][4]||undefined })) throw Error('illegal pre-move'); return {sourcePuzzleId:row.PuzzleId,sourceFen:row.FEN,displayedFen:shown.fen(),preMove:moves[0],sourceM2Line:moves.slice(1),sourceStage:actualStage(moves),rating:Number(row.Rating),popularity:Number(row.Popularity),playCount:Number(row.NbPlays),rawLichessTags:tags,sourceGameUrl:row.GameUrl} }
async function main(){fs.mkdirSync(local,{recursive:true});const id=identity(), prior=resume&&fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;if(prior&&prior.identity!==id)throw Error('CSV identity changed');let seen=new Set(), state={identity:id,rowsRead:0,selected:0,duplicates:0,errors:0,complete:false};if(fs.existsSync(output)){for await(const l of readline.createInterface({input:fs.createReadStream(output),crlfDelay:Infinity})){if(!l)continue;const x=JSON.parse(l);if(seen.has(x.source.sourcePuzzleId))throw Error('duplicate output');seen.add(x.source.sourcePuzzleId);state.selected++}}if(prior&&prior.selected!==state.selected)throw Error('checkpoint/output mismatch');const skip=prior?.rowsRead??0, out=fs.createWriteStream(output,{flags:fs.existsSync(output)?'a':'w'}), parser=parse({columns:CSV_COLUMNS,from_line:2,bom:true});fs.createReadStream(csv).pipe(parser);let n=0;for await(const row of parser){n++;if(n<=skip)continue;state.rowsRead=n;const tags=String(row.Themes??'').trim().split(/\s+/).filter(Boolean);if(!tags.includes(tag)){if(n%5000===0)write(checkpoint,state);continue}if(seen.has(row.PuzzleId)){state.duplicates++;continue}try{const moves=parseMoves(row.Moves);if(moves.length<3)throw Error('too short');const source=record(row,moves,tags);out.write(`${JSON.stringify({source})}\n`);seen.add(source.sourcePuzzleId);state.selected++}catch{state.errors++}if(n%5000===0)write(checkpoint,state)}await new Promise(r=>out.end(r));state.rowsRead=n;state.complete=true;write(checkpoint,state);console.log(JSON.stringify({...state,expected:TOTAL},null,2))}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1})
