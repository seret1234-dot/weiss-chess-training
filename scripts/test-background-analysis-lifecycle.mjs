import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 await Promise.all([
  vite.transformRequest("/src/context/BackgroundAnalysisContext.tsx"),
  vite.transformRequest("/src/AppRouter.tsx"),
 ])

 const lifecycle = await vite.ssrLoadModule("/src/context/BackgroundAnalysisContext.tsx")
 const [providerSource, routerSource] = await Promise.all([
  readFile(new URL("../src/context/BackgroundAnalysisContext.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/AppRouter.tsx", import.meta.url), "utf8"),
 ])
 const { applyAnalysisJobUpdate, createAnalysisJob } = lifecycle
 const input = { userId: "user-1", chesscomUsername: "chess-user", lichessUsername: "lichess-user" }
 const first = createAnalysisJob(input, "2026-08-11T12:00:00.000Z", "job-1")

 // 1. Importing advances to analyzing normally.
 const analyzing = applyAnalysisJobUpdate(first, "job-1", {
  status: "analyzing", gamesImported: 83, gamesTotal: 83, gamesCompleted: 3,
 }, "2026-08-11T12:01:00.000Z")
 assert.equal(analyzing.status, "analyzing", "importing advances to analyzing")

 // 2/3. Navigation keeps the provider mounted above Routes; live progress and
 // job ID are therefore held in the same provider rather than route state.
 const providerAt = routerSource.indexOf("<BackgroundAnalysisProvider user={user}>")
 const routesAt = routerSource.indexOf("<Routes>")
 assert.ok(providerAt >= 0 && routesAt >= 0 && providerAt < routesAt, "provider is mounted outside normal route switching")
 const afterNavigation = applyAnalysisJobUpdate(analyzing, "job-1", {}, "2026-08-11T12:02:00.000Z")
 assert.equal(afterNavigation.jobId, "job-1", "route navigation retains the same job ID")
 assert.deepEqual(
  [afterNavigation.status, afterNavigation.gamesCompleted, afterNavigation.gamesTotal],
  ["analyzing", 3, 83],
  "route navigation retains analyzing progress",
 )

 // 4. A delayed import callback cannot regress an active analysis.
 const staleImport = applyAnalysisJobUpdate(analyzing, "job-1", { status: "importing" })
 assert.equal(staleImport, analyzing, "stale importing update is ignored after analyzing")

 // 5. A callback belonging to a prior job cannot mutate the new active job.
 const second = createAnalysisJob(input, "2026-08-11T12:03:00.000Z", "job-2")
 const oldJobCallback = applyAnalysisJobUpdate(second, "job-1", { status: "failed", error: "old run" })
 assert.equal(oldJobCallback, second, "prior-job callback is ignored")

 // 6. The route owner remains global rather than a page-level provider.
 assert.match(routerSource, /<BackgroundAnalysisProvider user=\{user\}>[\s\S]*<Routes>/, "provider lifetime spans navigation")

 // 7. An analyzing checkpoint resumes the analyzer without running the import
 // branch; only an importing checkpoint is permitted to run that branch.
assert.match(providerSource, /if \(!resume \|\| \(run\.status === "importing" && !run\.importCompleted\)\)/, "resume imports only an incomplete importing checkpoint")
 assert.match(providerSource, /if \(ACTIVE_STATUSES\.includes\(saved\.status\)\) void runAnalysis\(saved, true\)/, "active checkpoint resumes with its saved phase")

 // 8. Terminal jobs cannot regress through ordinary updates/navigation.
 const completed = applyAnalysisJobUpdate(analyzing, "job-1", { status: "completed" })
 const completedRegression = applyAnalysisJobUpdate(completed, "job-1", { status: "importing" })
 assert.equal(completedRegression, completed, "completed job cannot restart on navigation")

 // 9. An explicit new analysis uses a new run ID and valid importing phase.
 assert.notEqual(first.jobId, second.jobId, "explicit new analysis creates a new run ID")
 assert.equal(second.status, "importing", "explicit new analysis may begin importing")

 console.log("PASS: background analysis lifecycle is monotonic, run-scoped, route-safe, and phase-aware on reload")
} finally {
 await vite.close()
}
