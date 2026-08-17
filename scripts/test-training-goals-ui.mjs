import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  await vite.ssrLoadModule("/src/components/TrainingGoalsFields.tsx")
  await vite.transformRequest("/src/pages/OnboardingPage.tsx")
  await vite.transformRequest("/src/AccountPage.tsx")
  const [onboarding, account, fields, migration] = await Promise.all([
    readFile(new URL("../src/pages/OnboardingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AccountPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/TrainingGoalsFields.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260811_add_training_goals.sql", import.meta.url), "utf8"),
  ])

  assert.match(onboarding, /TrainingGoalsFields/, "onboarding renders the shared training-goal controls")
  assert.match(onboarding, /onboarding-page__form-grid/, "onboarding uses the responsive two-column desktop form shell")
  assert.match(onboarding, /compact/, "onboarding uses the compact shared controls on desktop")
  assert.match(onboarding, /disabled=\{saving\}/, "onboarding locks Step 1 controls while setup is running")
  assert.match(onboarding, /serializeTrainingGoals\(goals\)/, "onboarding persists canonical goals")
  assert.doesNotMatch(onboarding, /defaultDailyMinutes/, "onboarding no longer silently hard-codes 20 minutes")
  assert.match(fields, /Current rating \(optional\)/, "manual current rating is clearly labeled as optional")
  assert.match(fields, /What rating would you like to reach\?/, "target rating has an unambiguous visible label")
  assert.match(fields, /Your current training rating will be estimated from your imported games\./, "current-rating helper explains imported-game estimation")
  assert.match(fields, /disabled=\{disabled\}/, "goal inputs and Step 1 controls support the analysis lock")
  assert.match(fields, /aria-label="Custom daily practice minutes"/, "shared controls expose a custom practice-minutes input")
  assert.match(fields, /training-goals-fields__custom-minutes/, "the shared custom practice-minutes control has a stable layout hook")
  assert.ok(
    /<TrainingGoalsFields/.test(onboarding) && /Custom daily practice minutes/.test(fields),
    "the onboarding version of TrainingGoalsFields exposes the custom minutes control",
  )
  assert.match(fields, /min=\{1\}/, "custom practice-minutes input has a positive minimum")
  assert.match(fields, /max=\{600\}/, "custom practice-minutes input has the configured maximum")
  assert.match(fields, /customDailyMinutesOrInvalid/, "custom practice-minutes input rejects invalid values instead of selecting a preset")
  assert.match(account, /Save Training Goals/, "Account Settings has an independent save action")
  assert.match(account, /serializeLegacyProfileTrainingGoals\(trainingGoals\)/, "Account Settings keeps the legacy profile mirror current")
  assert.match(account, /serializeTrainingGoals\(trainingGoals\)/, "Account Settings writes canonical auto-profile goals")
  assert.match(migration, /manual_current_rating/, "migration stores manual fallback rating")
  assert.match(migration, /goal_timeframe_months/, "migration stores timeframe")
  assert.match(migration, /current_milestone_rating/, "migration stores current milestone")

  console.log("PASS: onboarding and Account Settings goal controls compile and persist through the canonical profile flow")
} finally {
  await vite.close()
}
