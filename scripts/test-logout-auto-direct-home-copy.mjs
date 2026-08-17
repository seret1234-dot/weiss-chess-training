import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

const weeklyStatus = (status) => ({
  weekKey: "2026-08-10",
  status,
  currentGame: status === "in_progress" ? 1 : 0,
  gamesCompleted: status === "in_progress" ? 1 : 0,
  completedAt: status === "complete" ? "2026-08-12T00:00:00.000Z" : null,
  source: "local",
  cloudAvailable: false,
  planSignals: null,
  transferTargets: [],
})

const decision = (route, trainerKey) => ({
  route,
  trainerKey,
  chunkIndex: 0,
  source: "curriculum",
  label: trainerKey,
  explanation: "test recommendation",
  selectionIndex: 0,
})

try {
  await Promise.all([
    vite.transformRequest("/src/AppRouter.tsx"),
    vite.transformRequest("/src/components/GlobalFloatingPlay.tsx"),
    vite.transformRequest("/src/pages/AutoStudyPage.tsx"),
    vite.transformRequest("/src/LandingPage.tsx"),
  ])
  const [logout, auto] = await Promise.all([
    vite.ssrLoadModule("/src/auth/logout.ts"),
    vite.ssrLoadModule("/src/training/resolveAutoStartRoute.ts"),
  ])
  const [routerSource, menuSource, autoPageSource, landingSource, playComputerSource] = await Promise.all([
    readFile("src/AppRouter.tsx", "utf8"),
    readFile("src/components/GlobalFloatingPlay.tsx", "utf8"),
    readFile("src/pages/AutoStudyPage.tsx", "utf8"),
    readFile("src/LandingPage.tsx", "utf8"),
    readFile("src/pages/PlayComputerPage.tsx", "utf8"),
  ])

  const successEvents = []
  const success = await logout.performLogout({
    signOut: async () => ({ error: null }),
    onSessionCleared: () => successEvents.push("cleared"),
    navigateToSignedOut: () => successEvents.push("navigated"),
  })
  assert.deepEqual(success, { ok: true }, "first logout attempt succeeds")
  assert.deepEqual(successEvents, ["cleared", "navigated"], "session clears before the signed-out route opens")

  const failureEvents = []
  const failure = await logout.performLogout({
    signOut: async () => ({ error: { message: "offline" } }),
    onSessionCleared: () => failureEvents.push("cleared"),
    navigateToSignedOut: () => failureEvents.push("navigated"),
  })
  assert.deepEqual(failure, { ok: false, message: "offline" }, "sign-out failure is returned for retry")
  assert.deepEqual(failureEvents, [], "failed logout preserves the visible signed-in state")
  assert.match(menuSource, /logoutInFlightRef\.current/, "repeated logout clicks share an in-flight guard")
  assert.match(menuSource, /disabled=\{isSigningOut\}/, "logout cannot be double-clicked while pending")
  assert.match(menuSource, /role="alert"/, "logout failure is visibly reported")
  assert.match(routerSource, /authStateRevisionRef/, "stale initial session reads cannot overwrite a newer auth event")
  assert.match(routerSource, /setUser\(null\)/, "signed-out application state clears immediately")

  const weeklyRoute = auto.resolveAutoStartRoute({
    weeklyStatus: weeklyStatus("due"),
    curriculumDecision: decision("/mates/m1", "mates-m1"),
  })
  assert.match(weeklyRoute, /^\/play-computer\?weekly=1&auto=1$/, "weekly Game 1 has priority")
  assert.match(autoPageSource, /latestWeeklyStatus\.status === "in_progress" \|\| latestWeeklyStatus\.status === "due"/, "Auto always prioritizes due or resumed weekly review")
  assert.match(playComputerSource, /weeklyGameIndex !== 0 \|\| gameStarted \|\| !engineReady/, "weekly Game 1 still starts automatically once the engine is ready")

  const matesRoute = auto.resolveAutoStartRoute({
    weeklyStatus: weeklyStatus("complete"),
    curriculumDecision: decision("/mates/m1", "mates-m1"),
  })
  assert.match(matesRoute, /^\/mates\/m1\?auto=1/, "normal Auto opens a mates recommendation directly")

  const tacticsRoute = auto.resolveAutoStartRoute({
    weeklyStatus: weeklyStatus("complete"),
    curriculumDecision: decision("/tactics/m2", "tactics-m2"),
  })
  assert.match(tacticsRoute, /^\/tactics\/m2\?auto=1/, "other plan recommendations open their trainer directly")

  const safeStarterRoute = auto.resolveAutoStartRoute({
    weeklyStatus: weeklyStatus("complete"),
    curriculumDecision: null,
  })
  assert.equal(safeStarterRoute, "/mates/m1?auto=1", "missing recommendation uses the safe starter")
  assert.doesNotMatch(safeStarterRoute, /pricing/, "free users are not sent to Pricing by Auto")
  assert.equal(auto.AUTO_TRAINING_ENTRY_ROUTE, "/auto?continue=1", "Auto entry is distinct from the plan overview")
  assert.match(landingSource, /navigate\(user \? AUTO_TRAINING_ENTRY_ROUTE/, "Start Auto Training goes straight to the next task")
  assert.match(landingSource, /View My Training Plan/, "plan overview remains directly accessible")

  for (const line of [
    "Learn the basic patterns of chess, one idea at a time.",
    "Each skill is divided into clear subthemes and trained at distances of 1, 2, 3, and 4+ moves.",
    "Repeat exercises until you can solve them fast 5 times, then they return later for reinforcement.",
    "Your individual training plan is built from your own games, so you practice what you need most.",
  ]) {
    assert.match(landingSource, new RegExp(line.replace(/[+]/g, "\\+")), `Home includes: ${line}`)
  }

  console.log("Logout, direct Auto, weekly priority, safe starter, plan overview, and Home copy checks passed.")
} finally {
  await vite.close()
}
