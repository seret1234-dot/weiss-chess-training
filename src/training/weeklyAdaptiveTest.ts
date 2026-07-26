import { Chess } from 'chess.js'
import { supabase } from '../lib/supabase'
import type { TransferOpportunity, TransferTarget } from './targetedSparring'

export type WeeklyCategory =
 | 'mates'
 | 'endgames'
 | 'board-vision'
 | 'openings'
 | 'master-games'

export type WeeklyPlanSignals = {
 version: 1
 generatedAt: string
 results: {
  wins: number
  draws: number
  losses: number
 }
 multipliers: Record<WeeklyCategory, number>
 reasons: string[]
 transfer: {
  offered: number
  recognized: number
  missed: number
  byPattern: Record<string, { offered: number; recognized: number; missed: number }>
 }
}

export type WeeklyCloudLoad = {
 state: WeeklyStateLike | null
 available: boolean
}

export type WeeklyTestPlanStatus = {
 weekKey: string
 status: 'due' | 'in_progress' | 'complete'
 currentGame: 0 | 1 | 2
 gamesCompleted: number
 completedAt: string | null
 source: 'cloud' | 'local' | 'new'
 cloudAvailable: boolean
 planSignals: WeeklyPlanSignals | null
 transferTargets: TransferTarget[]
}

type WeeklyGameLike = {
 color?: 'white' | 'black'
 started?: boolean
 completed?: boolean
 pgn?: string
 fen?: string
 result?: string
 updatedAt?: string
 transferTarget?: TransferTarget
 transferOpportunities?: TransferOpportunity[]
}

export type WeeklyStateLike = {
 userId?: string
 weekKey?: string
 engineElo?: number
 currentGame?: 0 | 1 | 2
 games?: WeeklyGameLike[]
 completedAt?: string
 updatedAt?: string
 planSignals?: WeeklyPlanSignals
 transferTargets?: TransferTarget[]
}

const TABLE = 'weekly_adaptive_tests'
const LOCAL_STORAGE_KEY = 'weiss-weekly-adaptive-test-v1'

let warnedMissingTable = false

function isMissingTableError(error: any) {
 const code = String(error?.code ?? '')
 const message = String(error?.message ?? '')
 return (
  code === '42P01' ||
  code === 'PGRST205' ||
  (message.includes(TABLE) &&
   (message.includes('does not exist') ||
    message.includes('Could not find') ||
    message.includes('schema cache')))
 )
}

function warnMissingTableOnce() {
 if (warnedMissingTable) return
 warnedMissingTable = true
 console.warn(
  'Weekly Adaptive Test cloud table is not installed yet. Local save and scheduling still work.'
 )
}

function clamp(value: number, min: number, max: number) {
 return Math.max(min, Math.min(max, value))
}

function safeDateMs(value?: string | null) {
 if (!value) return 0
 const ms = new Date(value).getTime()
 return Number.isFinite(ms) ? ms : 0
}

export function getCurrentWeekKey(date = new Date()) {
 const local = new Date(date.getFullYear(), date.getMonth(), date.getDate())
 const day = local.getDay()
 const daysFromMonday = day === 0 ? 6 : day - 1
 local.setDate(local.getDate() - daysFromMonday)

 const year = local.getFullYear()
 const month = String(local.getMonth() + 1).padStart(2, '0')
 const dayOfMonth = String(local.getDate()).padStart(2, '0')
 return `${year}-${month}-${dayOfMonth}`
}

function stateTimestamp(state: WeeklyStateLike | null | undefined) {
 if (!state) return 0

 const gameTimes = Array.isArray(state.games)
  ? state.games.map((game) => safeDateMs(game?.updatedAt))
  : []

 return Math.max(
  safeDateMs(state.updatedAt),
  safeDateMs(state.completedAt),
  ...gameTimes,
 )
}

export function chooseNewestWeeklyTestState<T extends WeeklyStateLike>(
 localState: T,
 cloudState: T | null,
): T {
 if (!cloudState) return localState
 return stateTimestamp(cloudState) > stateTimestamp(localState)
  ? cloudState
  : localState
}

function readLocalState(): WeeklyStateLike | null {
 if (typeof window === 'undefined') return null

 try {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!raw) return null
  return JSON.parse(raw) as WeeklyStateLike
 } catch {
  return null
 }
}

function gamesCompleted(state: WeeklyStateLike | null) {
 if (!state?.games || !Array.isArray(state.games)) return 0
 return state.games.filter((game) => game?.completed === true).length
}

function statusFromState(
 weekKey: string,
 state: WeeklyStateLike | null,
 source: WeeklyTestPlanStatus['source'],
 cloudAvailable: boolean,
): WeeklyTestPlanStatus {
 if (!state || state.weekKey !== weekKey) {
  return {
   weekKey,
   status: 'due',
   currentGame: 0,
   gamesCompleted: 0,
   completedAt: null,
   source,
   cloudAvailable,
   planSignals: null,
   transferTargets: [],
  }
 }

 const completed = gamesCompleted(state)
 const currentGame =
  state.currentGame === 1 || state.currentGame === 2 ? state.currentGame : 0
 const complete = currentGame === 2 || completed >= 2
 const started =
  currentGame > 0 ||
  Boolean(state.games?.some((game) => game?.started))

 return {
  weekKey,
  status: complete ? 'complete' : started ? 'in_progress' : 'due',
  currentGame,
  gamesCompleted: completed,
  completedAt: state.completedAt ?? null,
  source,
  cloudAvailable,
  planSignals: state.planSignals ?? null,
  transferTargets: state.transferTargets ?? state.games?.map((game) => game.transferTarget).filter((target): target is TransferTarget => Boolean(target)) ?? [],
 }
}

export async function loadWeeklyTestFromCloud(
 userId: string,
 weekKey: string,
): Promise<WeeklyCloudLoad> {
 const { data, error } = await supabase
  .from(TABLE)
  .select('state')
  .eq('user_id', userId)
  .eq('week_key', weekKey)
  .maybeSingle()

 if (error) {
  if (isMissingTableError(error)) {
   warnMissingTableOnce()
   return { state: null, available: false }
  }

  console.error('Could not load Weekly Adaptive Test from cloud:', error)
  return { state: null, available: false }
 }

 return {
  state: (data?.state as WeeklyStateLike | null) ?? null,
  available: true,
 }
}

export async function saveWeeklyTestToCloud(
 userId: string,
 state: WeeklyStateLike,
): Promise<boolean> {
 if (!state.weekKey) return false

 const planSignals = state.planSignals ?? null
 const { error } = await supabase
  .from(TABLE)
  .upsert(
   {
    user_id: userId,
    week_key: state.weekKey,
    engine_elo: Number(state.engineElo ?? 1500),
    current_game: Number(state.currentGame ?? 0),
    state,
    plan_signals: planSignals,
    completed_at: state.completedAt ?? null,
    updated_at: new Date().toISOString(),
   },
   { onConflict: 'user_id,week_key' },
  )

 if (error) {
  if (isMissingTableError(error)) {
   warnMissingTableOnce()
   return false
  }

  console.error('Could not save Weekly Adaptive Test to cloud:', error)
  return false
 }

 return true
}

export async function getWeeklyTestStatus(
 userId: string,
 date = new Date(),
): Promise<WeeklyTestPlanStatus> {
 const weekKey = getCurrentWeekKey(date)
 const localState = readLocalState()
 const localForWeek =
  localState?.weekKey === weekKey &&
  (!localState.userId || localState.userId === userId)
   ? localState
   : null

 const { data, error } = await supabase
  .from(TABLE)
  .select('state')
  .eq('user_id', userId)
  .eq('week_key', weekKey)
  .maybeSingle()

 if (error) {
  if (isMissingTableError(error)) {
   warnMissingTableOnce()
   return statusFromState(
    weekKey,
    localForWeek,
    localForWeek ? 'local' : 'new',
    false,
   )
  }

  console.error('Could not read Weekly Adaptive Test status:', error)
  return statusFromState(
   weekKey,
   localForWeek,
   localForWeek ? 'local' : 'new',
   false,
  )
 }

 const cloudState = (data?.state as WeeklyStateLike | null) ?? null
 const newest =
  localForWeek && cloudState
   ? chooseNewestWeeklyTestState(localForWeek, cloudState)
   : cloudState ?? localForWeek

 return statusFromState(
  weekKey,
  newest,
  cloudState ? 'cloud' : localForWeek ? 'local' : 'new',
  true,
 )
}

function neutralMultipliers(): Record<WeeklyCategory, number> {
 return {
  mates: 1,
  endgames: 1,
  'board-vision': 1,
  openings: 1,
  'master-games': 1,
 }
}

function userOutcome(
 color: 'white' | 'black',
 result: string,
): 'win' | 'draw' | 'loss' | 'unknown' {
 if (result === '1/2-1/2') return 'draw'
 if (result === '1-0') return color === 'white' ? 'win' : 'loss'
 if (result === '0-1') return color === 'black' ? 'win' : 'loss'
 return 'unknown'
}

export function buildWeeklyPlanSignals(
 games: Array<{
  color: 'white' | 'black'
  result: string
  pgn?: string
  transferTarget?: TransferTarget
  transferOpportunities?: TransferOpportunity[]
 }>,
): WeeklyPlanSignals {
 const multipliers = neutralMultipliers()
 const reasons: string[] = []
 let wins = 0
 let draws = 0
 let losses = 0
 let transferOffered = 0
 let transferRecognized = 0
 let transferMissed = 0
 const transferByPattern: Record<string, { offered: number; recognized: number; missed: number }> = {}

 for (const game of games) {
  for (const opportunity of game.transferOpportunities ?? []) {
   const key = opportunity.targetKey || game.transferTarget?.patternKey || 'unknown'
   const bucket = transferByPattern[key] ?? { offered: 0, recognized: 0, missed: 0 }
   bucket.offered++
   transferOffered++

   if (opportunity.status === 'recognized') {
    bucket.recognized++
    transferRecognized++
   } else if (opportunity.status === 'missed') {
    bucket.missed++
    transferMissed++
   }

   transferByPattern[key] = bucket
  }

  const outcome = userOutcome(game.color, game.result)

  let plies = 0
  let endedInCheckmate = false

  if (game.pgn) {
   try {
    const chess = new Chess()
    chess.loadPgn(game.pgn)
    plies = chess.history().length
    endedInCheckmate = chess.isCheckmate()
   } catch {
    // Result still remains useful even if the PGN cannot be replayed.
   }
  }

  if (outcome === 'win') {
   wins++
   continue
  }

  if (outcome === 'draw') {
   draws++
   if (plies >= 60) {
    multipliers.endgames += 0.08
    reasons.push('A long draw adds extra endgame practice.')
   }
   continue
  }

  if (outcome !== 'loss') continue

  losses++
  multipliers['board-vision'] += 0.06

  if (endedInCheckmate) {
   multipliers.mates += 0.12
   reasons.push('A checkmate loss adds extra mating-pattern practice.')
  } else {
   multipliers.mates += 0.06
  }

  if (plies > 0 && plies <= 30) {
   multipliers.openings += 0.08
   reasons.push('An early loss adds extra opening practice.')
  }

  if (plies >= 60) {
   multipliers.endgames += 0.10
   reasons.push('A long loss adds extra endgame practice.')
  }
 }

 if (transferMissed > 0) {
  multipliers.mates += Math.min(0.18, transferMissed * 0.06)
  reasons.push(`${transferMissed} missed transfer opportunit${transferMissed === 1 ? 'y' : 'ies'} add targeted mate/tactics review.`)
 }

 if (transferRecognized > 0) {
  reasons.push(`${transferRecognized} trained pattern opportunit${transferRecognized === 1 ? 'y was' : 'ies were'} recognized in play.`)
 }

 for (const category of Object.keys(multipliers) as WeeklyCategory[]) {
  multipliers[category] = Number(clamp(multipliers[category], 1, 1.35).toFixed(2))
 }

 if (losses > 0) {
  reasons.push('Losses add a small board-vision transfer boost.')
 }

 if (reasons.length === 0) {
  reasons.push('No extra category boost was needed from this weekly result.')
 }

 return {
  version: 1,
  generatedAt: new Date().toISOString(),
  results: { wins, draws, losses },
  multipliers,
  reasons: Array.from(new Set(reasons)),
  transfer: {
   offered: transferOffered,
   recognized: transferRecognized,
   missed: transferMissed,
   byPattern: transferByPattern,
  },
 }
}

function localPlanEvidence(
 userId: string,
): {
 multipliers: Record<WeeklyCategory, number>
 completedAt: string | null
} | null {
 const local = readLocalState()
 if (local?.userId && local.userId !== userId) return null
 if (!local?.planSignals?.multipliers) return null

 return {
  multipliers: local.planSignals.multipliers,
  completedAt: local.completedAt ?? null,
 }
}

export async function getWeeklyPlanMultipliers(
 userId: string,
): Promise<Record<WeeklyCategory, number>> {
 const { data, error } = await supabase
  .from(TABLE)
  .select('plan_signals, completed_at')
  .eq('user_id', userId)
  .not('completed_at', 'is', null)
  .order('completed_at', { ascending: false })
  .limit(1)
  .maybeSingle()

 if (error) {
  if (isMissingTableError(error)) {
   warnMissingTableOnce()
   return localPlanEvidence(userId)?.multipliers ?? neutralMultipliers()
  }

  console.error('Could not load weekly plan signals:', error)
  return localPlanEvidence(userId)?.multipliers ?? neutralMultipliers()
 }

 const signals = data?.plan_signals as WeeklyPlanSignals | null
 const localEvidence = localPlanEvidence(userId)

 if (
  localEvidence &&
  safeDateMs(localEvidence.completedAt) > safeDateMs(data?.completed_at)
 ) {
  return localEvidence.multipliers
 }

 return signals?.multipliers ?? localEvidence?.multipliers ?? neutralMultipliers()
}
