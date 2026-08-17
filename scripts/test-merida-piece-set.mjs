import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { createServer } from "vite"

const requiredCodes = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"]
const expectedThemes = ["nobleStandard", "weiss3d", "classic", "merida", "qwertyxp2000"]
const originalWindow = globalThis.window
const storage = new Map()

globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
  const theme = await vite.ssrLoadModule("/src/theme/ThemeContext.tsx")
  const selectorSource = await readFile("src/theme/ThemeSelector.tsx", "utf8")
  const boardSource = await readFile("src/theme/ThemedChessboard.tsx", "utf8")
  const themePieceSource = await readFile("src/theme/ThemePiece.tsx", "utf8")
  const routerSource = await readFile("src/AppRouter.tsx", "utf8")
  const notices = await readFile("THIRD_PARTY_NOTICES.md", "utf8")

  assert.deepEqual(theme.siteThemeOrder, expectedThemes)
  assert.equal(theme.siteThemes.merida.name, "Merida")
  assert.match(theme.siteThemes.merida.description, /tournament-style 2D/i)
  assert.match(selectorSource, /siteThemeOrder/)
  assert.doesNotMatch(selectorSource, /const themeOrder/)
  assert.match(boardSource, /customPieces=\{pieces\}/)
  assert.match(themePieceSource, /const renderer = pieces\[code\]/)
  assert.doesNotMatch(routerSource, /pieces-preview/)
  assert.match(notices, /Armando Hernandez Marroquin/)
  assert.match(notices, /GPLv2\+/)
  assert.match(notices, /Lichess/)

  for (const code of requiredCodes) {
    await access(`public/pieces/merida/${code.toLowerCase()}.svg`)
    const renderer = theme.resolveThemePieces("merida")[code]
    assert.equal(typeof renderer, "function", `${code} has a Merida renderer`)
    const rendered = renderer({ squareWidth: 72 })
    const image = rendered.props.children
    assert.equal(image.props.src, `/pieces/merida/${code.toLowerCase()}.svg`)
    assert.equal(image.props.width, 72)
    assert.equal(image.props.height, 72)
  }

  for (const savedTheme of expectedThemes) {
    storage.set(theme.SITE_THEME_STORAGE_KEY, savedTheme)
    assert.equal(theme.readInitialTheme(), savedTheme)
  }
  storage.set(theme.SITE_THEME_STORAGE_KEY, "obsolete-theme")
  assert.equal(theme.readInitialTheme(), theme.DEFAULT_SITE_THEME)

  console.log("Merida piece set checks passed: option, persistence, assets, renderers, board mapping, and preview cleanup.")
} finally {
  await vite.close()
  globalThis.window = originalWindow
}
