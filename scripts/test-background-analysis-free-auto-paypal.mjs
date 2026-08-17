import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 await Promise.all([
  vite.transformRequest("/src/context/BackgroundAnalysisContext.tsx"),
  vite.transformRequest("/src/components/BackgroundAnalysisStatus.tsx"),
  vite.transformRequest("/src/pages/OnboardingPage.tsx"),
  vite.transformRequest("/src/PricingPage.tsx"),
  vite.transformRequest("/src/context/TrainingQuotaContext.tsx"),
 ])

 const [provider, status, statusCss, floatingMenu, onboarding, router, autoStudy, quota, pricing] = await Promise.all([
  readFile(new URL("../src/context/BackgroundAnalysisContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/BackgroundAnalysisStatus.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/BackgroundAnalysisStatus.css", import.meta.url), "utf8"),
  readFile(new URL("../src/components/GlobalFloatingPlay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/OnboardingPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AppRouter.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/AutoStudyPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/context/TrainingQuotaContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/PricingPage.tsx", import.meta.url), "utf8"),
 ])

 // Background analysis is application-owned, route-safe, resumable only when
 // the browser returns, and communicates progress/completion/failure globally.
 assert.match(onboarding, /startAnalysis\(/, "onboarding starts the shared analysis job")
 assert.match(onboarding, /navigate\("\/", \{ replace: true \}\)/, "onboarding returns Home immediately after starting analysis")
 assert.doesNotMatch(onboarding, /analyzeImportedGamesWithStockfish/, "onboarding no longer owns the long engine run")
 assert.match(provider, /importConnectedAccounts/, "the shared manager reuses the existing import pipeline")
 assert.match(provider, /analyzeImportedGamesWithStockfish/, "the shared manager reuses the existing Stockfish pipeline")
 assert.match(provider, /STORAGE_KEY/, "job state is persisted for browser-return resume")
 assert.match(provider, /Browser Stockfish is not a server job/, "the implementation makes no false tab-close background claim")
 assert.match(router, /BackgroundAnalysisProvider/, "analysis manager stays mounted across normal route navigation")
 assert.match(status, /Analyzing your games/, "global progress is visible")
 assert.match(status, /Your personalized training plan is ready/, "global completion notification is visible")
 assert.match(status, /Retry analysis/, "failure offers retry")
 assert.match(status, /background-analysis-status/, "analysis status uses its shared fixed-position hook")
 assert.match(floatingMenu, />\s*Menu\s*</, "the floating Menu remains rendered with global analysis")
 assert.match(statusCss, /bottom: 70px/, "desktop analysis status is stacked above Menu")
 assert.match(statusCss, /--site-fixed-bottom-clearance/, "mobile analysis status clears the existing mobile Menu dock")

 // Auto Study is free to open; the existing quota still controls individual
 // training routes and Premium remains unlimited through the same context.
 assert.doesNotMatch(quota, /premiumOnlyRoute/, "Auto Study is no longer a Premium-only route")
 assert.doesNotMatch(quota, /path === "\/auto"/, "opening Auto Study cannot trigger the Premium wall")
 assert.match(quota, /FREE_DAILY_LIMIT = 10/, "the canonical free daily limit remains in use")
 assert.match(quota, /quota\.tier !== "premium"/, "Premium remains unlimited in the canonical quota gate")
 assert.match(autoStudy, /buildPersonalTrainingPlan/, "free users can still receive the personalized plan")

 // PayPal is readiness-gated, uses one provider per attempt, retries one
 // rejected first load, and provides an explicit manual retry action.
 assert.match(pricing, /PayPalCheckout/, "pricing has one retryable SDK-provider owner")
 assert.match(pricing, /key=\{attempt\}/, "SDK retries remount a single provider attempt")
 assert.match(pricing, /isPending \|\| typeof window === "undefined" \|\| !window\.paypal/, "buttons wait for SDK readiness")
 assert.match(pricing, /window\.setTimeout\(\(\) => onRetry\(false\), 600\)/, "a rejected first load retries once automatically")
 assert.match(pricing, /Retry PayPal/, "persistent failure exposes manual retry")
 assert.equal((pricing.match(/period="monthly"/g) ?? []).length, 1, "monthly buttons render once")
 assert.equal((pricing.match(/period="yearly"/g) ?? []).length, 1, "yearly buttons render once")

 console.log("PASS: background analysis, free Auto Study access, canonical quota, and PayPal first-load recovery are wired")
} finally {
 await vite.close()
}
