import type { SupabaseClient } from '@supabase/supabase-js'

export const MASTER_GAME_LIBRARY_TABLE = 'user_master_games'
export const MASTER_GAME_LIBRARY_PAGE_SIZE = 30
export const MASTER_GAME_LIBRARY_CHANGED_EVENT = 'weiss:master-game-library-changed'

export type MasterGameLibraryItem = {
  id: number
  slug?: string
  title?: string
  white: string
  black: string
  result?: string
  event?: string
  site?: string
  year?: number
  opening?: string
  eco?: string
  description?: string
  addedAt: string
}

export type MasterGameLibraryPage = {
  games: MasterGameLibraryItem[]
  total: number
  page: number
  pageSize: number
}

type SavedMasterGameRow = {
  game_id: number | string
  added_at: string
  master_game:
    | Omit<MasterGameLibraryItem, 'addedAt'>
    | Array<Omit<MasterGameLibraryItem, 'addedAt'>>
    | null
}

function assertUserId(userId: string) {
  if (!userId.trim()) throw new Error('Sign in to use My Library.')
}

function assertGameId(gameId: number) {
  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    throw new Error('Invalid Master Game ID.')
  }
}

export function masterGameLibraryRoute(game: Pick<MasterGameLibraryItem, 'id' | 'slug'>) {
  return `/master-games/${encodeURIComponent(game.slug || String(game.id))}`
}

export function notifyMasterGameLibraryChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MASTER_GAME_LIBRARY_CHANGED_EVENT))
  }
}

export async function getSavedMasterGameCount(client: SupabaseClient, userId: string) {
  assertUserId(userId)

  const { count, error } = await client
    .from(MASTER_GAME_LIBRARY_TABLE)
    .select('game_id', { count: 'exact' })
    .eq('user_id', userId)
    .limit(1)

  if (error) throw error
  return count ?? 0
}

export async function getSavedMasterGameIds(
  client: SupabaseClient,
  userId: string,
  page = 1,
  pageSize = MASTER_GAME_LIBRARY_PAGE_SIZE,
) {
  assertUserId(userId)
  const safePage = Math.max(1, Math.trunc(page))
  const safePageSize = Math.max(1, Math.min(100, Math.trunc(pageSize)))
  const from = (safePage - 1) * safePageSize

  const { data, count, error } = await client
    .from(MASTER_GAME_LIBRARY_TABLE)
    .select('game_id, added_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .order('game_id', { ascending: false })
    .range(from, from + safePageSize - 1)

  if (error) throw error
  return {
    gameIds: (data ?? []).map((row) => Number(row.game_id)),
    total: count ?? 0,
  }
}

export async function isMasterGameSaved(
  client: SupabaseClient,
  userId: string,
  gameId: number,
) {
  assertUserId(userId)
  assertGameId(gameId)

  const { data, error } = await client
    .from(MASTER_GAME_LIBRARY_TABLE)
    .select('game_id')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function addMasterGameToLibrary(
  client: SupabaseClient,
  userId: string,
  gameId: number,
) {
  assertUserId(userId)
  assertGameId(gameId)

  const { error } = await client
    .from(MASTER_GAME_LIBRARY_TABLE)
    .upsert(
      {
        user_id: userId,
        game_id: gameId,
        source: 'manual',
        is_favorite: true,
      },
      {
        onConflict: 'user_id,game_id',
        ignoreDuplicates: true,
      },
    )

  if (error) throw error
  notifyMasterGameLibraryChanged()
}

export async function removeMasterGameFromLibrary(
  client: SupabaseClient,
  userId: string,
  gameId: number,
) {
  assertUserId(userId)
  assertGameId(gameId)

  const { error } = await client
    .from(MASTER_GAME_LIBRARY_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('game_id', gameId)

  if (error) throw error
  notifyMasterGameLibraryChanged()
}

export async function fetchSavedMasterGamesPage(
  client: SupabaseClient,
  userId: string,
  page = 1,
  pageSize = MASTER_GAME_LIBRARY_PAGE_SIZE,
): Promise<MasterGameLibraryPage> {
  assertUserId(userId)
  const safePage = Math.max(1, Math.trunc(page))
  const safePageSize = Math.max(1, Math.min(100, Math.trunc(pageSize)))
  const from = (safePage - 1) * safePageSize

  const { data, count, error } = await client
    .from(MASTER_GAME_LIBRARY_TABLE)
    .select(
      `
        game_id,
        added_at,
        master_game:master_games!user_master_games_game_id_fkey(
          id, slug, title, white, black, result, event, site,
          year, opening, eco, description
        )
      `,
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .order('game_id', { ascending: false })
    .range(from, from + safePageSize - 1)

  if (error) throw error

  const games = ((data ?? []) as unknown as SavedMasterGameRow[]).flatMap((row) => {
    const related = Array.isArray(row.master_game) ? row.master_game[0] : row.master_game
    if (!related) return []
    return [{ ...related, id: Number(related.id), addedAt: row.added_at }]
  })

  return { games, total: count ?? 0, page: safePage, pageSize: safePageSize }
}

export async function getNextSavedMasterGame(
  client: SupabaseClient,
  currentGameId: number | null = null,
) {
  if (currentGameId !== null) assertGameId(currentGameId)

  const { data, error } = await client.rpc('next_user_master_game', {
    p_current_game_id: currentGameId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { id: Number(row.id), slug: row.slug ? String(row.slug) : undefined }
}
