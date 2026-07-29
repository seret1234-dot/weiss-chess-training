import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

export type SiteTheme = "nobleStandard" | "weiss3d" | "classic" | "qwertyxp2000"

// Use the Classic SVG set for users without a saved preference. A saved user
// choice in localStorage still takes priority.
export const DEFAULT_SITE_THEME: SiteTheme = "classic"

type PieceRendererProps = {
  squareWidth: number
}

type PieceRenderer = (props: PieceRendererProps) => JSX.Element
export type ThemePieces = Record<string, PieceRenderer>

export type SiteThemeConfig = {
  id: SiteTheme
  name: string
  description: string
  board: {
    light: string
    dark: string
  }
}

type ThemeContextValue = {
  theme: SiteTheme
  setTheme: (theme: SiteTheme) => void
  toggleTheme: () => void
  config: SiteThemeConfig
  pieces: ThemePieces
}

const STORAGE_KEY = "weiss-chess-site-theme-v2"
const themeOrder: SiteTheme[] = ["nobleStandard", "weiss3d", "classic", "qwertyxp2000"]

export const siteThemes: Record<SiteTheme, SiteThemeConfig> = {
  nobleStandard: {
    id: "nobleStandard",
    name: "Noble Standard",
    description: "Your new default: centered premium 2D pieces with strong soft shadows.",
    board: {
      light: "#e6d7b0",
      dark: "#6f7b4e",
    },
  },
  weiss3d: {
    id: "weiss3d",
    name: "Weiss 3D",
    description: "Glossy ivory and black pieces with the deep-green Weiss design.",
    board: {
      light: "#d7cfba",
      dark: "#62705b",
    },
  },
  classic: {
    id: "classic",
    name: "Classic",
    description: "Refined original board with the familiar flat tournament pieces.",
    board: {
      light: "#eeeccf",
      dark: "#7a995c",
    },
  },
  qwertyxp2000: {
    id: "qwertyxp2000",
    name: "Qwertyxp2000 Fun",
    description: "Playful smiling pieces for a lighter fun mode.",
    board: {
      light: "#f0e6c7",
      dark: "#8aa06a",
    },
  },
}

const pieceCodes = [
  "wP",
  "wN",
  "wB",
  "wR",
  "wQ",
  "wK",
  "bP",
  "bN",
  "bB",
  "bR",
  "bQ",
  "bK",
] as const

type PieceCode = (typeof pieceCodes)[number]

function basePieceScale(code: PieceCode): number {
  const kind = code[1]
  if (kind === "P") return 0.8
  if (kind === "R" || kind === "N") return 0.88
  return 0.98
}

function noblePieceScale(code: PieceCode): number {
  const kind = code[1]
  if (kind === "P") return 0.84
  if (kind === "R") return 0.9
  if (kind === "N") return 0.91
  return 1.0
}

function qwertyPieceScale(code: PieceCode): number {
  const kind = code[1]
  if (kind === "P") return 0.82
  if (kind === "R" || kind === "N") return 0.9
  return 0.96
}

function weiss3dUrl(code: PieceCode): string {
  return `/pieces/weiss-3d/${code.toLowerCase()}.png`
}

function classicUrl(code: PieceCode): string {
  return `/pieces/react-chessboard-default/${code.toLowerCase()}.svg`
}

function nobleUrl(code: PieceCode): string {
  return `/pieces/noble-standard/${code.toLowerCase()}.png`
}

function qwertyUrl(code: PieceCode): string {
  return `/pieces/qwertyxp2000/${code.toLowerCase()}.png`
}

function createImagePiece(
  code: PieceCode,
  src: string,
  scale: number,
  filter: string,
  offsetY = 0,
): PieceRenderer {
  return function ImagePiece({ squareWidth }: PieceRendererProps) {
    const renderedSize = Math.max(1, squareWidth * scale)
    const translateY = squareWidth * offsetY

    return (
      <span
        aria-hidden="true"
        style={{
          width: squareWidth,
          height: squareWidth,
          display: "grid",
          placeItems: "center",
          overflow: "visible",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          width={renderedSize}
          height={renderedSize}
          style={{
            display: "block",
            width: renderedSize,
            height: renderedSize,
            objectFit: "contain",
            overflow: "visible",
            pointerEvents: "none",
            userSelect: "none",
            filter,
            transform: translateY === 0 ? undefined : `translateY(${translateY}px)`,
          }}
        />
      </span>
    )
  }
}

function createWeiss3dPiece(code: PieceCode): PieceRenderer {
  return createImagePiece(
    code,
    weiss3dUrl(code),
    basePieceScale(code),
    "drop-shadow(0 6px 4px rgba(72,72,72,0.56)) drop-shadow(0 14px 14px rgba(48,48,48,0.42)) drop-shadow(0 2px 1px rgba(88,88,88,0.22))",
  )
}

function createClassicPiece(code: PieceCode): PieceRenderer {
  return createImagePiece(
    code,
    classicUrl(code),
    1,
    "drop-shadow(0 2px 1px rgba(0,0,0,0.30)) drop-shadow(0 5px 5px rgba(0,0,0,0.16))",
  )
}

function createNoblePiece(code: PieceCode): PieceRenderer {
  const kingLift = code[1] === "K" ? -0.035 : 0

  return createImagePiece(
    code,
    nobleUrl(code),
    noblePieceScale(code),
    "drop-shadow(0 4px 4px rgba(0,0,0,0.28)) drop-shadow(10px 18px 16px rgba(0,0,0,0.68)) drop-shadow(2px 0 2px rgba(0,0,0,0.18))",
    kingLift,
  )
}

function createQwertyPiece(code: PieceCode): PieceRenderer {
  return createImagePiece(
    code,
    qwertyUrl(code),
    qwertyPieceScale(code),
    "drop-shadow(0 2px 1px rgba(0,0,0,0.20)) drop-shadow(0 5px 7px rgba(0,0,0,0.18))",
  )
}

function buildPieces(factory: (code: PieceCode) => PieceRenderer): ThemePieces {
  return Object.fromEntries(pieceCodes.map((code) => [code, factory(code)]))
}

const noblePieces = buildPieces(createNoblePiece)
const weiss3dPieces = buildPieces(createWeiss3dPiece)
const classicPieces = buildPieces(createClassicPiece)
const qwertyPieces = buildPieces(createQwertyPiece)

function readInitialTheme(): SiteTheme {
  if (typeof window === "undefined") return DEFAULT_SITE_THEME

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as SiteTheme | null
    return saved && themeOrder.includes(saved) ? saved : DEFAULT_SITE_THEME
  } catch {
    return DEFAULT_SITE_THEME
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<SiteTheme>(readInitialTheme)

  const setTheme = useCallback((nextTheme: SiteTheme) => {
    setThemeState(nextTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length])
  }, [])

  useEffect(() => {
    document.documentElement.dataset.siteTheme = "classic"

    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // The selected theme still works for this session when storage is blocked.
    }
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => {
    let pieces = noblePieces
    if (theme === "weiss3d") pieces = weiss3dPieces
    else if (theme === "classic") pieces = classicPieces
    else if (theme === "qwertyxp2000") pieces = qwertyPieces

    return {
      theme,
      setTheme,
      toggleTheme,
      config: {
        ...siteThemes[theme],
        board: siteThemes.classic.board,
      },
      pieces,
    }
  }, [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useSiteTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useSiteTheme must be used inside ThemeProvider")
  }
  return context
}
