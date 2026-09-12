import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import ts from "typescript"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

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

try {
  // This pure selection/renderer test needs no dev server or repository scan.
  const source = await readFile("src/theme/ThemeContext.tsx", "utf8")
  const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href
  const compiled = ts.transpileModule(source.replace('from "react"', `from ${JSON.stringify(reactUrl)}`), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText
  const theme = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)
  const selectorSource = await readFile("src/theme/ThemeSelector.tsx", "utf8")
  const boardSource = await readFile("src/theme/ThemedChessboard.tsx", "utf8")
  const themePieceSource = await readFile("src/theme/ThemePiece.tsx", "utf8")
  const accountSource = await readFile("src/AccountPage.tsx", "utf8")
  const patternTacticSource = await readFile("src/trainers/patternTactic/PatternTacticTrainer.tsx", "utf8")
  const patternMateSource = await readFile("src/trainers/patternMate/PatternMateTrainer.tsx", "utf8")
  const masterTacticSource = await readFile("src/masterTactics/MasterTacticTrainer.tsx", "utf8")
  const masterMateSource = await readFile("src/masterMates/MasterMateTrainer.tsx", "utf8")
  const masterGamesSource = await readFile("src/MasterGamesPage.tsx", "utf8")
  const routerSource = await readFile("src/AppRouter.tsx", "utf8")
  const notices = await readFile("THIRD_PARTY_NOTICES.md", "utf8")

  assert.deepEqual(theme.siteThemeOrder, expectedThemes)
  assert.equal(theme.DEFAULT_SITE_THEME, "merida", "Merida is the fallback for fresh browsers")
  storage.clear()
  assert.equal(theme.readInitialTheme(), "merida", "no saved preference uses the site default")
  storage.set(theme.SITE_THEME_STORAGE_KEY, "classic")
  assert.equal(theme.readInitialTheme(), "classic", "an explicit saved Classic preference overrides the default")
  assert.equal(theme.siteThemes.classic.name, "Classic")
  assert.equal(theme.siteThemes.merida.name, "Default (Merida)")
  assert.match(theme.siteThemes.merida.description, /tournament-style 2D/i)
  assert.match(selectorSource, /siteThemeOrder/)
  assert.doesNotMatch(selectorSource, /const themeOrder/)
  assert.match(boardSource, /customPieces=\{pieces\}/)
  assert.match(themePieceSource, /const renderer = pieces\[code\]/)
  assert.match(accountSource, /<ThemeSelector\s*\/\>/, "Account Settings keeps the full theme selector")
  assert.match(selectorSource, /onClick=\{\(\) => setTheme\(themeId\)\}/, "Settings can still select any theme")
  assert.match(patternTacticSource, /<ThemedChessboard/, "regular Tactics uses the shared theme")
  assert.match(patternMateSource, /<ThemedChessboard/, "regular Mates uses the shared theme")
  assert.match(masterTacticSource, /<PatternTacticTrainer/, "Master Tactics reuses the themed regular trainer")
  assert.match(masterMateSource, /<PatternMateTrainer/, "Master Mates reuses the themed regular trainer")
  assert.match(masterGamesSource, /<ThemedChessboard/, "Master Games uses the shared theme")
  assert.doesNotMatch(routerSource, /pieces-preview/)
  assert.match(notices, /Armando Hernandez Marroquin/)
  assert.match(notices, /GPLv2\+/)
  assert.match(notices, /Lichess/)

  for (const code of requiredCodes) {
    await access(`public/pieces/react-chessboard-default/${code.toLowerCase()}.svg`)
    for (const selection of [theme.DEFAULT_SITE_THEME, "merida", "invalid-theme"]) {
      const piece = theme.resolveThemePieces(selection)[code]({ squareWidth: 72 }).props.children
      assert.equal(piece.props.src, `/pieces/merida/${code.toLowerCase()}.svg`, `${selection}: ${code} uses Merida, never package pieces`)
    }
    const classic = theme.resolveThemePieces("classic")[code]({ squareWidth: 72 }).props.children
    assert.equal(classic.props.src, `/pieces/react-chessboard-default/${code.toLowerCase()}.svg`, "Classic remains selectable")
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
  globalThis.window = undefined
  assert.equal(theme.readInitialTheme(), "merida", "server initialization uses the same default")
  globalThis.window = { localStorage: { getItem() { throw new Error("storage blocked") } } }
  assert.equal(theme.readInitialTheme(), "merida", "blocked storage still uses Merida")

  console.log("Merida piece set checks passed: option, persistence, assets, renderers, board mapping, and preview cleanup.")
} finally {
  globalThis.window = originalWindow
}
