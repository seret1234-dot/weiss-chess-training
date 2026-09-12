export type AccountDisplayUser = {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

const DISPLAY_NAME_KEYS = [
  "username",
  "user_name",
  "preferred_username",
  "display_name",
  "displayName",
  "full_name",
  "fullName",
  "name",
  "chess_com_username",
  "chessComUsername",
  "lichess_username",
  "lichessUsername",
  "account_name",
  "accountName",
] as const

function readableText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

export function resolveAccountDisplayName(user?: AccountDisplayUser | null) {
  if (!user) return ""

  const metadata = user.user_metadata ?? {}

  for (const key of DISPLAY_NAME_KEYS) {
    const value = readableText(metadata[key])
    if (value) return value
  }

  return readableText(user.email)
}
