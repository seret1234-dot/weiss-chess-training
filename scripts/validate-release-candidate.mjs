import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = async (path) => readFile(resolve(root, path), 'utf8')
const mustInclude = async (path, value) =>
  assert.ok((await source(path)).includes(value), `${path} must include ${value}`)
const mustExclude = async (path, value) =>
  assert.ok(!(await source(path)).includes(value), `${path} must not include ${value}`)

await mustInclude('src/training/autoChunkAllowance.ts', 'isAutoChunkTraining')
await mustInclude('src/training/autoChunkAllowance.ts', 'claim_auto_training_chunk')
await mustInclude('src/auth/AccountSessionBoundary.tsx', 'Navigate to="/"')
await mustInclude('src/pages/IntroductionPage.tsx', 'AUTO_TRAINING_ENTRY_ROUTE')
await mustInclude('src/training/autoGameReview.ts', 'saveAutoGameResult')
await mustInclude('src/lib/chess/gameResult.js', 'stalemate')
await mustInclude('src/lib/chess/gameResult.js', 'threefold-repetition')
await mustInclude('src/trainers/chunkProgressReset.mjs', 'currentPuzzleIndex: 0')
await mustInclude('src/components/chess/PromotionChooser.tsx', "'q'")
await mustInclude('src/components/chess/PromotionChooser.tsx', "'n'")
await mustInclude('src/context/SubscriptionContext.tsx', 'isPremium')
await mustInclude('src/release/buildManifest.ts', 'builtAt')
await mustInclude('src/AppRouter.tsx', 'path="/admin/release" element={user ? <ReleaseManifestPage />')
await mustExclude('src/AppRouter.tsx', 'TrainingQuotaProvider')
await mustExclude('src/components/AutoTrainingController.tsx', 'Finish drill & continue')
await mustExclude('src/components/AutoTrainingController.tsx', '10 free training items')

console.log('release candidate critical-path guard passed')
