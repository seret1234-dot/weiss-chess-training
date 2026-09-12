/** Hydration is not learner evidence. Scope completion to the current loaded
 * chunk, and invalidate stale async loads when auth/route/chunk changes. */
export function createChunkCompletionGate() {
 let generation = 0
 let readyKey: string | null = null
 let learnerEvidence = false
 let requiresFreshEvidence = true
 return {
  begin() { readyKey = null; learnerEvidence = false; return ++generation },
  isCurrent(token: number) { return token === generation },
  ready(token: number, key: string, dueReview = true) {
   if (token !== generation) return false
   readyKey = key
   requiresFreshEvidence = dueReview
   return true
  },
  qualifiedSolve(key: string) {
   if (readyKey !== key) return false
   learnerEvidence = true
   return true
  },
  canCommit(key: string, counts: number[], required: number) {
   return readyKey === key && (!requiresFreshEvidence || learnerEvidence) && counts.length > 0 && counts.every(count => count >= required)
  },
 }
}
