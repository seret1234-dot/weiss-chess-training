import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { useBoardUiContext } from "../context/BoardUiContext"
import { supabase } from "../lib/supabase"
import ThemeSelector from "../theme/ThemeSelector"
import "./GlobalFloatingPlay.css"

function sideToMoveFromFen(fen?: string | null): "white" | "black" | undefined {
  if (!fen) return undefined
  return fen.split(" ")[1] === "b" ? "black" : "white"
}

function buildPlayUrl(params: {
  fen?: string | null
  suggestedColor?: "white" | "black"
  source?: string
}) {
  const search = new URLSearchParams()

  if (params.fen) search.set("fen", params.fen)
  if (params.suggestedColor) search.set("color", params.suggestedColor)
  search.set("mode", "play")

  if (params.source) search.set("source", params.source)

  const qs = search.toString()
  return qs ? `/play-vs-computer?${qs}` : "/play-vs-computer"
}

function buildAnalyzeUrl(fen?: string | null) {
  if (!fen) return "/analyze"
  return `/analyze/board?fen=${encodeURIComponent(fen)}`
}

export default function GlobalFloatingPlay({
  isLoggedIn,
  onSignedOut,
}: {
  isLoggedIn: boolean
  onSignedOut: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { boardState } = useBoardUiContext()
  const [desktopMenuExpanded, setDesktopMenuExpanded] = useState(false)
  const collapseTimerRef = useRef<number | null>(null)
  const pointerInsideMenuRef = useRef(false)
  const keyboardFocusWithinMenuRef = useRef(false)

  const clearMenuCollapse = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [])

  const expandDesktopMenu = useCallback(() => {
    clearMenuCollapse()
    setDesktopMenuExpanded(true)
  }, [clearMenuCollapse])

  const collapseDesktopMenu = useCallback(() => {
    clearMenuCollapse()
    setDesktopMenuExpanded(false)
  }, [clearMenuCollapse])

  const scheduleDesktopMenuCollapse = useCallback(() => {
    clearMenuCollapse()
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null
      if (keyboardFocusWithinMenuRef.current) {
        return
      }
      collapseDesktopMenu()
    }, 320)
  }, [clearMenuCollapse, collapseDesktopMenu])

  useEffect(() => () => clearMenuCollapse(), [clearMenuCollapse])

  const fenFromUrl = new URLSearchParams(location.search).get("fen")

  const currentFen =
    boardState.isAvailable && boardState.fen
      ? boardState.fen
      : fenFromUrl

  const hasBoard = !!currentFen

  const suggestedColor =
    boardState.isAvailable && boardState.suggestedColor
      ? boardState.suggestedColor
      : sideToMoveFromFen(currentFen)

  const goHome = useCallback(() => {
    window.location.href = "/"
  }, [])

  const goFunChess = useCallback(() => {
    window.location.href = "/museum"
  }, [])

  const goAnalyze = useCallback(() => {
    window.location.href = buildAnalyzeUrl(currentFen)
  }, [currentFen])

  const goPlayComputer = useCallback(() => {
    const url = buildPlayUrl({
      fen: currentFen,
      suggestedColor,
      source: hasBoard ? "current-board" : "global",
    })

    window.location.href = url
  }, [currentFen, suggestedColor, hasBoard])

  const goAccount = useCallback(() => {
    window.location.href = "/account"
  }, [])

  const goSignUp = useCallback(() => {
    navigate("/auth?mode=signup")
  }, [navigate])

  const flipBoard = useCallback(() => {
    boardState.onFlip?.()
  }, [boardState.onFlip])

  const handleAuth = useCallback(async () => {
    if (!isLoggedIn) {
      navigate("/auth")
      return
    }

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })

      if (error) {
        console.error("Logout failed", error)
        return
      }

      onSignedOut()
      navigate("/auth", { replace: true })
    } catch (err) {
      console.error("Logout failed", err)
    }
  }, [isLoggedIn, navigate, onSignedOut])

  return createPortal(
    <>
      <div className="global-floating-play-desktop">
        <div
          className={`global-floating-play-desktop__menu${desktopMenuExpanded ? " global-floating-play-desktop__menu--expanded" : ""}`}
          onPointerEnter={() => {
            pointerInsideMenuRef.current = true
            keyboardFocusWithinMenuRef.current = false
            expandDesktopMenu()
          }}
          onPointerDownCapture={() => {
            keyboardFocusWithinMenuRef.current = false
          }}
          onPointerLeave={() => {
            pointerInsideMenuRef.current = false
            scheduleDesktopMenuCollapse()
          }}
          onFocusCapture={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches(":focus-visible")
            ) {
              keyboardFocusWithinMenuRef.current = true
              expandDesktopMenu()
            }
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              keyboardFocusWithinMenuRef.current = false
            }
            if (!pointerInsideMenuRef.current) {
              scheduleDesktopMenuCollapse()
            }
          }}
          onKeyDown={(event) => {
            keyboardFocusWithinMenuRef.current = true
            if (event.key === "Escape") {
              if (event.target instanceof HTMLElement) {
                event.target.blur()
              }
              keyboardFocusWithinMenuRef.current = false
              pointerInsideMenuRef.current = false
              collapseDesktopMenu()
            }
          }}
        >
          {desktopMenuExpanded && (
            <div
            id="global-floating-play-desktop-panel"
            className="global-floating-play-desktop__panel"
            aria-label="Quick actions"
            onClick={(event) => {
              if (event.target instanceof HTMLElement) {
                event.target.closest("button")?.blur()
              }
              if (!keyboardFocusWithinMenuRef.current) {
                pointerInsideMenuRef.current = false
                collapseDesktopMenu()
              }
            }}
          >
            <button
              type="button"
              onClick={goHome}
              style={btnStyle}
            >
              Home
            </button>

            <button
              type="button"
              onClick={goFunChess}
              style={btnStyle}
            >
              Fun
            </button>

            <button
              type="button"
              onClick={goAnalyze}
              style={btnStyle}
            >
              Analyze
            </button>

            <button
              type="button"
              onClick={goPlayComputer}
              style={{
                ...btnStyle,
                background:
                  "linear-gradient(180deg,var(--theme-accent-strong),var(--theme-accent))",
                color: "var(--theme-accent-text)",
              }}
            >
              Play
            </button>

            {boardState.isAvailable && (
              <button
                type="button"
                onClick={flipBoard}
                disabled={!boardState.canFlip}
                style={{
                  ...btnStyle,
                  opacity: boardState.canFlip ? 1 : 0.45,
                  cursor: boardState.canFlip ? "pointer" : "not-allowed",
                }}
              >
                Flip
              </button>
            )}

            <div className="global-floating-play-desktop__theme">
              <ThemeSelector compact />
            </div>

            {isLoggedIn && (
              <button
                type="button"
                onClick={goAccount}
                style={btnStyle}
              >
                Account
              </button>
            )}

            {!isLoggedIn && (
              <button
                type="button"
                onClick={goSignUp}
                style={{
                  ...btnStyle,
                  background:
                    "linear-gradient(180deg,var(--theme-accent-strong),var(--theme-accent))",
                  color: "var(--theme-accent-text)",
                }}
              >
                Create Free Account
              </button>
            )}

            <button
              type="button"
              onClick={handleAuth}
              style={{
                ...btnStyle,
                background: isLoggedIn
                  ? "var(--theme-danger)"
                  : "var(--theme-button-bg)",
              }}
            >
              {isLoggedIn ? "Logout" : "Log In"}
            </button>
            </div>
          )}
          <button
            type="button"
            className="global-floating-play-desktop__tab"
            aria-controls="global-floating-play-desktop-panel"
            aria-expanded={desktopMenuExpanded}
            onClick={() => {
              clearMenuCollapse()
              setDesktopMenuExpanded((expanded) => !expanded)
            }}
          >
            Menu
          </button>
        </div>
      </div>
      <nav
        className="global-mobile-nav"
        aria-label="Mobile navigation"
      >
        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={goHome}
        >
          Home
        </button>

        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={goFunChess}
        >
          Fun
        </button>

        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={goAnalyze}
        >
          Analyze
        </button>

        <button
          type="button"
          className="global-mobile-nav__button global-mobile-nav__button--primary"
          onClick={goPlayComputer}
        >
          Play
        </button>

        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={flipBoard}
          disabled={!boardState.isAvailable || !boardState.canFlip}
        >
          Flip
        </button>

        <div className="global-mobile-nav__theme">
          <ThemeSelector compact />
        </div>

        {isLoggedIn && (
          <button
            type="button"
            className="global-mobile-nav__button"
            onClick={goAccount}
          >
            Account
          </button>
        )}

        {!isLoggedIn && (
          <button
            type="button"
            className="global-mobile-nav__button global-mobile-nav__button--signup"
            onClick={goSignUp}
          >
            Create Free Account
          </button>
        )}

        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={handleAuth}
        >
          {isLoggedIn ? "Logout" : "Log In"}
        </button>
      </nav>
    </>,
    document.body,
  )
}

const btnStyle: React.CSSProperties = {
  borderRadius: 14,
  width: "100%",
  minHeight: 40,
  padding: "9px 6px",
  color: "var(--theme-text)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  background: "var(--theme-button-bg)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
  border: "1px solid var(--theme-border)",
}
