import type { SupabaseClient } from '@supabase/supabase-js'

export const OPENING_LIBRARY_TABLE = 'user_opening_library'
export const OPENING_LIBRARY_PAGE_SIZE = 30
export const OPENING_LIBRARY_CHANGED_EVENT = 'weiss:opening-library-changed'

export type OpeningLibraryItem = {
  id: string
  slug: string
  name: string
  family: string
  familySlug?: string | null
  variation?: string | null
  subvariation?: string | null
  eco?: string | null
  plyCount?: number | null
  addedAt: string
}

export type OpeningLibraryPage = {
  openings: OpeningLibraryItem[]
  total: number
  page: number
  pageSize: number
}

type SavedOpeningRow = {
  opening_id: string
  added_at: string
  opening_line:
    | {
        id: string
        slug: string
        name: string
        family: string
        family_slug?: string | null
        variation?: string | null
        subvariation?: string | null
        eco?: string | null
        ply_count?: number | null
      }
    | Array<{
        id: string
        slug: string
        name: string
        family: string
        family_slug?: string | null
        variation?: string | null
        subvariation?: string | null
        eco?: string | null
        ply_count?: number | null
      }>
    | null
}

function assertUserId(userId: string) {
  if (!userId.trim()) throw new Error('Log in to use My Openings.')
}

function assertOpeningId(openingId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(openingId)) {
    throw new Error('Invalid opening line ID.')
  }
}

export function openingLibraryRoute(opening: Pick<OpeningLibraryItem, 'slug'>) {
  return `/openings/${encodeURIComponent(opening.slug)}`
}

export function notifyOpeningLibraryChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPENING_LIBRARY_CHANGED_EVENT))
  }
}

export async function getSavedOpeningCount(client: SupabaseClient, userId: string) {
  assertUserId(userId)

  const { count, error } = await client
    .from(OPENING_LIBRARY_TABLE)
    .select('opening_id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw error
  return count ?? 0
}

export async function getSavedOpeningIds(client: SupabaseClient, userId: string) {
  assertUserId(userId)
  const ids: string[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(OPENING_LIBRARY_TABLE)
      .select('opening_id')
      .eq('user_id', userId)
      .order('opening_id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    const rows = data ?? []
    ids.push(...rows.map((row) => String(row.opening_id)))
    if (rows.length < pageSize) break
  }

  return ids
}

export async function isOpeningSaved(client: SupabaseClient, userId: string, openingId: string) {
  assertUserId(userId)
  assertOpeningId(openingId)

  const { data, error } = await client
    .from(OPENING_LIBRARY_TABLE)
    .select('opening_id')
    .eq('user_id', userId)
    .eq('opening_id', openingId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function addOpeningToLibrary(client: SupabaseClient, userId: string, openingId: string) {
  assertUserId(userId)
  assertOpeningId(openingId)

  const { error } = await client
    .from(OPENING_LIBRARY_TABLE)
    .upsert(
      { user_id: userId, opening_id: openingId },
      { onConflict: 'user_id,opening_id', ignoreDuplicates: true },
    )

  if (error) throw error
  notifyOpeningLibraryChanged()
}

export async function removeOpeningFromLibrary(client: SupabaseClient, userId: string, openingId: string) {
  assertUserId(userId)
  assertOpeningId(openingId)

  const { error } = await client
    .from(OPENING_LIBRARY_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('opening_id', openingId)

  if (error) throw error
  notifyOpeningLibraryChanged()
}

export async function fetchSavedOpeningsPage(
  client: SupabaseClient,
  userId: string,
  page = 1,
  pageSize = OPENING_LIBRARY_PAGE_SIZE,
): Promise<OpeningLibraryPage> {
  assertUserId(userId)
  const safePage = Math.max(1, Math.trunc(page))
  const safePageSize = Math.max(1, Math.min(100, Math.trunc(pageSize)))
  const from = (safePage - 1) * safePageSize

  const { data, count, error } = await client
    .from(OPENING_LIBRARY_TABLE)
    .select(
      `
        opening_id,
        added_at,
        opening_line:opening_lines!user_opening_library_opening_id_fkey(
          id, slug, name, family, family_slug, variation, subvariation, eco, ply_count
        )
      `,
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .order('opening_id', { ascending: false })
    .range(from, from + safePageSize - 1)

  if (error) throw error

  const openings = ((data ?? []) as unknown as SavedOpeningRow[]).flatMap((row) => {
    const line = Array.isArray(row.opening_line) ? row.opening_line[0] : row.opening_line
    if (!line) return []
    return [{
      id: line.id,
      slug: line.slug,
      name: line.name,
      family: line.family,
      familySlug: line.family_slug,
      variation: line.variation,
      subvariation: line.subvariation,
      eco: line.eco,
      plyCount: line.ply_count,
      addedAt: row.added_at,
    }]
  })

  return { openings, total: count ?? 0, page: safePage, pageSize: safePageSize }
}

export async function getNextSavedOpening(
  client: SupabaseClient,
  currentOpeningId: string | null = null,
) {
  if (currentOpeningId !== null) assertOpeningId(currentOpeningId)

  const { data, error } = await client.rpc('next_user_opening', {
    p_current_opening_id: currentOpeningId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { id: String(row.id), slug: String(row.slug) }
}
