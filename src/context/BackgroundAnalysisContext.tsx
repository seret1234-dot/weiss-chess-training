import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { importConnectedAccounts } from "../training/importConnectedAccounts"
import { analyzeImportedGamesWithStockfish } from "../training/engineAnalyzeImportedGames"
import { trackAnalyticsEvent } from "../lib/analytics"

export type BackgroundAnalysisStatus = "idle" | "importing" | "analyzing" | "building-plan" | "completed" | "failed"

export type AnalysisInput = { userId: string; chesscomUsername: string; lichessUsername: string }
export type AnalysisJob = {
 jobId: string | null
 status: BackgroundAnalysisStatus
 gamesImported: number
 importCompleted: boolean
 gamesTotal: number
 gamesCompleted: number
 startedAt: string | null
 updatedAt: string | null
 error: string | null
 analysisVersion: number
 planReadyAcknowledged: boolean
 input: AnalysisInput | null
}

type BackgroundAnalysisContextValue = {
 job: AnalysisJob
 startAnalysis: (input: AnalysisInput) => void
 retryAnalysis: () => void
 acknowledgePlanReady: () => void
}

const STORAGE_KEY = "weissChess:background-analysis:v1"
const ACTIVE_STATUSES: BackgroundAnalysisStatus[] = ["importing", "analyzing", "building-plan"]
const phaseRank: Record<BackgroundAnalysisStatus, number> = {
 idle: 0, importing: 1, analyzing: 2, "building-plan": 3, completed: 4, failed: 5,
}

export const idleJob: AnalysisJob = {
 jobId: null, status: "idle", gamesImported: 0, importCompleted: false, gamesTotal: 0, gamesCompleted: 0, startedAt: null,
 updatedAt: null, error: null, analysisVersion: 2, planReadyAcknowledged: false, input: null,
}

const BackgroundAnalysisContext = createContext<BackgroundAnalysisContextValue | undefined>(undefined)

function createJobId() {
 if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
 return `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function persist(job: AnalysisJob) {
 try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(job)) } catch { /* browser storage is optional */ }
}

export function readPersistedJob(): AnalysisJob | null {
 try {
  const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")
  if (!parsed?.input || typeof parsed.status !== "string") return null
  // Records created before v2 did not have a run ID. Treat the restored record
  // as one stable legacy run rather than allowing it to overwrite a live run.
  const legacyId = `legacy-${parsed.startedAt || parsed.updatedAt || "unknown"}`
  return { ...idleJob, ...parsed, jobId: parsed.jobId || legacyId, analysisVersion: 2 }
 } catch { return null }
}

export function canAdvanceAnalysisStatus(current: BackgroundAnalysisStatus, next: BackgroundAnalysisStatus) {
 if (current === next) return true
 if (next === "failed") return current !== "idle"
 if (current === "failed") return false
 return phaseRank[next] >= phaseRank[current]
}

export function applyAnalysisJobUpdate(
 current: AnalysisJob,
 jobId: string,
 patch: Partial<AnalysisJob>,
 now = new Date().toISOString(),
): AnalysisJob {
 if (current.jobId !== jobId) return current
 if (patch.status && !canAdvanceAnalysisStatus(current.status, patch.status)) return current
 return { ...current, ...patch, updatedAt: now }
}

export function createAnalysisJob(input: AnalysisInput, now = new Date().toISOString(), jobId = createJobId()): AnalysisJob {
 return {
  ...idleJob,
  jobId,
  status: "importing",
  input,
  startedAt: now,
  updatedAt: now,
 }
}

export function BackgroundAnalysisProvider({ user, children }: { user: User | null; children: ReactNode }) {
 const [job, setJob] = useState<AnalysisJob>(idleJob)
 const jobRef = useRef<AnalysisJob>(idleJob)
 const runningJobsRef = useRef(new Set<string>())
 const restoredUserRef = useRef<string | null>(null)
 const userRef = useRef(user)
 userRef.current = user

 const updateJob = useCallback((jobId: string, patch: Partial<AnalysisJob>) => {
  // The ref prevents stale async callbacks from a previous run from winning a
  // race before React has committed the next job state.
  if (jobRef.current.jobId !== jobId) return false
  setJob((current) => {
   const next = applyAnalysisJobUpdate(current, jobId, patch)
   if (next === current) return current
   jobRef.current = next
   persist(next)
   return next
  })
  return true
 }, [])

 const finalizePlan = useCallback(async (jobId: string, input: AnalysisInput) => {
  if (!updateJob(jobId, { status: "building-plan" })) return
  const { error } = await supabase
   .from("user_auto_profile")
   .update({ onboarding_step: 2, onboarding_complete: true })
   .eq("user_id", input.userId)
  if (error) throw error

  if (!updateJob(jobId, { status: "completed", error: null, planReadyAcknowledged: false })) return
  trackAnalyticsEvent("onboarding_completed")
 }, [updateJob])

 const runAnalysis = useCallback(async (run: AnalysisJob, resume = false) => {
  const { input, jobId } = run
  if (!input || !jobId || runningJobsRef.current.has(jobId)) return
  runningJobsRef.current.add(jobId)

  try {
   // On reload, importing resumes import, but analyzing/building-plan resumes
   // from its persisted phase. Navigation never calls this routine at all.
   if (!resume || (run.status === "importing" && !run.importCompleted)) {
    if (!updateJob(jobId, { status: "importing", error: null })) return
    const imported = await importConnectedAccounts({
     userId: input.userId,
     chesscomUsername: input.chesscomUsername,
     lichessUsername: input.lichessUsername,
     onProgress: () => { updateJob(jobId, { status: "importing" }) },
    })
    if (!updateJob(jobId, { status: "analyzing", error: null, gamesImported: imported.retainedGamesCount, importCompleted: true })) return
   }

   if (run.status === "building-plan" && resume) {
    await finalizePlan(jobId, input)
    return
   }

   if (!updateJob(jobId, { status: "analyzing", error: null })) return
   await analyzeImportedGamesWithStockfish(input.userId, {
    maxGames: 150,
    depth: 8,
    minLossCp: 70,
    onProgress: (progress) => {
     updateJob(jobId, {
      status: "analyzing",
      gamesTotal: resume ? Math.max(run.gamesTotal, run.gamesCompleted + progress.gamesTotal) : progress.gamesTotal,
      gamesCompleted: resume ? run.gamesCompleted + progress.gamesDone : progress.gamesDone,
     })
    },
   })

   if (jobRef.current.jobId !== jobId) return
   await finalizePlan(jobId, input)
  } catch (error) {
   console.error("Background game analysis failed", error)
   updateJob(jobId, {
    status: "failed",
    error: error instanceof Error ? error.message : "We couldn't finish analyzing your games.",
   })
  } finally {
   runningJobsRef.current.delete(jobId)
  }
 }, [finalizePlan, updateJob])

 const startAnalysis = useCallback((input: AnalysisInput) => {
  const next = createAnalysisJob(input)
  // Set this synchronously so callbacks from an older job can no longer patch
  // the job while React schedules this new state.
  jobRef.current = next
  persist(next)
  setJob(next)
  void runAnalysis(next)
 }, [runAnalysis])

 const retryAnalysis = useCallback(() => {
  if (jobRef.current.input) startAnalysis(jobRef.current.input)
 }, [startAnalysis])

 const acknowledgePlanReady = useCallback(() => {
  const activeJobId = jobRef.current.jobId
  if (activeJobId) updateJob(activeJobId, { planReadyAcknowledged: true })
 }, [updateJob])

 // Browser Stockfish is not a server job: it cannot literally survive a tab
 // close. This provider is mounted outside Routes in AppRouter, so normal SPA
 // navigation keeps its live ref/state. Restore only once per signed-in user;
 // persisted state is a reload checkpoint, never an authority over live state.
 useEffect(() => {
  if (!user || restoredUserRef.current === user.id) return
  restoredUserRef.current = user.id
  const saved = readPersistedJob()
  if (!saved?.input || saved.input.userId !== user.id) return
  if (jobRef.current.status !== "idle") return

  jobRef.current = saved
  setJob(saved)
  if (ACTIVE_STATUSES.includes(saved.status)) void runAnalysis(saved, true)
 }, [user?.id, runAnalysis])

 return <BackgroundAnalysisContext.Provider value={{ job, startAnalysis, retryAnalysis, acknowledgePlanReady }}>{children}</BackgroundAnalysisContext.Provider>
}

export function useBackgroundAnalysis() {
 const context = useContext(BackgroundAnalysisContext)
 if (!context) throw new Error("useBackgroundAnalysis must be used inside BackgroundAnalysisProvider")
 return context
}
