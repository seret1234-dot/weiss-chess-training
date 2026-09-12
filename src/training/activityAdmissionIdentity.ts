import { supabase } from '../lib/supabase'
import { activityReadKeys } from './activityIdentity'

type Unit = { course: string; trainerKey: string; unitKey: string }
type History = { trainer_key: string; unit_key?: string; chunk_index?: number; is_mastered?: boolean; mastered_puzzles_count?: number; next_review_at?: string | null; next_due_at?: string | null }

/** Reuse an exact existing key for quota admission only, never for puzzle writes.
 * This is not entitlement authorization: claim_auto_training_chunk rechecks
 * ownership/history/subscription/UTC allowance under its existing database lock.
 */
export function existingAdmissionKey(unit: Unit, ledger: History[], progress: History[]) {
 const aliases = activityReadKeys(unit.trainerKey)
 const unlocked = (key: string) => ledger.some(row => row.trainer_key === key && row.unit_key === unit.unitKey)
 const historical = (key: string) => progress.some(row => row.trainer_key === key && Math.max(1, row.chunk_index ?? -1) === Number(unit.unitKey) &&
  (row.is_mastered === true || (row.mastered_puzzles_count ?? 0) > 0 || Boolean(row.next_review_at || row.next_due_at)))
 // Exact current-version evidence always wins, so today's existing ledger row
 // is reused and cannot be replaced with an extra alias/unlock row.
 return aliases.find(key => unlocked(key) || historical(key)) ?? unit.trainerKey
}

export async function readAdmissionActivityKey(userId: string, unit: Unit) {
 const aliases = activityReadKeys(unit.trainerKey)
 if (unit.course !== 'pattern' || aliases.length === 1) return unit.trainerKey
 const [ledger, progress] = await Promise.all([
  supabase.from('auto_training_chunk_unlocks').select('trainer_key,unit_key')
   .eq('user_id', userId).eq('course', unit.course).eq('unit_key', unit.unitKey).in('trainer_key', aliases),
  supabase.from('user_chunk_progress').select('*').eq('user_id', userId)
   .in('chunk_index', Number(unit.unitKey) === 1 ? [0, 1] : [Number(unit.unitKey)]).in('trainer_key', aliases),
 ])
 if (ledger.error || progress.error) throw new Error('Training history could not be verified. Please try again.')
 return existingAdmissionKey(unit, ledger.data ?? [], progress.data ?? [])
}
