import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

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
  await vite.transformRequest("/src/components/GlobalFloatingPlay.tsx")
  const theme = await vite.ssrLoadModule("/src/theme/ThemeContext.tsx")
  const source = await readFile("src/components/GlobalFloatingPlay.tsx", "utf8")

  assert.match(source, /FLOATING_MENU_CLOSE_DELAY_MS = 220/, "menu close grace period is 220ms")
  assert.match(source, /ref=\{desktopMenuRef\}/, "desktop button and panel share one menu region")
  assert.match(source, /onPointerEnter[\s\S]*?expandDesktopMenu\(\)/, "entering the menu cancels a pending close")
  assert.match(source, /onPointerLeave[\s\S]*?scheduleDesktopMenuCollapse\(\)/, "leaving the complete region schedules a close")
  assert.match(source, /desktopMenuRef\.current\?\.contains\(event\.target as Node\)/, "outside clicks are distinguished from menu clicks")
  assert.match(source, /document\.addEventListener\("pointerdown", closeOnOutsidePointerDown\)/, "outside pointer click closes the menu")
  assert.doesNotMatch(
    source,
    /aria-label="Quick actions"\s*onClick=/,
    "the panel no longer closes on every descendant click",
  )
  assert.match(source, /data-floating-menu-preference/, "theme control is explicitly retained as a preference action")
  assert.match(source, /onClick=\{\(\) => closeDesktopMenuThen\(goHome\)\}/, "navigation retains close-on-select behavior")
  assert.match(source, /global-mobile-nav__theme[\s\S]*?<ThemeSelector compact/, "mobile theme tap uses the same persistent preference control")

  storage.set(theme.SITE_THEME_STORAGE_KEY, "merida")
  assert.equal(theme.readInitialTheme(), "merida", "Merida selection persists")
  storage.set(theme.SITE_THEME_STORAGE_KEY, "classic")
  assert.equal(theme.readInitialTheme(), "classic", "Classic can be selected immediately after Merida")
  assert.equal(typeof theme.resolveThemePieces("merida").wK, "function", "Merida renderer remains available")
  assert.equal(typeof theme.resolveThemePieces("classic").wK, "function", "Classic renderer remains available")

  console.log("Floating menu theme interaction checks passed: preference stays open, hover grace, outside close, navigation close, and mobile-safe theme persistence.")
} finally {
  await vite.close()
  globalThis.window = originalWindow
}
