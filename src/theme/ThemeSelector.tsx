import React from "react"
import { siteThemes, useSiteTheme, type SiteTheme } from "./ThemeContext"

const themeOrder: SiteTheme[] = ["nobleStandard", "weiss3d", "classic", "qwertyxp2000"]

export default function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useSiteTheme()

  if (compact) {
    return (
      <button
        type="button"
        className="theme-quick-toggle"
        onClick={() => setTheme(themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length])}
        title="Change the chess piece style"
      >
        <span aria-hidden="true">♜</span>
        <span>Change Piece Style: {siteThemes[theme].name}</span>
      </button>
    )
  }

  return (
    <section className="theme-selector" aria-labelledby="theme-selector-title">
      <div className="theme-selector-heading">
        <div>
          <div className="theme-selector-kicker">Appearance</div>
          <h2 id="theme-selector-title">Site design</h2>
        </div>
        <div className="theme-selector-current">Current: {siteThemes[theme].name}</div>
      </div>

      <div className="theme-option-grid">
        {themeOrder.map((themeId) => {
          const option = siteThemes[themeId]
          const selected = theme === themeId

          return (
            <button
              key={themeId}
              type="button"
              className={`theme-option ${selected ? "selected" : ""}`}
              onClick={() => setTheme(themeId)}
              aria-pressed={selected}
            >
              <span className={`theme-preview theme-preview-${themeId}`} aria-hidden="true">
                <span className="theme-preview-board" />
                <span className="theme-preview-piece">♞</span>
              </span>
              <span className="theme-option-copy">
                <strong>{option.name}</strong>
                <span>{option.description}</span>
              </span>
              <span className="theme-option-check" aria-hidden="true">
                {selected ? "✓" : ""}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
