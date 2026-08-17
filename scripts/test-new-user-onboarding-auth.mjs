import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 await Promise.all([
  vite.transformRequest("/src/AppRouter.tsx"),
  vite.transformRequest("/src/AuthGate.tsx"),
  vite.transformRequest("/src/AuthPage.tsx"),
  vite.transformRequest("/src/pages/AutoStudyPage.tsx"),
  vite.transformRequest("/src/components/AutoTrainingController.tsx"),
 ])

 const [router, authGate, authPage, autoStudyPage, autoTrainingController] = await Promise.all([
  readFile(new URL("../src/AppRouter.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AuthGate.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AuthPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/AutoStudyPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/AutoTrainingController.tsx", import.meta.url), "utf8"),
 ])

 // Established authenticated users on / and /account cannot be sent to
 // onboarding by a global route wrapper or Home effect.
 assert.doesNotMatch(router, /AuthGate/, "AppRouter has no global onboarding route guard")
 assert.doesNotMatch(authGate, /\/onboarding|navigate\(|getOrCreateAutoProfile/, "AuthGate is now a pass-through and cannot redirect Home")
 assert.doesNotMatch(router, /<Navigate[^>]+to=.*onboarding/, "the route table has no hidden onboarding redirect")

 // /onboarding is a direct route and remains manually reachable without a loop.
 assert.equal((router.match(/path="\/onboarding"/g) ?? []).length, 1, "one canonical /onboarding route remains registered")
 assert.match(router, /path="\/onboarding" element=\{<OnboardingPage \/>\}/, "direct /onboarding renders the onboarding application")

 // New signup/confirmation traffic goes to onboarding without relying on a
 // global Home redirect. The immediate-session case uses the same target.
 assert.match(authPage, /emailRedirectTo:\s*`\$\{window\.location\.origin\}\/onboarding`/, "signup confirmation requests the deployment's /onboarding URL")
 assert.match(authPage, /window\.location\.assign\("\/onboarding"\)/, "an immediately authenticated signup opens onboarding")

 // The only remaining automatic redirect is scoped to the explicit /auto
// page. The Home controller only advances after a drill-complete event or an
// explicit button click; it does not mount-navigate from Home.
 assert.match(autoStudyPage, /if \(!autoProfile\.onboarding_complete\) \{\s*navigate\("\/onboarding", \{ replace: true \}\)/, "only the explicit personal-course route protects its own prerequisites")
 assert.match(router, /path="\/auto" element=\{<AutoStudyPage user=\{user\} \/>\}/, "AutoStudyPage is reachable only through /auto")
 assert.match(autoTrainingController, /window\.addEventListener\(AUTO_TRAINING_COMPLETE_EVENT, handleComplete\)/, "the Home auto-training controller advances only after a drill-complete event")
 assert.match(autoTrainingController, /onClick=\{continueCourse\}/, "the Home auto-training controller otherwise requires an explicit click")

 console.log("PASS: Home and normal routes have no global onboarding redirect; signup confirmation and direct onboarding remain available")
} finally {
 await vite.close()
}
