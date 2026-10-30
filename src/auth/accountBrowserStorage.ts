/** Browser caches are not account identity. Never adopt an unowned legacy value. */
export function accountStorageKey(key: string, userId: string | null | undefined) {
  return `${key}:account:${userId ? encodeURIComponent(userId) : 'guest'}`
}

export function storageKeyBelongsToAccount(key: string, userId: string) {
  return Boolean(userId) && key.endsWith(`:account:${encodeURIComponent(userId)}`)
}

export function readOwnedJson<T extends { userId?: string }>(
  storage: Pick<Storage, 'getItem'>, key: string, userId: string | null | undefined,
): T | null {
  if (!userId) return null
  try {
    const scoped = storage.getItem(accountStorageKey(key, userId))
    // Old records may be recovered only when they explicitly name this owner.
    // Do not remove them: a different account may still need its own record.
    const value = JSON.parse(scoped ?? storage.getItem(key) ?? 'null') as T | null
    return value?.userId === userId ? value : null
  } catch { return null }
}

export function writeOwnedJson<T extends { userId?: string }>(
  storage: Pick<Storage, 'setItem'>, key: string, value: T,
) {
  if (!value.userId) return
  try { storage.setItem(accountStorageKey(key, value.userId), JSON.stringify(value)) }
  catch { /* Durable account data remains authoritative when storage is unavailable. */ }
}
