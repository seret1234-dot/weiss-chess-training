export const AUTH_RETURN_TARGET_STORAGE_KEY = "weiss:auth-return-target:v1"
export const AUTH_RETURN_TARGET_TTL_MS = 30 * 60 * 1000
export const AUTH_RETURN_TARGET_STATE_KEY = "authReturnTarget"

function storageOrNull(storage) {
  if (storage) return storage
  if (typeof window === "undefined") return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function isLimitedTrainingPath(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/"

  if (path === "/stalemate/underpromotion") return true
  if (path === "/board-vision" || path.startsWith("/board-vision/")) return true
  if (path.startsWith("/pattern/")) return true
  if (/^\/tactics\/[^/]+\/[^/]+$/.test(path)) return true
  if (/^\/mates\/m\d+\/[^/]+$/.test(path)) return true
  if (/^\/master-tactics\/[1-4]\/[^/]+$/.test(path)) return true

  const masterMateMatch = path.match(/^\/master-mates\/[1-4]\/([^/]+)$/)
  if (masterMateMatch && masterMateMatch[1] !== "kill-box") return true

  if (path === "/backrank" || /^\/anastasia(?:-m\d+)?$/.test(path)) return true
  if (path.startsWith("/endgame/piece-mates/")) return true
  if (path.startsWith("/endgame-studies/")) return true
  if (path.startsWith("/free-play/")) return true
  if (path === "/master-games/my-library/practice") return true
  if (/^\/master-games\/[^/]+$/.test(path)) return true
  if (path === "/openings/my-openings" || path === "/openings/my-openings/practice") return true
  if (/^\/openings\/[^/]+$/.test(path) && path !== "/openings/my-openings") return true

  return false
}

export function validTrainingReturnTarget(value) {
  if (typeof value !== "string") return null

  const target = value.trim()
  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(target)
  ) {
    return null
  }

  try {
    const parsed = new URL(target, "https://weiss.internal")
    if (parsed.origin !== "https://weiss.internal") return null
    if (!isLimitedTrainingPath(parsed.pathname)) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

export function currentTrainingReturnTarget(locationLike) {
  if (!locationLike) return null
  return validTrainingReturnTarget(
    `${locationLike.pathname || "/"}${locationLike.search || ""}${locationLike.hash || ""}`,
  )
}

function validRecord(value, now = Date.now()) {
  if (!value || typeof value !== "object") return null

  const target = validTrainingReturnTarget(value.target)
  const createdAt = Number(value.createdAt)
  if (!target || !Number.isFinite(createdAt)) return null
  if (createdAt > now + 60_000 || now - createdAt > AUTH_RETURN_TARGET_TTL_MS) return null

  return { target, createdAt, userId: typeof value.userId === 'string' ? value.userId : null }
}

export function rememberTrainingReturnTarget(targetValue, options = {}) {
  const target = validTrainingReturnTarget(targetValue)
  if (!target) return null

  const record = { target, createdAt: options.now ?? Date.now(), userId: options.userId ?? null }
  const storage = storageOrNull(options.storage)

  try {
    storage?.setItem(AUTH_RETURN_TARGET_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Router state still carries the validated record when storage is blocked.
  }

  return record
}

export function readRememberedTrainingReturnTarget(options = {}) {
  const storage = storageOrNull(options.storage)
  if (!storage) return null

  try {
    const raw = storage.getItem(AUTH_RETURN_TARGET_STORAGE_KEY)
    if (!raw) return null
    const record = validRecord(JSON.parse(raw), options.now ?? Date.now())
    if (!record) storage.removeItem(AUTH_RETURN_TARGET_STORAGE_KEY)
    return record
  } catch {
    try {
      storage.removeItem(AUTH_RETURN_TARGET_STORAGE_KEY)
    } catch {
      // Ignore unavailable storage; the target simply cannot be restored.
    }
    return null
  }
}

export function resolveTrainingReturnTarget({ routerState, search = "", storage, now, userId } = {}) {
  // Route safety/TTL alone does not establish account ownership. Old unowned
  // bookmarks must go through normal account entry, never bypass onboarding.
  if (!userId) return null
  const stateRecord = validRecord(routerState?.[AUTH_RETURN_TARGET_STATE_KEY], now ?? Date.now())
  if (stateRecord?.userId === userId) return stateRecord.target

  const params = new URLSearchParams(search)
  const remembered = params.get("resumeTraining") === "1"
    ? readRememberedTrainingReturnTarget({ storage, now }) : null
  return remembered?.userId === userId ? remembered.target : null
}

export function consumeTrainingReturnTarget(expectedTarget, options = {}) {
  const storage = storageOrNull(options.storage)
  if (!storage) return

  try {
    if (expectedTarget) {
      const remembered = readRememberedTrainingReturnTarget(options)
      if (remembered && remembered.target !== validTrainingReturnTarget(expectedTarget)) return
    }
    storage.removeItem(AUTH_RETURN_TARGET_STORAGE_KEY)
  } catch {
    // A failed cleanup must not block a successful authentication redirect.
  }
}

export function authRouterState(record) {
  return record ? { [AUTH_RETURN_TARGET_STATE_KEY]: record } : undefined
}
