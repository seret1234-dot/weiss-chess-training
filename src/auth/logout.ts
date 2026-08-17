export type LogoutError = {
  message?: string
} | null | undefined

type LogoutDependencies = {
  signOut: () => Promise<{ error: LogoutError }>
  onSessionCleared: () => void
  navigateToSignedOut: () => void
}

export type LogoutResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * Clears application state before navigating, so the signed-out UI never waits
 * for a later auth listener notification or a page refresh.
 */
export async function performLogout({
  signOut,
  onSessionCleared,
  navigateToSignedOut,
}: LogoutDependencies): Promise<LogoutResult> {
  const { error } = await signOut()

  if (error) {
    return {
      ok: false,
      message: error.message || "Logout could not be completed. Please try again.",
    }
  }

  onSessionCleared()
  navigateToSignedOut()
  return { ok: true }
}
