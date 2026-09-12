import { supabase } from '../lib/supabase'
import { readAdmissionActivityKey } from './activityAdmissionIdentity'

export type AutoChunkUnit = {
  course: 'pattern' | 'endgame' | 'vision' | 'openings' | 'master_games'
  trainerKey: string
  unitKey: string
  /** Existing progress item IDs in this unit, not a client-supplied review flag. */
  itemIds?: string[]
}
export const AUTO_ALLOWANCE_STOP = 'weiss:auto-allowance-stop'
export const AUTO_ALLOWANCE_TITLE = "Today's free training is complete."
export const AUTO_ALLOWANCE_MESSAGE = 'Come back tomorrow, or upgrade to Premium to continue now.'

export function isAutoChunkTraining(location: { pathname: string; search: string }) {
  const query = new URLSearchParams(location.search)
  return query.get('auto') === '1' && query.get('weekly') !== '1' &&
    /^\/(mates\/|tactics\/|master-mates\/|master-tactics\/|endgame\/|endgame-studies\/|board-vision(?:\/|$)|openings\/|master-games\/)/.test(location.pathname)
}

const pending = new Map<string, Promise<any>>()
/** Preserve Auto admission when an existing library/family rotation changes content. */
export function carryAutoTraining(route: string) {
  if (!isAutoChunkTraining(window.location)) return route
  const next = new URL(route, window.location.origin)
  next.searchParams.set('auto', '1')
  return next.pathname + next.search + next.hash
}
/** Called by actual loaders after content validation, BEFORE position/timer activation.
 * No allowance mutation during recommendation, prefetch, Weekly, or manual navigation.
 * The account-scoped database transaction is authoritative across tabs and days.
 */
export async function admitAutoChunk(unit: AutoChunkUnit, stillActive: () => boolean = () => true): Promise<boolean> {
  if (!stillActive()) return false
  if (!isAutoChunkTraining(window.location)) return true
  const route = window.location.pathname + window.location.search
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error('Log in to continue Auto Training.')
    // Guests retain their existing sample allowance; this ledger is account-only.
    if (!data.session?.user?.id) return true
    const userId = data.session.user.id
    if (!stillActive()) return false
    const key = JSON.stringify([userId, unit.course, unit.trainerKey, unit.unitKey])
    let request = pending.get(key)
    if (!request) {
      request = (async () => {
        const admissionKey = await readAdmissionActivityKey(userId, unit)
        const session = await supabase.auth.getSession()
        if (!stillActive() || route !== window.location.pathname + window.location.search || session.data.session?.user.id !== userId) return { cancelled: true }
        return supabase.rpc('claim_auto_training_chunk', {
          p_course: unit.course, p_trainer_key: admissionKey, p_unit_key: unit.unitKey,
          p_item_ids: unit.itemIds ?? [],
        })
      })().finally(() => pending.delete(key))
      pending.set(key, request)
    }
    const result = await request
    if (result.cancelled) return false
    // An old loader must not activate a board after navigation/account switching.
    const current = await supabase.auth.getSession()
    if (!stillActive() || route !== window.location.pathname + window.location.search || current.data.session?.user.id !== userId) return false
    if (result.error || typeof result.data?.allowed !== 'boolean') throw new Error('Training allowance could not be verified. Please try again.')
    if (result.data.allowed) return true
    window.dispatchEvent(new CustomEvent(AUTO_ALLOWANCE_STOP, { detail: { route, limited: true } }))
  } catch (error) {
    if (stillActive() && route === window.location.pathname + window.location.search) {
      window.dispatchEvent(new CustomEvent(AUTO_ALLOWANCE_STOP, { detail: {
        route, limited: false, message: error instanceof Error ? error.message : 'Training allowance unavailable.',
      } }))
    }
  }
  return false
}
