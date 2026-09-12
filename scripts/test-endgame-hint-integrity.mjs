import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {endgameTrainers} from './lib/endgame-trainer-inventory.mjs'

const snapshot=process.env.ENDGAME_HINT_BEFORE_SNAPSHOT
assert.ok(snapshot,'Set ENDGAME_HINT_BEFORE_SNAPSHOT to the pre-Hint-repair snapshot')
const hashes=JSON.parse(fs.readFileSync(path.join(snapshot,'hashes.json'),'utf8'))
const oldCall='<HintButton onClick={() => void showHintAction()}>'
// Legacy helpers already reveal their hint/message themselves. Returning null
// deliberately avoids adding the separate two-stage move overlay on top.
const newCall='<HintButton getHintMove={async () => { await showHintAction(); return null }}>'
const affected=[]
let data=0
for(const file of Object.keys(hashes)){
 const before=fs.readFileSync(path.join(snapshot,file),'utf8').replaceAll('\r\n','\n')
 const after=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')
 const active=endgameTrainers.find(([,f])=>f===file)
 const expected=active?before.replace(oldCall,newCall):before
 if(active&&before.includes(oldCall))affected.push(active[0])
 assert.equal(after,expected,`${file}: only the approved Hint callback changes; original helper/data/text/layout/input preserved`)
 if(file.endsWith('.json'))data++
}
assert.equal(affected.length,12,'exactly the 12 active Study callers repaired')
console.log(`PASS Hint scope: ${affected.length} one-line callbacks; ${data} data files unchanged; all other snapshotted source unchanged`)
console.log(affected.join('\n'))
