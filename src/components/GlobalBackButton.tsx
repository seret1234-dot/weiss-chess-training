import { useEffect } from "react"
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom"

const HISTORY_KEY = "weiss-chess-route-history"

function readRouteHistory(): string[] {
  try {
    const stored = sessionStorage.getItem(HISTORY_KEY)
    const parsed = stored ? JSON.parse(stored) : []

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function saveRouteHistory(history: string[]) {
  sessionStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(history.slice(-50)),
  )
}

export default function GlobalBackButton() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()

  const currentPath =
    location.pathname + location.search + location.hash

  useEffect(() => {
    let history = readRouteHistory()
    const lastPath = history[history.length - 1]

    if (lastPath === currentPath) return

    if (navigationType === "REPLACE" && history.length > 0) {
      history[history.length - 1] = currentPath
      saveRouteHistory(history)
      return
    }

    const existingIndex = history.lastIndexOf(currentPath)

    if (existingIndex >= 0) {
      history = history.slice(0, existingIndex + 1)
    } else {
      history.push(currentPath)
    }

    saveRouteHistory(history)
  }, [currentPath, navigationType])

  if (location.pathname === "/") return null

  function goBack() {
    const history = readRouteHistory()

    if (history[history.length - 1] === currentPath) {
      history.pop()
    }

    const previousPath = history[history.length - 1] || "/"

    saveRouteHistory(history)
    navigate(previousPath, { replace: true })
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back"
      title="Go back"
      style={{
        position: "fixed",
        top: 14,
        left: 14,
        zIndex: 100000,
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 999,
        padding: "8px 14px",
        background: "rgba(28,25,23,0.94)",
        color: "#ffffff",
        fontWeight: 800,
        fontSize: 13,
        cursor: "pointer",
        boxShadow: "0 5px 16px rgba(0,0,0,0.28)",
        backdropFilter: "blur(8px)",
      }}
    >
      {"\u2190"} Back
    </button>
  )
}
