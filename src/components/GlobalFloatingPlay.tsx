import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation } from "react-router-dom"
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
}: {
  isLoggedIn: boolean
}) {
  const location = useLocation()
  const { boardState } = useBoardUiContext()
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false)
  const desktopMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setIsDesktopMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!isDesktopMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (
        target instanceof Node &&
        !desktopMenuRef.current?.contains(target)
      ) {
        setIsDesktopMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDesktopMenuOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isDesktopMenuOpen])

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

  const flipBoard = useCallback(() => {
    boardState.onFlip?.()
  }, [boardState.onFlip])

  const handleAuth = useCallback(async () => {
    if (!isLoggedIn) {
      window.location.href = "/auth"
      return
    }

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })

      if (error) {
        console.error("Logout failed", error)
        return
      }

      window.location.replace("/auth")
    } catch (err) {
      console.error("Logout failed", err)
    }
  }, [isLoggedIn])

  const runDesktopAction = useCallback(
    (action: () => void | Promise<void>) => {
      setIsDesktopMenuOpen(false)
      void action()
    },
    [],
  )

  return createPortal(
    <>
      <div
        ref={desktopMenuRef}
        className={`global-floating-play-desktop${
          isDesktopMenuOpen ? " global-floating-play-desktop--open" : ""
        }`}
      >
        {isDesktopMenuOpen && (
          <div
            id="global-desktop-quick-menu"
            className="global-floating-play-desktop__panel"
            aria-label="Quick actions"
          >
            <button
              type="button"
              onClick={() => runDesktopAction(goHome)}
              style={btnStyle}
            >
              Home
            </button>

            <button
              type="button"
              onClick={() => runDesktopAction(goFunChess)}
              style={btnStyle}
            >
              Fun Chess
            </button>

            <button
              type="button"
              onClick={() => runDesktopAction(goAnalyze)}
              style={btnStyle}
            >
              {hasBoard ? "Analyze Position" : "Analyze"}
            </button>

            <button
              type="button"
              onClick={() => runDesktopAction(goPlayComputer)}
              style={{
                ...btnStyle,
                background:
                  "linear-gradient(180deg,var(--theme-accent-strong),var(--theme-accent))",
                color: "var(--theme-accent-text)",
              }}
            >
              {hasBoard ? "Play Position" : "Play Computer"}
            </button>

            {boardState.isAvailable && (
              <button
                type="button"
                onClick={() => runDesktopAction(flipBoard)}
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

            <div
              className="global-floating-play-desktop__theme"
              onClick={() => setIsDesktopMenuOpen(false)}
            >
              <ThemeSelector compact />
            </div>

            <button
              type="button"
              onClick={() => runDesktopAction(goAccount)}
              style={btnStyle}
            >
              Account
            </button>

            <button
              type="button"
              onClick={() => runDesktopAction(handleAuth)}
              style={{
                ...btnStyle,
                background: isLoggedIn
                  ? "var(--theme-danger)"
                  : "var(--theme-button-bg)",
              }}
            >
              {isLoggedIn ? "Logout" : "Login"}
            </button>
          </div>
        )}

        <button
          type="button"
          className="global-floating-play-desktop__toggle"
          aria-expanded={isDesktopMenuOpen}
          aria-controls="global-desktop-quick-menu"
          onClick={() => setIsDesktopMenuOpen((open) => !open)}
        >
          Menu
        </button>
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

        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={goAccount}
        >
          Account
        </button>

        <button
          type="button"
          className="global-mobile-nav__button"
          onClick={handleAuth}
        >
          {isLoggedIn ? "Logout" : "Login"}
        </button>
      </nav>
    </>,
    document.body,
  )
}

const btnStyle: React.CSSProperties = {
  borderRadius: 14,
  padding: "12px 16px",
  color: "var(--theme-text)",
  fontWeight: 800,
  cursor: "pointer",
  background: "var(--theme-button-bg)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
  border: "1px solid var(--theme-border)",
}
