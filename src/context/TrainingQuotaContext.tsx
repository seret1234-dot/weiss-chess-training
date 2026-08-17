import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useSubscription } from "./SubscriptionContext"
import {
  TRAINING_ITEM_COMPLETED_EVENT,
  type TrainingItemCompletedDetail,
} from "../lib/trainingQuotaEvents"

const GUEST_LIMIT = 10
const FREE_DAILY_LIMIT = 10
const GUEST_STORAGE_KEY = "weiss-training-guest-usage-v1"

type TrainingTier = "guest" | "free" | "premium"

type TrainingQuotaSnapshot = {
  ready: boolean
  tier: TrainingTier
  limit: number | null
  used: number
  remaining: number | null
  resetAt: string | null
  error: string | null
}

type TrainingQuotaContextValue = TrainingQuotaSnapshot & {
  refresh: () => Promise<void>
}

const defaultSnapshot: TrainingQuotaSnapshot = {
  ready: false,
  tier: "guest",
  limit: GUEST_LIMIT,
  used: 0,
  remaining: GUEST_LIMIT,
  resetAt: null,
  error: null,
}

const TrainingQuotaContext = createContext<
  TrainingQuotaContextValue | undefined
>(undefined)

function clampCount(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

function readGuestUsage() {
  if (typeof window === "undefined") return 0

  try {
    return clampCount(window.localStorage.getItem(GUEST_STORAGE_KEY))
  } catch {
    return 0
  }
}

function writeGuestUsage(value: number) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      GUEST_STORAGE_KEY,
      String(Math.max(0, Math.floor(value))),
    )
  } catch {
    // The quota still works for the current page even when storage is blocked.
  }
}

function snapshotFromServer(
  raw: any,
  fallbackTier: TrainingTier = "free",
): TrainingQuotaSnapshot {
  if (raw?.code === "AUTH_REQUIRED") {
    return {
      ready: true,
      tier: "free",
      limit: FREE_DAILY_LIMIT,
      used: FREE_DAILY_LIMIT,
      remaining: 0,
      resetAt: null,
      error: "Your login session expired. Please log in again.",
    }
  }

  const tier: TrainingTier =
    raw?.tier === "premium" ? "premium" : fallbackTier
  const isPremium = tier === "premium"
  const limit = isPremium
    ? null
    : clampCount(raw?.limit ?? FREE_DAILY_LIMIT)
  const used = clampCount(raw?.used)

  return {
    ready: true,
    tier,
    limit,
    used,
    remaining: isPremium
      ? null
      : clampCount(raw?.remaining ?? Math.max((limit ?? 0) - used, 0)),
    resetAt:
      typeof raw?.reset_at === "string"
        ? raw.reset_at
        : typeof raw?.resetAt === "string"
          ? raw.resetAt
          : null,
    error: null,
  }
}

function limitedTrainingRoute(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/"

  if (path === "/stalemate/underpromotion") return true
  if (path === "/board-vision" || path.startsWith("/board-vision/")) {
    return true
  }
  if (path.startsWith("/pattern/")) return true
  if (/^\/tactics\/[^/]+\/[^/]+$/.test(path)) return true
  if (/^\/mates\/m\d+\/[^/]+$/.test(path)) return true
  if (
    path === "/backrank" ||
    /^\/anastasia(?:-m\d+)?$/.test(path)
  ) {
    return true
  }
  if (path.startsWith("/endgame/piece-mates/")) return true
  if (path.startsWith("/endgame-studies/")) return true
  if (path.startsWith("/free-play/")) return true
  if (/^\/master-games\/[^/]+$/.test(path)) return true
  if (
    /^\/openings\/[^/]+$/.test(path) &&
    !path.startsWith("/openings/family/")
  ) {
    return true
  }

  return false
}

export function TrainingQuotaProvider({
  user,
  children,
}: {
  user: User | null
  children: ReactNode
}) {
  const {
    isPremium,
    loading: subscriptionLoading,
  } = useSubscription()
  const [snapshot, setSnapshot] =
    useState<TrainingQuotaSnapshot>(defaultSnapshot)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const userRef = useRef<User | null>(user)
  const premiumRef = useRef(isPremium)

  useEffect(() => {
    userRef.current = user
    premiumRef.current = isPremium
  }, [user, isPremium])

  const refresh = useCallback(async () => {
    if (subscriptionLoading) {
      setSnapshot((current) => ({
        ...current,
        ready: false,
        error: null,
      }))
      return
    }

    if (isPremium) {
      setSnapshot({
        ready: true,
        tier: "premium",
        limit: null,
        used: 0,
        remaining: null,
        resetAt: null,
        error: null,
      })
      return
    }

    if (!user) {
      const used = readGuestUsage()
      setSnapshot({
        ready: true,
        tier: "guest",
        limit: GUEST_LIMIT,
        used,
        remaining: Math.max(GUEST_LIMIT - used, 0),
        resetAt: null,
        error: null,
      })
      return
    }

    setSnapshot((current) => ({
      ...current,
      ready: false,
      tier: "free",
      error: null,
    }))

    const { data, error } = await supabase.rpc(
      "get_training_item_usage_status",
    )

    if (error) {
      console.error("Could not load training allowance", error)
      setSnapshot({
        ready: true,
        tier: "free",
        limit: FREE_DAILY_LIMIT,
        used: FREE_DAILY_LIMIT,
        remaining: 0,
        resetAt: null,
        error:
          "The daily training allowance could not be verified. Please refresh the page.",
      })
      return
    }

    setSnapshot(snapshotFromServer(data, "free"))
  }, [isPremium, subscriptionLoading, user?.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    function onCompleted(event: Event) {
      const detail = (event as CustomEvent<TrainingItemCompletedDetail>)
        .detail

      if (!detail?.kind || !detail?.eventId) return

      queueRef.current = queueRef.current.then(async () => {
        if (premiumRef.current) return

        const currentUser = userRef.current

        if (!currentUser) {
          const usedBefore = readGuestUsage()
          const usedAfter = Math.min(GUEST_LIMIT, usedBefore + 1)
          writeGuestUsage(usedAfter)
          setSnapshot({
            ready: true,
            tier: "guest",
            limit: GUEST_LIMIT,
            used: usedAfter,
            remaining: Math.max(GUEST_LIMIT - usedAfter, 0),
            resetAt: null,
            error: null,
          })
          return
        }

        const { data, error } = await supabase.rpc(
          "reserve_training_item_usage",
          {
            p_kind: detail.kind,
            p_item_key: detail.itemKey,
            p_event_id: detail.eventId,
          },
        )

        if (error) {
          console.error("Could not record training allowance", error)
          setSnapshot((current) => ({
            ...current,
            ready: true,
            error:
              "The daily training allowance could not be verified. Please refresh the page.",
          }))
          return
        }

        setSnapshot(snapshotFromServer(data, "free"))
      })
    }

    window.addEventListener(
      TRAINING_ITEM_COMPLETED_EVENT,
      onCompleted,
    )

    return () => {
      window.removeEventListener(
        TRAINING_ITEM_COMPLETED_EVENT,
        onCompleted,
      )
    }
  }, [])

  const value = useMemo(
    () => ({
      ...snapshot,
      refresh,
    }),
    [snapshot, refresh],
  )

  return (
    <TrainingQuotaContext.Provider value={value}>
      {children}
    </TrainingQuotaContext.Provider>
  )
}

export function useTrainingQuota() {
  const context = useContext(TrainingQuotaContext)

  if (!context) {
    throw new Error(
      "useTrainingQuota must be used inside TrainingQuotaProvider",
    )
  }

  return context
}

function formatReset(resetAt: string | null) {
  if (!resetAt) return "tomorrow"

  const date = new Date(resetAt)
  if (Number.isNaN(date.getTime())) return "tomorrow"

  return date.toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function AccessPage({
  mode,
}: {
  mode: "quota" | "premium" | "error" | "loading"
}) {
  const navigate = useNavigate()
  const quota = useTrainingQuota()

  if (mode === "loading") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>Checking training access...</div>
      </div>
    )
  }

  const isGuest = quota.tier === "guest"
  const title =
    mode === "premium"
      ? "Auto Study is a Premium feature"
      : mode === "error"
        ? "Training access could not be verified"
        : isGuest
          ? "You completed 10 free training items"
          : "You completed today’s 10 free training items"

  const body =
    mode === "premium"
      ? "Premium unlocks automatic study planning and unlimited puzzle, opening, endgame, and master-game training."
      : mode === "error"
        ? quota.error || "Please refresh and try again."
        : isGuest
          ? "Create a free account for 10 training items each day, or choose Premium for unlimited training."
          : `Your free allowance resets ${formatReset(quota.resetAt)}. Premium training is unlimited.`

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 30, fontWeight: 900 }}>{title}</div>
        <div
          style={{
            marginTop: 14,
            color: "#b8c8bd",
            lineHeight: 1.55,
            fontSize: 16,
          }}
        >
          {body}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 22,
          }}
        >
          {isGuest && mode !== "premium" ? (
            <button style={primaryButton} onClick={() => navigate("/auth")}>
              Create free account
            </button>
          ) : null}

          {mode === "error" ? (
            <button style={primaryButton} onClick={() => navigate("/auth")}>
              Log in again
            </button>
          ) : null}

          <button style={primaryButton} onClick={() => navigate("/pricing")}>
            View Premium
          </button>

          {mode === "error" ? (
            <button
              style={secondaryButton}
              onClick={() => void quota.refresh()}
            >
              Try again
            </button>
          ) : null}

          <button style={secondaryButton} onClick={() => navigate("/")}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}

export function TrainingQuotaRouteGate({
  children,
}: {
  children: ReactNode
}) {
  const location = useLocation()
  const quota = useTrainingQuota()
  const isLimited = limitedTrainingRoute(location.pathname)
  if (!isLimited) return <>{children}</>
  if (!quota.ready) return <AccessPage mode="loading" />
  if (quota.error) return <AccessPage mode="error" />
  if (
    isLimited &&
    quota.tier !== "premium" &&
    (quota.remaining ?? 0) <= 0
  ) {
    return <AccessPage mode="quota" />
  }

  return <>{children}</>
}

const pageStyle = {
  minHeight: "calc(100vh - 20px)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background:
    "radial-gradient(circle at top, rgba(59,130,92,0.18), transparent 45%), #06140f",
  color: "#f4f2e8",
} as const

const cardStyle = {
  width: "min(620px, 100%)",
  padding: "30px 32px",
  borderRadius: 20,
  background: "rgba(9, 33, 24, 0.97)",
  border: "1px solid rgba(170, 210, 170, 0.22)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
} as const

const primaryButton = {
  border: 0,
  borderRadius: 11,
  padding: "12px 17px",
  background: "#a9d86e",
  color: "#10200f",
  fontWeight: 900,
  cursor: "pointer",
} as const

const secondaryButton = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 11,
  padding: "12px 17px",
  background: "rgba(255,255,255,0.06)",
  color: "#f4f2e8",
  fontWeight: 800,
  cursor: "pointer",
} as const
