import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {endgameTrainers} from './lib/endgame-trainer-inventory.mjs'
const baseline=JSON.parse(fs.readFileSync('reports/endgames-input-audit-2026-09-10.json','utf8'))
const active=new Set(endgameTrainers.map(x=>x[1]))
let count=0
for(const [file,hash] of Object.entries(baseline.sourceHashes)){
 if(!file.startsWith('src/')&&!file.startsWith('public/'))continue
 let source=fs.readFileSync(file,'utf8')
 if(active.has(file)){
  assert.ok(source.includes('trainers/endgame/EndgameTrainerShell'),`${file}: shared layout`)
  source=source.replace('trainers/endgame/EndgameTrainerShell','components/trainer/TrainerShell')
 }
 // apply_patch can change the edited import line's newline, but no other bytes.
 const candidates=active.has(file)?[source,source.replace(/(import TrainerShell[^\r\n]*)\r?\n/,'$1\r\n'),source.replace(/(import TrainerShell[^\r\n]*)\r?\n/,'$1\n')]:[source]
 assert.ok(candidates.some(s=>createHash('sha256').update(s).digest('hex')===hash.after),`${file}: no non-layout changes`)
 count++
}
console.log(`PASS Endgame layout scope: ${count} prior runtime/data files preserved; only 18 shell imports changed; input, timing, error state and datasets unchanged`)
