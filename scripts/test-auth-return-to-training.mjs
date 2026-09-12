import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  AUTH_RETURN_TARGET_STATE_KEY,
  AUTH_RETURN_TARGET_STORAGE_KEY,
  AUTH_RETURN_TARGET_TTL_MS,
  authRouterState,
  consumeTrainingReturnTarget,
  currentTrainingReturnTarget,
  isLimitedTrainingPath,
  readRememberedTrainingReturnTarget,
  rememberTrainingReturnTarget,
  resolveTrainingReturnTarget,
  validTrainingReturnTarget,
} from '../src/auth/trainingReturnTarget.mjs'

class MemoryStorage {
  #values = new Map()
  getItem(key) { return this.#values.get(key) ?? null }
  setItem(key, value) { this.#values.set(key, String(value)) }
  removeItem(key) { this.#values.delete(key) }
}

const exactTargets = [
  '/tactics/m1/knight-fork?chunk=17&puzzle=8#board',
  '/mates/m1/back-rank?chunk=50&puzzle=12',
  '/master-tactics/2/bishop-fork?chunk=10&puzzle=3',
  '/master-mates/1/smothered?chunk=4&puzzle=6',
  '/master-games/my-library',
  '/master-games/my-library/practice',
  '/openings/my-openings',
  '/openings/my-openings/practice',
  '/openings/ruy-lopez?family=ruy-lopez&puzzle=3#board',
]

for (const target of exactTargets) {
  assert.equal(validTrainingReturnTarget(target), target, `${target} is a safe training return target`)
  assert.equal(isLimitedTrainingPath(new URL(target, 'https://weiss.internal').pathname), true)
}

assert.equal(currentTrainingReturnTarget({ pathname: '/tactics/m1/knight-fork', search: '?chunk=17&puzzle=8', hash: '#board' }), exactTargets[0])
assert.equal(isLimitedTrainingPath('/master-mates/1/kill-box'), false, 'a Master Mate family selector is not quota-gated as a trainer')

for (const invalid of [
  'https://evil.example/tactics/m1/fork',
  '//evil.example/tactics/m1/fork',
  'javascript:alert(1)',
  '/\\evil.example/tactics/m1/fork',
  '/auth?returnTo=/tactics/m1/fork',
  '/',
  '/account',
  '/tactics',
]) {
  assert.equal(validTrainingReturnTarget(invalid), null, `${invalid} must not become an auth redirect`)
}

const now = 1_800_000_000_000
const storage = new MemoryStorage()
const record = rememberTrainingReturnTarget(exactTargets[0], { storage, now })
assert.deepEqual(record, { target: exactTargets[0], createdAt: now })
assert.deepEqual(authRouterState(record), { [AUTH_RETURN_TARGET_STATE_KEY]: record })
assert.deepEqual(readRememberedTrainingReturnTarget({ storage, now: now + 1_000 }), record)

const alternate = exactTargets[1]
const stateRecord = { target: alternate, createdAt: now }
assert.equal(resolveTrainingReturnTarget({
  routerState: { [AUTH_RETURN_TARGET_STATE_KEY]: stateRecord },
  search: `?returnTo=${encodeURIComponent(exactTargets[2])}`,
  storage,
  now,
}), alternate, 'validated router state has precedence')
assert.equal(resolveTrainingReturnTarget({ search: `?returnTo=${encodeURIComponent(exactTargets[2])}`, storage, now }), null, 'a query alone cannot inject a return target')
assert.equal(resolveTrainingReturnTarget({ storage, now }), null, 'ordinary Home/Account auth cannot inherit stale training state')
assert.equal(resolveTrainingReturnTarget({ search: '?resumeTraining=1', storage, now }), exactTargets[0], 'explicit training-auth flow enables the full-page session fallback')

consumeTrainingReturnTarget(alternate, { storage, now })
assert.ok(storage.getItem(AUTH_RETURN_TARGET_STORAGE_KEY), 'a different tab/flow cannot consume this target')
consumeTrainingReturnTarget(exactTargets[0], { storage, now })
assert.equal(storage.getItem(AUTH_RETURN_TARGET_STORAGE_KEY), null, 'successful matching auth consumes once')

rememberTrainingReturnTarget(exactTargets[0], { storage, now })
assert.equal(readRememberedTrainingReturnTarget({ storage, now: now + AUTH_RETURN_TARGET_TTL_MS + 1 }), null, 'stale return targets expire')
assert.equal(storage.getItem(AUTH_RETURN_TARGET_STORAGE_KEY), null, 'expired state is removed')

const [quotaSource, authSource, onboardingSource] = await Promise.all([
  readFile(new URL('../src/context/TrainingQuotaContext.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/AuthPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/OnboardingPage.tsx', import.meta.url), 'utf8'),
])

assert.match(quotaSource, /currentTrainingReturnTarget\(location\)/)
assert.match(quotaSource, /rememberTrainingReturnTarget\(target\)/)
assert.match(quotaSource, /function beginLogin\(\)/)
assert.match(quotaSource, /navigate\("\/auth\?resumeTraining=1"/)
assert.match(quotaSource, /function beginSignup\(\) \{\s*consumeTrainingReturnTarget\(\)\s*navigate\("\/auth\?mode=signup"\)/)
assert.doesNotMatch(quotaSource, /mode=signup&resumeTraining=1/)
assert.match(authSource, /requestedSignup\s*\? null\s*:\s*resolveTrainingReturnTarget\(\{ routerState: location\.state, search: location\.search \}\)/)
assert.match(authSource, /window\.location\.replace\(returnTarget \|\| "\/"\)/, 'normal login keeps Home as the no-target fallback')
assert.match(authSource, /emailRedirectTo:\s*`\$\{window\.location\.origin\}\/onboarding`/)
assert.match(authSource, /consumeTrainingReturnTarget\(\)\s*window\.location\.assign\("\/onboarding"\)/)
assert.doesNotMatch(authSource, /onboardingDestination|onboarding\?returnTo/)
assert.doesNotMatch(onboardingSource, /trainingReturnTarget|returnTarget|resumeTraining/)
assert.match(onboardingSource, /navigate\("\/", \{ replace: true \}\)/)

console.log('PASS: auth return targets are internal-only, exact, one-time, TTL-bound, login-only, and excluded from signup/onboarding')
