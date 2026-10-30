import { Chess } from 'chess.js'
import { accountStorageKey } from '../auth/accountBrowserStorage'

// Ordinary games only; never reads/writes Weekly, training or account records.
export const NORMAL_PLAY_SESSION_KEY = 'weiss-play-computer-session-v1'
export type NormalPlaySession = {
 gameId?: string
 entryFen: string
 fen: string
 pgn: string
 playerColor: 'white' | 'black'
 orientation: 'white' | 'black'
 engineElo: number
 started: boolean
 status: string
}

export function readNormalPlaySession(entryFen?: string, userId: string | null = null, auto = false): NormalPlaySession | null {
 try {
  const value = JSON.parse(sessionStorage.getItem(accountStorageKey(NORMAL_PLAY_SESSION_KEY + (auto ? ':auto' : ''), userId)) || 'null')
  if (!value || value.entryFen !== (entryFen?.trim() || new Chess().fen())) return null
  if (!['white', 'black'].includes(value.playerColor) || !['white', 'black'].includes(value.orientation)) return null
  if (!Number.isFinite(value.engineElo) || value.engineElo < 100 || value.engineElo > 3000 || typeof value.started !== 'boolean' || typeof value.status !== 'string') return null
  const game = new Chess()
  game.loadPgn(value.pgn)
  if (game.fen() !== value.fen) return null
  return value
 } catch { return null }
}

export function restoreNormalPlaySession(value: NormalPlaySession): Chess {
 const game = new Chess()
 game.loadPgn(value.pgn)
 return game
}

/** Old setup snapshots are not a new Start gate. Finished/resigned games stay stopped. */
export function normalPlaySessionShouldStart(value: NormalPlaySession): boolean {
 const game = restoreNormalPlaySession(value)
 if (game.isGameOver() || ['1-0', '0-1', '1/2-1/2'].includes(game.getHeaders().Result)) return false
 return true
}

export function saveNormalPlaySession(value: NormalPlaySession, userId: string | null = null, auto = false) {
 try { sessionStorage.setItem(accountStorageKey(NORMAL_PLAY_SESSION_KEY + (auto ? ':auto' : ''), userId), JSON.stringify(value)) } catch { /* Browser storage may be unavailable; playing remains possible. */ }
}
