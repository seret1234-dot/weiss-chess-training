import { supabase } from '../lib/supabase'

export type EndgameTransferExpectedResult = 'win' | 'draw' | 'mate'
export type EndgameTransferStatus = 'ready' | 'in_progress' | 'completed'

export type EndgameTransferPosition = {
 id: string
 trainerKey: string
 theme: string
 trainerTitle: string
 sourceRoute: string
 label: string
 fen: string
 studentColor: 'white' | 'black'
 expectedResult: EndgameTransferExpectedResult
 objective: string
 explanation?: string
}

export type EndgameTransferSession = EndgameTransferPosition & {
 sessionId: string
 userId: string
 engineElo: number
 sourceTrainedAt: string
 createdAt: string
 updatedAt: string
 status: EndgameTransferStatus
 currentFen?: string
 finalFen?: string
 pgn?: string
 gameResult?: string
 success?: boolean
 completedAt?: string
}

type RecentEndgameRecord = {
 trainerKey: string
 route: string
 trainedAt: string
}

type EndgameTransferHistoryRecord = {
 sessionId: string
 trainerKey: string
 theme: string
 sourceTrainedAt: string
 success: boolean
 completedAt: string
}

type EndgameTransferManifest = {
 version: number
 positions: EndgameTransferPosition[]
}

const RECENT_STORAGE_KEY = 'weiss-recent-endgame-trainers-v1'
const SESSION_STORAGE_KEY = 'weiss-endgame-transfer-session-v1'
const HISTORY_STORAGE_KEY = 'weiss-endgame-transfer-history-v1'
const MAX_RECENT = 30
const MAX_HISTORY = 80
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

const ENDGAME_DEFINITIONS = [
 { trainerKey: 'kqk-basic', theme: 'kqk', route: '/endgame/piece-mates/kqk' },
 { trainerKey: 'krk-basic', theme: 'krk', route: '/endgame/piece-mates/krk' },
 { trainerKey: 'k2r-basic', theme: 'k2r', route: '/endgame/piece-mates/k2r' },
 { trainerKey: 'kbbk-basic', theme: 'kbbk', route: '/endgame/piece-mates/two-bishops' },
 { trainerKey: 'kqkr-basic', theme: 'kqkr', route: '/endgame-studies/kqkr' },
 { trainerKey: 'bn-basic', theme: 'bn', route: '/endgame/piece-mates/bn' },
 { trainerKey: 'kqkp7-basic', theme: 'kqkp7', route: '/endgame-studies/kqkp7' },
 { trainerKey: 'krkp-basic', theme: 'krkp', route: '/endgame-studies/krkp' },
 { trainerKey: 'knnkp-basic', theme: 'knnkp', route: '/endgame-studies/knnkp' },
 { trainerKey: 'knnkp-forced-basic', theme: 'knnkp_forced_mate', route: '/endgame-studies/knnkp-forced' },
 { trainerKey: 'kpk-basic', theme: 'kpk', route: '/endgame-studies/kpk' },
 { trainerKey: 'stalemate-basic', theme: 'stalemate', route: '/endgame-studies/stalemate' },
 { trainerKey: 'lucena-basic', theme: 'lucena', route: '/endgame-studies/lucena' },
 { trainerKey: 'philidor-basic', theme: 'philidor', route: '/endgame-studies/philidor' },
 { trainerKey: 'pawn-races-basic', theme: 'pawn-races', route: '/endgame-studies/pawns' },
 { trainerKey: 'zugzwang-basic', theme: 'zugzwang', route: '/endgame-studies/zugzwang' },
 { trainerKey: 'shouldering-basic', theme: 'shouldering', route: '/endgame-studies/shouldering' },
 { trainerKey: 'fortress-basic', theme: 'fortress', route: '/endgame-studies/fortress' },
 { trainerKey: 'stalemate-underpromotion', theme: 'stalemate_underpromotion', route: '/stalemate/underpromotion' },
] as const

function nowIso() {
 return new Date().toISOString()
}

function safeReadArray<T>(key: string): T[] {
 if (typeof window === 'undefined') return []
 try {
  const parsed = JSON.parse(window.localStorage.getItem(key) || '[]')
  return Array.isArray(parsed) ? parsed : []
 } catch {
  return []
 }
}

function safeWrite(key: string, value: unknown) {
 if (typeof window === 'undefined') return
 window.localStorage.setItem(key, JSON.stringify(value))
}

function definitionForTrainer(trainerKey: string) {
 return ENDGAME_DEFINITIONS.find((item) => item.trainerKey === trainerKey) || null
}

function definitionForTheme(theme: string) {
 return ENDGAME_DEFINITIONS.find((item) => item.theme === theme) || null
}

export function recordRecentEndgameTrainer(trainerKey: string, route = '') {
 const definition = definitionForTrainer(trainerKey)
 if (!definition) return null

 const trainedAt = nowIso()
 const records = safeReadArray<RecentEndgameRecord>(RECENT_STORAGE_KEY).filter(
  (item) => item.trainerKey !== trainerKey,
 )
 records.unshift({ trainerKey, route: route || definition.route, trainedAt })
 safeWrite(RECENT_STORAGE_KEY, records.slice(0, MAX_RECENT))
 return { trainerKey, trainedAt }
}

function readRecentEndgames() {
 const cutoff = Date.now() - MAX_AGE_MS
 return safeReadArray<RecentEndgameRecord>(RECENT_STORAGE_KEY).filter((item) => {
  if (!definitionForTrainer(item.trainerKey)) return false
  const ms = new Date(item.trainedAt).getTime()
  return !Number.isFinite(ms) || ms >= cutoff
 })
}

function readHistory() {
 return safeReadArray<EndgameTransferHistoryRecord>(HISTORY_STORAGE_KEY)
}

function wasAlreadyTested(record: RecentEndgameRecord, history: EndgameTransferHistoryRecord[]) {
 const trainedMs = new Date(record.trainedAt).getTime()
 return history.some((item) => {
  if (item.trainerKey !== record.trainerKey) return false
  const sourceMs = new Date(item.sourceTrainedAt).getTime()
  return Number.isFinite(trainedMs) && Number.isFinite(sourceMs) && sourceMs >= trainedMs
 })
}

async function loadCloudRecentEndgames(userId: string): Promise<RecentEndgameRecord[]> {
 try {
  const { data, error } = await supabase
   .from('training_progress')
   .select('theme, updated_at')
   .eq('user_id', userId)
   .eq('course', 'endgame')
   .order('updated_at', { ascending: false })
   .limit(80)

  if (error) return []

  const seen = new Set<string>()
  const records: RecentEndgameRecord[] = []
  for (const row of data || []) {
   const definition = definitionForTheme(String(row.theme || ''))
   if (!definition || seen.has(definition.trainerKey)) continue
   seen.add(definition.trainerKey)
   records.push({
    trainerKey: definition.trainerKey,
    route: definition.route,
    trainedAt: String(row.updated_at || nowIso()),
   })
  }
  return records
 } catch {
  return []
 }
}

async function loadManifest(): Promise<EndgameTransferManifest | null> {
 try {
  const response = await fetch('/data/endgame-transfer/positions.json', {
   cache: 'no-cache',
  })
  if (!response.ok) return null
  const parsed = (await response.json()) as EndgameTransferManifest
  if (!Array.isArray(parsed?.positions)) return null
  return parsed
 } catch {
  return null
 }
}

export function loadEndgameTransferSession(): EndgameTransferSession | null {
 if (typeof window === 'undefined') return null
 try {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as EndgameTransferSession
  return parsed?.sessionId && parsed?.fen ? parsed : null
 } catch {
  return null
 }
}

function saveSession(session: EndgameTransferSession) {
 safeWrite(SESSION_STORAGE_KEY, session)
 return session
}

function choosePosition(
 positions: EndgameTransferPosition[],
 trainerKey: string,
 history: EndgameTransferHistoryRecord[],
) {
 const pool = positions.filter((item) => item.trainerKey === trainerKey)
 if (!pool.length) return null

 const recentIds = new Set(
  history
   .filter((item) => item.trainerKey === trainerKey)
   .slice(0, 5)
   .map((item) => item.sessionId.split(':position:')[1])
   .filter(Boolean),
 )
 const fresh = pool.filter((item) => !recentIds.has(item.id))
 const choices = fresh.length ? fresh : pool
 return choices[Math.floor(Math.random() * choices.length)] || null
}

export async function prepareNextEndgameTransfer(
 userId: string,
 engineElo = 1700,
): Promise<EndgameTransferSession | null> {
 const existing = loadEndgameTransferSession()
 if (existing && existing.status !== 'completed') return existing

 const [cloud, manifest] = await Promise.all([
  loadCloudRecentEndgames(userId),
  loadManifest(),
 ])
 if (!manifest) return null

 const merged = [...readRecentEndgames(), ...cloud].sort((a, b) => {
  const aMs = new Date(a.trainedAt).getTime()
  const bMs = new Date(b.trainedAt).getTime()
  return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
 })

 const unique: RecentEndgameRecord[] = []
 const seen = new Set<string>()
 for (const item of merged) {
  if (seen.has(item.trainerKey)) continue
  seen.add(item.trainerKey)
  unique.push(item)
 }

 const history = readHistory()
 const record = unique.find((item) => !wasAlreadyTested(item, history))
 if (!record) return null

 const position = choosePosition(manifest.positions, record.trainerKey, history)
 if (!position) return null

 const createdAt = nowIso()
 const session: EndgameTransferSession = {
  ...position,
  sessionId: `${record.trainerKey}:${createdAt}:position:${position.id}`,
  userId,
  engineElo: Math.max(600, Math.min(2600, engineElo)),
  sourceTrainedAt: record.trainedAt,
  createdAt,
  updatedAt: createdAt,
  status: 'ready',
 }
 return saveSession(session)
}

export function markEndgameTransferStarted(session: EndgameTransferSession) {
 if (session.status === 'completed') return session
 return saveSession({
  ...session,
  status: 'in_progress',
  updatedAt: nowIso(),
 })
}

export function saveEndgameTransferProgress(
 session: EndgameTransferSession,
 currentFen: string,
 pgn: string,
) {
 if (session.status === 'completed') return session
 return saveSession({
  ...session,
  status: 'in_progress',
  currentFen,
  pgn,
  updatedAt: nowIso(),
 })
}

export function gradeEndgameTransfer(
 session: EndgameTransferSession,
 gameResult: string,
 endedByCheckmate: boolean,
) {
 const studentWon =
  (session.studentColor === 'white' && gameResult === '1-0') ||
  (session.studentColor === 'black' && gameResult === '0-1')
 const studentLost =
  (session.studentColor === 'white' && gameResult === '0-1') ||
  (session.studentColor === 'black' && gameResult === '1-0')
 const draw = gameResult === '1/2-1/2'

 if (session.expectedResult === 'mate') return studentWon && endedByCheckmate
 if (session.expectedResult === 'draw') return draw || studentWon
 return studentWon && !studentLost
}

export async function completeEndgameTransferSession(args: {
 session: EndgameTransferSession
 gameResult: string
 success: boolean
 finalFen: string
 pgn: string
}) {
 const completedAt = nowIso()
 const completed = saveSession({
  ...args.session,
  status: 'completed' as const,
  gameResult: args.gameResult,
  success: args.success,
  finalFen: args.finalFen,
  pgn: args.pgn,
  completedAt,
  updatedAt: completedAt,
 })

 const history = readHistory()
 history.unshift({
  sessionId: completed.sessionId,
  trainerKey: completed.trainerKey,
  theme: completed.theme,
  sourceTrainedAt: completed.sourceTrainedAt,
  success: args.success,
  completedAt,
 })
 safeWrite(HISTORY_STORAGE_KEY, history.slice(0, MAX_HISTORY))

 if (!args.success) {
  try {
   await supabase
    .from('training_progress')
    .update({ next_review_at: completedAt, updated_at: completedAt })
    .eq('user_id', completed.userId)
    .eq('course', 'endgame')
    .eq('theme', completed.theme)
  } catch {
   // Local completion still works when cloud progress is unavailable.
  }
 }

 return completed
}

export function clearCompletedEndgameTransferSession() {
 const session = loadEndgameTransferSession()
 if (!session || session.status !== 'completed') return
 if (typeof window !== 'undefined') {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
 }
}
