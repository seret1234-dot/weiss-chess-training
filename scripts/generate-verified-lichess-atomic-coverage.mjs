import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { COMPLETE_TAG_COVERAGE } from './lib/verified-lichess-atomic-taxonomy.mjs'

const root = process.cwd()
const local = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const structuralInput = path.join(local, 'atomic-m2-structural-v2.ndjson')
const v3Input = path.join(local, 'atomic-m2-exact-symmetry-family-ids-v3.ndjson')

// Exact counts from the completed 5,751,400-row read-only audit. This report
// never rereads the CSV and V2 family output is intentionally not an input.
const sourceCounts = { short:2923563,endgame:2872209,middlegame:2601527,crushing:2233348,mate:1798376,advantage:1677280,long:1495902,veryLong:472546,oneMove:829879,mateIn1:827330,mateIn2:754980,mateIn3:183515,mateIn4:26799,mateIn5:5754,fork:745629,pin:348205,skewer:127346,discoveredAttack:293993,discoveredCheck:108808,doubleCheck:29968,deflection:249618,attraction:208470,interference:20966,clearance:76436,capturingDefender:38611,sacrifice:433283,hangingPiece:210783,trappedPiece:64831,xRayAttack:20438,intermezzo:70019,quietMove:242065,promotion:137974,underPromotion:1074,enPassant:8173,advancedPawn:356721,defensiveMove:350291,zugzwang:59707,attackingF2F7:41987,exposedKing:172498,kingsideAttack:499855,queensideAttack:86620,backRankMate:193748,smotheredMate:22219,hookMate:9826,anastasiaMate:6951,arabianMate:6897,bodenMate:3446,dovetailMate:3747,doubleBishopMate:3413,killBoxMate:5441,triangleMate:7741,cornerMate:10793,operaMate:63942,pillsburysMate:67649,morphysMate:7135,blindSwineMate:6361,vukovicMate:2445,balestraMate:1364,castling:2422,opening:277664,rookEndgame:308976,pawnEndgame:211537,bishopEndgame:78788,knightEndgame:47735,queenEndgame:66556,queenRookEndgame:43119,master:798484,masterVsMaster:75125,superGM:3132,equality:12886 }
const atomic = [
  ['Knight Fork','fork','moving knight / target combination','forkGeometryAndBestDefense'],['Pawn Fork','fork','moving pawn / checking-royal-family','forkGeometryAndBestDefense'],['Bishop Fork','fork','moving bishop','forkGeometryAndBestDefense'],['Rook Fork','fork','moving rook','forkGeometryAndBestDefense'],['Queen Fork','fork','moving queen','forkGeometryAndBestDefense'],['King Fork','fork','moving king','forkGeometryAndBestDefense'],['Double Attack','fork','non-piece-specific','forkGeometryAndBestDefense'],
  ['Bishop Pin','pin','absolute/relative/functional','pinRelation'],['Rook Pin','pin','absolute/relative/functional','pinRelation'],['Queen Pin','pin','absolute/relative/functional','pinRelation'],['Bishop Skewer','skewer','line piece','skewerRelation'],['Rook Skewer','skewer','line piece','skewerRelation'],['Queen Skewer','skewer','line piece','skewerRelation'],
  ['Discovered Attack','discoveredAttack','revealed line','newlyOpenedLine'],['Discovered Check','discoveredCheck','revealed check','revealedCheck'],['Double Check','doubleCheck','two checkers','twoCheckingPieces'],['Removal of Defender by Capture','capturingDefender','capture','defenderDutyBroken'],['Deflection','deflection','forced departure','defenderDutyBroken'],['Decoy / Attraction','attraction','forced destination','forcedDestination'],['Overload',null,'two duties','overloadDutyProof'],['Interference','interference','blocked defensive line','defensiveLineBlocked'],
  ['Square Clearance','clearance','square','clearedLine'],['File Clearance','clearance','file','clearedLine'],['Rank Clearance','clearance','rank','clearedLine'],['Diagonal Clearance','clearance','diagonal','clearedLine'],['Clearance Sacrifice','clearance','sacrifice','clearanceCompensation'],['X-Ray Attack','xRayAttack','attack','throughPieceLine'],['X-Ray Defense','xRayAttack','defense','throughPieceDefense'],['Hanging Piece','hangingPiece',null,'bestDefenseMaterialGain'],['Trapped Piece','trappedPiece',null,'escapeEnumeration'],['Desperado','sacrifice','doomed piece','desperadoProof'],['Exchange Sacrifice','sacrifice','rook/queen for lower material','exchangeCompensation'],['General Sacrifice','sacrifice','compensation','sacrificeCompensation'],['Zwischenzug','intermezzo','intermediate forcing move','intermediateMove'],['Zwischencheck','intermezzo','checking intermediate','intermediateCheck'],['Quiet Tactical Move','quietMove',null,'quietDecisiveThreat'],['Promotion','promotion',null,'promotionCentrality'],['Knight Underpromotion','underPromotion','knight','underpromotionNecessity'],['Rook Underpromotion','underPromotion','rook','underpromotionNecessity'],['Bishop Underpromotion','underPromotion','bishop','underpromotionNecessity'],['En Passant Tactic','enPassant',null,'enPassantObjective'],['Advanced Pawn Tactic','advancedPawn',null,'advancedPawnConcreteThreat'],['Attack on f2/f7','attackingF2F7','f2/f7','kingWeaknessObjective'],['Exposed King Tactic','exposedKing',null,'forcedExposure'],['Kingside Tactical Attack','kingsideAttack',null,'concreteKingObjective'],['Queenside Tactical Attack','queensideAttack',null,'concreteKingObjective'],['Defensive Capture','defensiveMove','capture','defenseClassifier'],['Defensive Interposition','defensiveMove','interposition','defenseClassifier'],['Defensive Counterattack','defensiveMove','counterattack','defenseClassifier'],['Perpetual Check Defense','defensiveMove','perpetual','defenseClassifier'],['Stalemate Defense','defensiveMove','stalemate','defenseClassifier'],['Promotion Defense','defensiveMove','promotion','defenseClassifier'],['Tactical Simplification','defensiveMove','simplification','defenseClassifier'],['Zugzwang','zugzwang',null,'allLegalMovesWorsen'],['Stalemate Tactic',null,'stalemate','stalemateProof'],['Stalemate Avoidance',null,'avoidance','stalemateAvoidanceProof'],
]
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1)

async function main() {
  if (!fs.existsSync(v3Input)) throw new Error('V3 exact-symmetry output is required for final coverage family counts')
  const primary = new Map(), secondary = new Map(), extraction = new Map(), families = new Map(), overlaps = new Map()
  const multi = { verified: 0, withSecondary: 0, secondaryLinks: 0 }
  const structuralLines = readline.createInterface({ input: fs.createReadStream(structuralInput), crlfDelay: Infinity })
  for await (const line of structuralLines) {
    if (!line) continue
    const record = JSON.parse(line), atomicRecord = record.atomic
    if (atomicRecord.status !== 'STRUCTURAL_VALID') continue
    const label = atomicRecord.verifiedPrimary.label
    bump(primary, label); bump(extraction, `${label}|${atomicRecord.extraction}`); multi.verified += 1
    if (atomicRecord.verifiedSecondary.length) {
      multi.withSecondary += 1
      for (const secondaryRecord of atomicRecord.verifiedSecondary) {
        bump(secondary, secondaryRecord.label); bump(overlaps, `${label} -> ${secondaryRecord.label}`); multi.secondaryLinks += 1
      }
    }
  }
  const v3Lines = readline.createInterface({ input: fs.createReadStream(v3Input), crlfDelay: Infinity })
  for await (const line of v3Lines) {
    if (!line) continue
    const record = JSON.parse(line)
    if (!families.has(record.primaryTheme)) families.set(record.primaryTheme, new Set())
    families.get(record.primaryTheme).add(record.pedagogicalFamilyId)
  }
  const rows = atomic.map(([type, tag, subtype, validator]) => {
    const verified = primary.get(type) ?? 0, sourceCount = tag ? sourceCounts[tag] ?? 0 : 0
    const status = verified ? 'structurally supported' : tag && sourceCount ? 'validator not yet implemented' : 'unavailable'
    return { atomicType:type,sourceTag:tag,sourceCount,subtype,validator,validatorStatus:status,structurallyVerified:verified,primaryThemeCount:verified,secondaryThemeCount:secondary.get(type)??0,extractableM1:extraction.get(`${type}|EXTRACTABLE_M1`)??0,trueM2:extraction.get(`${type}|TRUE_M2`)??0,pedagogicalFamilies:families.get(type)?.size??0,disposition:verified?'candidate parent course; individual validation required':tag&&sourceCount?'unavailable pending validator':'unavailable',reason:verified?'structural evidence only; no final engine approval yet':tag&&sourceCount?'candidate tag exists but no atomic validator is implemented':'no source-tag candidate or no precise validator' }
  })
  const tagRows = Object.entries(COMPLETE_TAG_COVERAGE).map(([tag, [family, subtype, validator, mode]]) => ({ sourceTag:tag,sourceCount:sourceCounts[tag]??0,canonicalAtomicFamily:family,canonicalSubtype:subtype,validator,mode,disposition:mode==='metadata'?'metadata-only':mode==='parent'?'atomic parent candidate':'unavailable pending validator' }))
  const summary = { inputExactDeduplicated:1017581,verifiedPrimary:multi.verified,withSecondary:multi.withSecondary,secondaryLinks:multi.secondaryLinks,atomicRows:rows,sourceTagRows:tagRows,topOverlaps:[...overlaps.entries()].sort((a,b)=>b[1]-a[1]).slice(0,80).map(([pair,count])=>({pair,count})),coverageGaps:tagRows.filter(row=>!(row.sourceTag in sourceCounts)),familySystem:'V3 exact symmetry; duplicate/diversity grouping only; never semantic or engine certification',stockfishPlan:{individualFinalRule:'Every selected retained record, not a family representative, receives semantic and Stockfish validation where required.',maxStructuralCourseCandidatesPerType:{derivedM1:100,trueM2:160},minimumApprovedToActivate:20} }
  fs.writeFileSync(path.join(local, 'atomic-taxonomy-coverage-v3.json'), `${JSON.stringify(summary, null, 2)}\n`)
  const markdown = ['# Atomic tactics taxonomy coverage','',`Verified primary records: ${multi.verified}`,`Records with verified secondary motifs: ${multi.withSecondary}`,`Secondary links: ${multi.secondaryLinks}`,'','V3 exact-symmetry/pedagogical family IDs are duplicate/diversity grouping only; they never certify semantic correctness or engine soundness.','','| Atomic type | Source tag | Source count | Primary | Secondary | M1 | TRUE M2 | V3 families | Status |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',...rows.map(row=>`| ${row.atomicType} | ${row.sourceTag??'—'} | ${row.sourceCount} | ${row.primaryThemeCount} | ${row.secondaryThemeCount} | ${row.extractableM1} | ${row.trueM2} | ${row.pedagogicalFamilies} | ${row.validatorStatus} |`)]
  fs.writeFileSync(path.join(local, 'atomic-taxonomy-coverage-v3.md'), `${markdown.join('\n')}\n`)
  console.log(JSON.stringify({ primary:multi.verified, withSecondary:multi.withSecondary, secondaryLinks:multi.secondaryLinks, atomicRows:rows.length, tagRows:tagRows.length }, null, 2))
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
