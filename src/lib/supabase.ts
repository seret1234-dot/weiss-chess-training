import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const supabaseKey = 'sb_publishable_Mh6jBwj622QGXK4MtHWrqQ_UUZL3NuB'

export const supabase = createClient(supabaseUrl, supabaseKey)

/* ================================
   MASTER GAMES — FETCH ONE GAME
================================ */
export async function fetchMasterGameById(id: number) {
  const { data, error } = await supabase
    .from("master_games")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw error
  return data
}

/* ================================
   MASTER GAMES — SEARCH
================================ */
export async function fetchMasterGamesSearch(query: string) {
  const { data, error } = await supabase
    .from("master_games")
    .select(`
      id,
      slug,
      white,
      black,
      year,
      event,
      opening,
      result
    `)
    .ilike("search_text", `%${query}%`)
    .limit(50)

  if (error) throw error
  return data
}

/* ================================
   MASTER GAMES — GET PGN URL
================================ */
export function getMasterGamePgnUrl(storageKey: string) {
  const { data } = supabase.storage
    .from("master-games-pgn")
    .getPublicUrl(storageKey)

  return data.publicUrl
}