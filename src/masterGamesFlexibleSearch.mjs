const PAIR_SEPARATOR = /\s+(?:vs?\.?|versus|against)\s+|\s+[\u2012\u2013\u2014-]\s+/i

export const MASTER_GAMES_FLEXIBLE_SEARCH_RPC = 'search_master_games_flexible'
export const MASTER_GAME_PLAYER_SUGGESTIONS_RPC = 'master_game_player_suggestions_flexible'

export function normalizeMasterGameSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function tokenizeMasterGameSearch(value) {
  const normalized = normalizeMasterGameSearchText(value)
  return normalized ? normalized.split(' ') : []
}

export function parseMasterGamePlayerPair(value) {
  const raw = String(value ?? '').trim()
  const match = PAIR_SEPARATOR.exec(raw)
  if (!match || match.index <= 0) return null

  const left = normalizeMasterGameSearchText(raw.slice(0, match.index))
  const right = normalizeMasterGameSearchText(raw.slice(match.index + match[0].length))
  if (left.length < 2 || right.length < 2) return null

  return { player1: left, player2: right }
}

export function buildMasterGameSearchRpcArgs(filters) {
  let player1 = normalizeMasterGameSearchText(filters.player1)
  let player2 = normalizeMasterGameSearchText(filters.player2)
  let query = normalizeMasterGameSearchText(filters.query)

  const parsedPair = !player1 && !player2 ? parseMasterGamePlayerPair(filters.query) : null
  if (parsedPair) {
    player1 = parsedPair.player1
    player2 = parsedPair.player2
    query = ''
  } else if (!player1 && player2) {
    player1 = player2
    player2 = ''
  }

  return {
    p_q: query,
    p_player_1: player1,
    p_player_2: player2,
    p_opening: normalizeMasterGameSearchText(filters.opening),
    p_event: normalizeMasterGameSearchText(filters.event),
    p_result: String(filters.result ?? '').trim(),
    p_player_1_color: filters.colorFilter ?? 'all',
    p_year_from: filters.yearFrom ? Number(filters.yearFrom) : null,
    p_year_to: filters.yearTo ? Number(filters.yearTo) : null,
    p_sort: filters.sortBy ?? 'newest',
    p_page_num: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 30,
  }
}
