import { Chess } from 'chess.js'
import type { Move, PieceSymbol, Square } from 'chess.js'
import { supabase } from '../lib/supabase'
import { TRAINER_CATALOG } from './trainerCatalog'

export type TransferCategory = 'mates' | 'tactics'
export type TransferOpportunityStatus = 'offered' | 'recognized' | 'missed'

export type TransferTarget = {
 patternKey: string
 label: string
 category: TransferCategory
 sourceTrainerKey: string
 sourceRoute: string
 trainedAt: string
}

export type TransferOpportunity = {
 id: string
 targetKey: string
 targetLabel: string
 category: TransferCategory
 computerMove: string
 expectedStudentMove: string
 createdAtPly: number
 createdAt: string
 status: TransferOpportunityStatus
 resolvedAtPly?: number
 resolvedAt?: string
 playedMove?: string
}

export type TargetedComputerCandidate = {
 computerMove: string
 opportunity: {
  expectedStudentMove: string
  score: number
  description: string
 }
 afterFen: string
}

type RecentAutoRecord = {
 trainerKey: string
 route: string
 trainedAt: string
}

const RECENT_AUTO_STORAGE_KEY = 'weiss-recent-auto-patterns-v1'
const MAX_RECENT_RECORDS = 40
const MAX_RECENT_AGE_MS = 45 * 24 * 60 * 60 * 1000

const SUPPORTED_MATE_PATTERNS = new Set([
 'anastasia',
 'arabian',
 'back-rank',
 'boden',
 'double-bishop',
 'double-bishop-mate-3-plus',
 'dovetail',
 'hook',
 'kill-box',
 'mixed',
 'smothered',
])

const SUPPORTED_TACTIC_PATTERNS = new Set([
 'advanced-pawn',
 'discovered-attack',
 'discovered-check',
 'double-check',
 'fork-bishop',
 'fork-king',
 'fork-knight',
 'fork-pawn',
 'fork-queen',
 'fork-rook',
 'hanging-piece',
 'kingside-attack',
 'pin-bishop',
 'pin-other',
 'pin-queen',
 'pin-rook',
 'promotion',
 'queenside-attack',
 'skewer-bishop',
 'skewer-other',
 'skewer-queen',
 'skewer-rook',
 'trapped-piece',
 'underpromotion',
 'underpromotion-knight',
 'vulnerable-king',
])

const PIECE_VALUE: Record<PieceSymbol, number> = {
 p: 100,
 n: 320,
 b: 330,
 r: 500,
 q: 900,
 k: 1200,
}

function nowIso() {
 return new Date().toISOString()
}

function normalizeTrainerPattern(trainerKey: string) {
 if (trainerKey.startsWith('tactic-')) {
  return trainerKey.replace(/^tactic-/, '').replace(/-m\d+$/, '')
 }

 return trainerKey
  .replace(/-mate-in-\d+(?:-plus)?$/, '')
  .replace(/-mate-\d+(?:-plus)?$/, '')
}

function targetFromTrainerKey(
 trainerKey: string,
 route = '',
 trainedAt = nowIso(),
): TransferTarget | null {
 const entry = TRAINER_CATALOG.find((item) => item.trainerKey === trainerKey)
 const category = entry?.category

 if (category !== 'mates' && category !== 'tactics') return null

 const patternKey = normalizeTrainerPattern(trainerKey)
 const supported =
  category === 'mates'
   ? SUPPORTED_MATE_PATTERNS.has(patternKey)
   : SUPPORTED_TACTIC_PATTERNS.has(patternKey)

 if (!supported) return null

 return {
  patternKey,
  label: entry?.title?.replace(/\s+in\s+\d+(?:\+)?$/i, '') || patternKey,
  category,
  sourceTrainerKey: trainerKey,
  sourceRoute: entry?.route || route,
  trainedAt,
 }
}

function readRecentAutoRecords(): RecentAutoRecord[] {
 if (typeof window === 'undefined') return []

 try {
  const raw = window.localStorage.getItem(RECENT_AUTO_STORAGE_KEY)
  if (!raw) return []

  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []

  const cutoff = Date.now() - MAX_RECENT_AGE_MS

  return parsed
   .filter((item) => item && typeof item.trainerKey === 'string')
   .map((item) => ({
    trainerKey: String(item.trainerKey),
    route: String(item.route || ''),
    trainedAt: String(item.trainedAt || nowIso()),
   }))
   .filter((item) => {
    const ms = new Date(item.trainedAt).getTime()
    return !Number.isFinite(ms) || ms >= cutoff
   })
 } catch {
  return []
 }
}

function writeRecentAutoRecords(records: RecentAutoRecord[]) {
 if (typeof window === 'undefined') return

 window.localStorage.setItem(
  RECENT_AUTO_STORAGE_KEY,
  JSON.stringify(records.slice(0, MAX_RECENT_RECORDS)),
 )
}

export function recordRecentAutoTrainer(trainerKey: string, route = '') {
 const target = targetFromTrainerKey(trainerKey, route)
 if (!target) return null

 const records = readRecentAutoRecords().filter(
  (item) => item.trainerKey !== trainerKey,
 )

 records.unshift({
  trainerKey,
  route: route || target.sourceRoute,
  trainedAt: target.trainedAt,
 })

 writeRecentAutoRecords(records)
 return target
}

function targetsFromRecords(records: RecentAutoRecord[], maxTargets: number) {
 const targets: TransferTarget[] = []
 const usedPatterns = new Set<string>()

 for (const record of records) {
  const target = targetFromTrainerKey(
   record.trainerKey,
   record.route,
   record.trainedAt,
  )
  if (!target || usedPatterns.has(target.patternKey)) continue

  targets.push(target)
  usedPatterns.add(target.patternKey)
  if (targets.length >= maxTargets) break
 }

 return targets
}

export function getRecentTransferTargets(maxTargets = 2) {
 return targetsFromRecords(readRecentAutoRecords(), maxTargets)
}

export async function loadRecentTransferTargets(
 userId: string,
 maxTargets = 2,
): Promise<TransferTarget[]> {
 const localRecords = readRecentAutoRecords()
 let cloudRecords: RecentAutoRecord[] = []

 try {
  const { data, error } = await supabase
   .from('user_chunk_progress')
   .select('trainer_key, updated_at')
   .eq('user_id', userId)
   .order('updated_at', { ascending: false })
   .limit(40)

  if (!error) {
   cloudRecords = (data || [])
    .filter((row: any) => typeof row?.trainer_key === 'string')
    .map((row: any) => ({
     trainerKey: String(row.trainer_key),
     route: '',
     trainedAt: String(row.updated_at || nowIso()),
    }))
  }
 } catch {
  cloudRecords = []
 }

 const merged = [...localRecords, ...cloudRecords].sort((a, b) => {
  const aMs = new Date(a.trainedAt).getTime()
  const bMs = new Date(b.trainedAt).getTime()
  return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
 })

 return targetsFromRecords(merged, maxTargets)
}

function opposite(color: 'w' | 'b') {
 return color === 'w' ? 'b' : 'w'
}

function squareCoords(square: string) {
 return {
  file: square.charCodeAt(0) - 97,
  rank: Number(square[1]) - 1,
 }
}

function squareAt(file: number, rank: number): Square | null {
 if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
 return `${String.fromCharCode(97 + file)}${rank + 1}` as Square
}

function allPieces(chess: Chess) {
 const pieces: Array<{ square: Square; type: PieceSymbol; color: 'w' | 'b' }> = []

 chess.board().forEach((rank, rankIndex) => {
  rank.forEach((piece, fileIndex) => {
   if (!piece) return
   pieces.push({
    square: `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}` as Square,
    type: piece.type,
    color: piece.color,
   })
  })
 })

 return pieces
}

function attackedSquaresFrom(
 chess: Chess,
 square: Square,
 type: PieceSymbol,
 color: 'w' | 'b',
): Square[] {
 const { file, rank } = squareCoords(square)
 const result: Square[] = []

 const add = (nextFile: number, nextRank: number) => {
  const target = squareAt(nextFile, nextRank)
  if (target) result.push(target)
 }

 if (type === 'p') {
  const direction = color === 'w' ? 1 : -1
  add(file - 1, rank + direction)
  add(file + 1, rank + direction)
  return result
 }

 if (type === 'n') {
  const jumps = [
   [1, 2],
   [2, 1],
   [2, -1],
   [1, -2],
   [-1, -2],
   [-2, -1],
   [-2, 1],
   [-1, 2],
  ]
  jumps.forEach(([df, dr]) => add(file + df, rank + dr))
  return result
 }

 if (type === 'k') {
  for (let df = -1; df <= 1; df++) {
   for (let dr = -1; dr <= 1; dr++) {
    if (df || dr) add(file + df, rank + dr)
   }
  }
  return result
 }

 const directions: Array<[number, number]> = []
 if (type === 'b' || type === 'q') {
  directions.push([1, 1], [1, -1], [-1, 1], [-1, -1])
 }
 if (type === 'r' || type === 'q') {
  directions.push([1, 0], [-1, 0], [0, 1], [0, -1])
 }

 for (const [df, dr] of directions) {
  let nextFile = file + df
  let nextRank = rank + dr

  while (true) {
   const target = squareAt(nextFile, nextRank)
   if (!target) break

   result.push(target)
   if (chess.get(target)) break

   nextFile += df
   nextRank += dr
  }
 }

 return result
}

function attackersOfSquare(chess: Chess, square: Square, color: 'w' | 'b') {
 return allPieces(chess).filter(
  (piece) =>
   piece.color === color &&
   attackedSquaresFrom(chess, piece.square, piece.type, piece.color).includes(square),
 )
}

function kingSquare(chess: Chess, color: 'w' | 'b') {
 return allPieces(chess).find(
  (piece) => piece.color === color && piece.type === 'k',
 )?.square
}

function adjacentSquares(square: Square) {
 const { file, rank } = squareCoords(square)
 const result: Square[] = []

 for (let df = -1; df <= 1; df++) {
  for (let dr = -1; dr <= 1; dr++) {
   if (!df && !dr) continue
   const target = squareAt(file + df, rank + dr)
   if (target) result.push(target)
  }
 }

 return result
}

function classifyMatePattern(
 before: Chess,
 move: Move,
 after: Chess,
): string[] {
 if (!after.isCheckmate()) return []

 const attacker = move.color
 const defender = opposite(attacker)
 const king = kingSquare(after, defender)
 if (!king) return ['mixed']

 const patterns = new Set<string>(['mixed'])
 const movedPiece = after.get(move.to as Square)
 const kingNeighbors = adjacentSquares(king)
 const ownBlockers = kingNeighbors.filter(
  (square) => after.get(square)?.color === defender,
 )
 const emptyNeighbors = kingNeighbors.filter((square) => !after.get(square))
 const checkers = attackersOfSquare(after, king, attacker)
 const attackerKnights = allPieces(after).filter(
  (piece) => piece.color === attacker && piece.type === 'n',
 )
 const knightControlsEscape = attackerKnights.some((knight) =>
  attackedSquaresFrom(after, knight.square, 'n', attacker).some((square) =>
   kingNeighbors.includes(square),
  ),
 )

 if (
  movedPiece?.type === 'n' &&
  ownBlockers.length === kingNeighbors.length &&
  emptyNeighbors.length === 0
 ) {
  patterns.add('smothered')
 }

 const kingRank = Number(king[1])
 if (
  (movedPiece?.type === 'r' || movedPiece?.type === 'q') &&
  (kingRank === 1 || kingRank === 8)
 ) {
  patterns.add('back-rank')
 }

 if (movedPiece?.type === 'r' && knightControlsEscape) {
  patterns.add('arabian')
  if (ownBlockers.length >= 1) patterns.add('anastasia')
 }

 if (movedPiece?.type === 'q') {
  if (ownBlockers.length >= 2) patterns.add('dovetail')
  if (checkers.length >= 1 && kingNeighbors.length - ownBlockers.length <= 2) {
   patterns.add('kill-box')
  }
 }

 const attackingBishops = allPieces(after).filter(
  (piece) => piece.color === attacker && piece.type === 'b',
 )
 if (movedPiece?.type === 'b' && attackingBishops.length >= 2) {
  patterns.add('boden')
  patterns.add('double-bishop')
  patterns.add('double-bishop-mate-3-plus')
 }

 if (
  (movedPiece?.type === 'r' || movedPiece?.type === 'q') &&
  checkers.length >= 1 &&
  ownBlockers.length >= 1
 ) {
  patterns.add('hook')
 }

 return Array.from(patterns)
}

function attackedEnemyTargets(chess: Chess, square: Square, color: 'w' | 'b') {
 const piece = chess.get(square)
 if (!piece || piece.color !== color) return []

 return attackedSquaresFrom(chess, square, piece.type, color)
  .map((target) => ({ target, piece: chess.get(target) }))
  .filter(
   (item): item is { target: Square; piece: { type: PieceSymbol; color: 'w' | 'b' } } =>
    Boolean(item.piece && item.piece.color !== color),
  )
}

function forkScore(after: Chess, move: Move, requiredPiece?: PieceSymbol) {
 const movedPiece = after.get(move.to as Square)
 if (!movedPiece || (requiredPiece && movedPiece.type !== requiredPiece)) return 0

 const targets = attackedEnemyTargets(after, move.to as Square, move.color)
  .filter((item) => PIECE_VALUE[item.piece.type] >= 300)
  .sort((a, b) => PIECE_VALUE[b.piece.type] - PIECE_VALUE[a.piece.type])

 if (targets.length < 2) return 0

 return 420 + Math.min(300, targets.slice(0, 2).reduce(
  (sum, item) => sum + PIECE_VALUE[item.piece.type] / 8,
  0,
 ))
}

function lineTacticScore(
 chess: Chess,
 attackerColor: 'w' | 'b',
 mode: 'pin' | 'skewer',
 requiredAttacker?: PieceSymbol,
) {
 const enemy = opposite(attackerColor)
 let best = 0

 for (const attacker of allPieces(chess)) {
  if (attacker.color !== attackerColor) continue
  if (!['b', 'r', 'q'].includes(attacker.type)) continue
  if (requiredAttacker && attacker.type !== requiredAttacker) continue

  const { file, rank } = squareCoords(attacker.square)
  const directions: Array<[number, number]> = []
  if (attacker.type === 'b' || attacker.type === 'q') {
   directions.push([1, 1], [1, -1], [-1, 1], [-1, -1])
  }
  if (attacker.type === 'r' || attacker.type === 'q') {
   directions.push([1, 0], [-1, 0], [0, 1], [0, -1])
  }

  for (const [df, dr] of directions) {
   let nextFile = file + df
   let nextRank = rank + dr
   const seen: Array<{ type: PieceSymbol; color: 'w' | 'b' }> = []

   while (true) {
    const square = squareAt(nextFile, nextRank)
    if (!square) break
    const piece = chess.get(square)
    if (piece) seen.push(piece)
    if (seen.length >= 2) break
    nextFile += df
    nextRank += dr
   }

   if (seen.length < 2 || seen[0].color !== enemy || seen[1].color !== enemy) {
    continue
   }

   if (mode === 'pin' && seen[1].type === 'k' && seen[0].type !== 'k') {
    best = Math.max(best, 360 + PIECE_VALUE[seen[0].type] / 5)
   }

   if (
    mode === 'skewer' &&
    PIECE_VALUE[seen[0].type] > PIECE_VALUE[seen[1].type] &&
    PIECE_VALUE[seen[0].type] >= 500
   ) {
    best = Math.max(best, 350 + PIECE_VALUE[seen[1].type] / 5)
   }
  }
 }

 return best
}

function newlyRevealedAttackScore(before: Chess, after: Chess, moverColor: 'w' | 'b') {
 const beforeTargets = new Set<string>()
 const afterTargets = new Set<string>()

 for (const piece of allPieces(before)) {
  if (piece.color !== moverColor || !['b', 'r', 'q'].includes(piece.type)) continue
  attackedEnemyTargets(before, piece.square, moverColor).forEach((item) => {
   if (PIECE_VALUE[item.piece.type] >= 300) beforeTargets.add(`${piece.square}:${item.target}`)
  })
 }

 for (const piece of allPieces(after)) {
  if (piece.color !== moverColor || !['b', 'r', 'q'].includes(piece.type)) continue
  attackedEnemyTargets(after, piece.square, moverColor).forEach((item) => {
   if (PIECE_VALUE[item.piece.type] >= 300) afterTargets.add(`${piece.square}:${item.target}`)
  })
 }

 return Array.from(afterTargets).some((key) => !beforeTargets.has(key)) ? 430 : 0
}

function moveMatchesTarget(before: Chess, move: Move, target: TransferTarget) {
 const after = new Chess(before.fen())
 const applied = after.move({
  from: move.from,
  to: move.to,
  promotion: move.promotion,
 })
 if (!applied) return { score: 0, description: '' }

 if (target.category === 'mates') {
  const patterns = classifyMatePattern(before, applied, after)
  const exact = patterns.includes(target.patternKey)
  return exact
   ? { score: 1000, description: `${target.label} is available.` }
   : { score: 0, description: '' }
 }

 const key = target.patternKey
 const movedPiece = after.get(applied.to as Square)
 const enemyKing = kingSquare(after, opposite(applied.color))
 const checkers = enemyKing
  ? attackersOfSquare(after, enemyKing, applied.color)
  : []

 if (key.startsWith('fork-')) {
  const suffix = key.replace('fork-', '')
  const required: Record<string, PieceSymbol | undefined> = {
   bishop: 'b',
   knight: 'n',
   pawn: 'p',
   queen: 'q',
   rook: 'r',
   king: 'k',
  }
  const score = forkScore(after, applied, required[suffix])
  return score > 0
   ? { score, description: `${target.label} opportunity created.` }
   : { score: 0, description: '' }
 }

 if (key === 'double-check') {
  return after.isCheck() && checkers.length >= 2
   ? { score: 900, description: 'Double-check opportunity created.' }
   : { score: 0, description: '' }
 }

 if (key === 'discovered-check') {
  const discovered =
   after.isCheck() && checkers.some((checker) => checker.square !== applied.to)
  return discovered
   ? { score: 820, description: 'Discovered-check opportunity created.' }
   : { score: 0, description: '' }
 }

 if (key === 'discovered-attack') {
  const score = newlyRevealedAttackScore(before, after, applied.color)
  return score > 0
   ? { score, description: 'Discovered-attack opportunity created.' }
   : { score: 0, description: '' }
 }

 if (key.startsWith('pin-')) {
  const suffix = key.replace('pin-', '')
  const required: Record<string, PieceSymbol | undefined> = {
   bishop: 'b',
   queen: 'q',
   rook: 'r',
   other: undefined,
  }
  const score = lineTacticScore(after, applied.color, 'pin', required[suffix])
  return score > 0
   ? { score, description: `${target.label} opportunity created.` }
   : { score: 0, description: '' }
 }

 if (key.startsWith('skewer-')) {
  const suffix = key.replace('skewer-', '')
  const required: Record<string, PieceSymbol | undefined> = {
   bishop: 'b',
   queen: 'q',
   rook: 'r',
   other: undefined,
  }
  const score = lineTacticScore(after, applied.color, 'skewer', required[suffix])
  return score > 0
   ? { score, description: `${target.label} opportunity created.` }
   : { score: 0, description: '' }
 }

 if (key === 'hanging-piece') {
  const capturedValue = applied.captured ? PIECE_VALUE[applied.captured] : 0
  return capturedValue >= 300
   ? { score: 520 + capturedValue / 10, description: 'A hanging piece can be won.' }
   : { score: 0, description: '' }
 }

 if (key === 'advanced-pawn') {
  const rank = Number(applied.to[1])
  const advanced =
   movedPiece?.type === 'p' &&
   ((applied.color === 'w' && rank >= 6) || (applied.color === 'b' && rank <= 3))
  return advanced
   ? { score: 460, description: 'Advanced-pawn opportunity created.' }
   : { score: 0, description: '' }
 }

 if (key === 'promotion') {
  return applied.promotion
   ? { score: 850, description: 'Promotion opportunity created.' }
   : { score: 0, description: '' }
 }

 if (key === 'underpromotion' || key === 'underpromotion-knight') {
  const required = key === 'underpromotion-knight' ? 'n' : undefined
  return applied.promotion && applied.promotion !== 'q' && (!required || applied.promotion === required)
   ? { score: 950, description: 'Underpromotion opportunity created.' }
   : { score: 0, description: '' }
 }

 if (key === 'vulnerable-king' || key === 'kingside-attack' || key === 'queenside-attack') {
  const captureValue = applied.captured ? PIECE_VALUE[applied.captured] : 0
  const score = after.isCheck() ? 650 : captureValue >= 300 ? 480 : 0
  return score > 0
   ? { score, description: `${target.label} opportunity created.` }
   : { score: 0, description: '' }
 }

 if (key === 'trapped-piece') {
  const enemy = opposite(applied.color)
  const trapped = allPieces(after).some((piece) => {
   if (piece.color !== enemy || PIECE_VALUE[piece.type] < 300 || piece.type === 'k') return false
   const temp = new Chess(after.fen())
   if (temp.turn() !== enemy) return false
   const moves = temp.moves({ square: piece.square, verbose: true })
   return moves.length === 0
  })
  return trapped
   ? { score: 520, description: 'Trapped-piece opportunity created.' }
   : { score: 0, description: '' }
 }

 return { score: 0, description: '' }
}

export function studentMoveMatchesTransferTarget(
 beforeFen: string,
 moveUci: string,
 target: TransferTarget,
) {
 try {
  const before = new Chess(beforeFen)
  const move = before.moves({ verbose: true }).find(
   (candidate) =>
    `${candidate.from}${candidate.to}${candidate.promotion || ''}` === moveUci,
  )
  if (!move) return false
  return moveMatchesTarget(before, move, target).score > 0
 } catch {
  return false
 }
}

export function findImmediateTransferOpportunity(
 position: Chess,
 target: TransferTarget,
 studentColor: 'white' | 'black',
) {
 const expectedTurn = studentColor === 'white' ? 'w' : 'b'
 if (position.turn() !== expectedTurn || position.isGameOver()) return null

 let best: { expectedStudentMove: string; score: number; description: string } | null = null

 for (const move of position.moves({ verbose: true })) {
  const match = moveMatchesTarget(position, move, target)
  if (match.score <= 0) continue

  const candidate = {
   expectedStudentMove: `${move.from}${move.to}${move.promotion || ''}`,
   score: match.score,
   description: match.description,
  }

  if (!best || candidate.score > best.score) best = candidate
 }

 return best
}

export function findTargetedComputerCandidates(
 position: Chess,
 target: TransferTarget,
 studentColor: 'white' | 'black',
 maxCandidates = 6,
): TargetedComputerCandidate[] {
 if (position.isGameOver()) return []

 const computerColor = studentColor === 'white' ? 'b' : 'w'
 if (position.turn() !== computerColor) return []

 const candidates: TargetedComputerCandidate[] = []

 for (const move of position.moves({ verbose: true })) {
  const after = new Chess(position.fen())
  const applied = after.move({
   from: move.from,
   to: move.to,
   promotion: move.promotion,
  })
  if (!applied || after.isGameOver()) continue

  const opportunity = findImmediateTransferOpportunity(after, target, studentColor)
  if (!opportunity) continue

  candidates.push({
   computerMove: `${move.from}${move.to}${move.promotion || ''}`,
   opportunity,
   afterFen: after.fen(),
  })
 }

 return candidates
  .sort((a, b) => b.opportunity.score - a.opportunity.score)
  .slice(0, maxCandidates)
}

export function createTransferOpportunity(
 target: TransferTarget,
 candidate: TargetedComputerCandidate,
 createdAtPly: number,
): TransferOpportunity {
 const createdAt = nowIso()
 return {
  id: `${target.patternKey}:${createdAtPly}:${createdAt}`,
  targetKey: target.patternKey,
  targetLabel: target.label,
  category: target.category,
  computerMove: candidate.computerMove,
  expectedStudentMove: candidate.opportunity.expectedStudentMove,
  createdAtPly,
  createdAt,
  status: 'offered',
 }
}

export type TransferSteeringCandidate = {
 computerMove: string
 afterFen: string
 potentialScore: number
}

function distance(a: Square, b: Square) {
 const ac = squareCoords(a)
 const bc = squareCoords(b)
 return Math.max(Math.abs(ac.file - bc.file), Math.abs(ac.rank - bc.rank))
}

function countValuableEnemyPairsForFork(
 chess: Chess,
 studentColor: 'w' | 'b',
 patternKey: string,
) {
 const enemyPieces = allPieces(chess).filter(
  (piece) => piece.color !== studentColor && PIECE_VALUE[piece.type] >= 300,
 )
 const requiredType = patternKey.replace('fork-', '')
 const studentPieces = allPieces(chess).filter((piece) => {
  if (piece.color !== studentColor) return false
  const names: Record<string, PieceSymbol> = {
   bishop: 'b',
   king: 'k',
   knight: 'n',
   pawn: 'p',
   queen: 'q',
   rook: 'r',
  }
  return piece.type === names[requiredType]
 })

 let best = 0
 for (const piece of studentPieces) {
  const attacked = attackedSquaresFrom(chess, piece.square, piece.type, piece.color)
  const nearbyTargets = enemyPieces.filter(
   (enemy) =>
    attacked.includes(enemy.square) ||
    distance(piece.square, enemy.square) <= (piece.type === 'n' ? 3 : 4),
  )
  best = Math.max(best, nearbyTargets.length)
 }
 return best
}

export function scoreTransferPotential(
 position: Chess,
 target: TransferTarget,
 studentColor: 'white' | 'black',
) {
 const student = studentColor === 'white' ? 'w' : 'b'
 const computer = opposite(student)
 const computerKing = kingSquare(position, computer)
 if (!computerKing) return 0

 const neighbors = adjacentSquares(computerKing)
 const ownBlockers = neighbors.filter(
  (square) => position.get(square)?.color === computer,
 ).length
 const emptyNeighbors = neighbors.filter((square) => !position.get(square)).length
 const kingEdge = ['a', 'h'].includes(computerKing[0]) || ['1', '8'].includes(computerKing[1])
 const studentPieces = allPieces(position).filter((piece) => piece.color === student)
 const nearKing = studentPieces.filter((piece) => distance(piece.square, computerKing) <= 3)
 const knightsNear = nearKing.filter((piece) => piece.type === 'n').length
 const rooksNear = nearKing.filter((piece) => piece.type === 'r' || piece.type === 'q').length
 const bishopsNear = nearKing.filter((piece) => piece.type === 'b').length

 if (target.category === 'mates') {
  let score = nearKing.length * 12 + ownBlockers * 18 + (kingEdge ? 25 : 0)

  if (target.patternKey === 'smothered') {
   score += ownBlockers * 30 + knightsNear * 45 - emptyNeighbors * 8
  } else if (target.patternKey === 'back-rank') {
   const homeRank = computer === 'w' ? '1' : '8'
   score += computerKing[1] === homeRank ? 60 : 0
   score += rooksNear * 35 + ownBlockers * 15
  } else if (target.patternKey === 'arabian' || target.patternKey === 'anastasia') {
   score += knightsNear * 45 + rooksNear * 50 + ownBlockers * 12
  } else if (
   target.patternKey === 'boden' ||
   target.patternKey.startsWith('double-bishop')
  ) {
   score += bishopsNear * 55 + ownBlockers * 16
  } else if (target.patternKey === 'dovetail' || target.patternKey === 'kill-box') {
   score += nearKing.filter((piece) => piece.type === 'q').length * 70
   score += ownBlockers * 18
  } else if (target.patternKey === 'hook') {
   score += rooksNear * 45 + nearKing.filter((piece) => piece.type === 'p').length * 25
  }

  return score
 }

 if (target.patternKey.startsWith('fork-')) {
  return countValuableEnemyPairsForFork(position, student, target.patternKey) * 70
 }

 if (target.patternKey.startsWith('pin-') || target.patternKey.startsWith('skewer-')) {
  const aligned = studentPieces.filter((piece) => ['b', 'r', 'q'].includes(piece.type)).length
  return aligned * 22 + ownBlockers * 8 + (kingEdge ? 10 : 0)
 }

 if (target.patternKey === 'discovered-check' || target.patternKey === 'double-check') {
  return rooksNear * 40 + bishopsNear * 35 + knightsNear * 15 + ownBlockers * 10
 }

 if (target.patternKey === 'discovered-attack') {
  return studentPieces.filter((piece) => ['b', 'r', 'q'].includes(piece.type)).length * 28
 }

 if (target.patternKey === 'advanced-pawn' || target.patternKey.includes('promotion')) {
  return studentPieces
   .filter((piece) => piece.type === 'p')
   .reduce((best, pawn) => {
    const rank = Number(pawn.square[1])
    const progress = student === 'w' ? rank : 9 - rank
    return Math.max(best, progress * 20)
   }, 0)
 }

 return nearKing.length * 18 + (kingEdge ? 20 : 0)
}

export function findTransferSteeringCandidates(
 position: Chess,
 target: TransferTarget,
 studentColor: 'white' | 'black',
 maxCandidates = 5,
): TransferSteeringCandidate[] {
 if (position.isGameOver()) return []

 const computerColor = studentColor === 'white' ? 'b' : 'w'
 if (position.turn() !== computerColor) return []

 const currentPotential = scoreTransferPotential(position, target, studentColor)
 const candidates: TransferSteeringCandidate[] = []

 for (const move of position.moves({ verbose: true })) {
  const after = new Chess(position.fen())
  const applied = after.move({
   from: move.from,
   to: move.to,
   promotion: move.promotion,
  })
  if (!applied || after.isGameOver()) continue

  const potentialScore = scoreTransferPotential(after, target, studentColor)
  if (potentialScore <= currentPotential) continue

  candidates.push({
   computerMove: `${move.from}${move.to}${move.promotion || ''}`,
   afterFen: after.fen(),
   potentialScore,
  })
 }

 return candidates
  .sort((a, b) => b.potentialScore - a.potentialScore)
  .slice(0, maxCandidates)
}
