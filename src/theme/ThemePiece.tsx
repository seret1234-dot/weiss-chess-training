import React from "react"
import { useSiteTheme } from "./ThemeContext"

type ThemePieceProps = {
  code: string
  size: number
  className?: string
  style?: React.CSSProperties
  label?: string
}

export default function ThemePiece({
  code,
  size,
  className,
  style,
  label,
}: ThemePieceProps) {
  const { pieces } = useSiteTheme()
  const renderer = pieces[code]

  if (!renderer) return null

  return (
    <span
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        overflow: "visible",
        pointerEvents: "none",
        userSelect: "none",
        ...style,
      }}
    >
      {renderer({ squareWidth: size })}
    </span>
  )
}
