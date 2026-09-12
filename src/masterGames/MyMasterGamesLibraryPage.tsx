import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authRouterState, rememberTrainingReturnTarget } from '../auth/trainingReturnTarget.mjs'
import { supabase } from '../lib/supabase'
import {
  MASTER_GAME_LIBRARY_PAGE_SIZE,
  fetchSavedMasterGamesPage,
  masterGameLibraryRoute,
  removeMasterGameFromLibrary,
  type MasterGameLibraryItem,
} from './libraryData'
import './MyMasterGamesLibraryPage.css'

type ProgressState = 'not-started' | 'in-progress' | 'mastered'

function titleFor(game: MasterGameLibraryItem) {
  return game.title || `${game.white} vs ${game.black}${game.year ? `, ${game.year}` : ''}`
}

export default function MyMasterGamesLibraryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [games, setGames] = useState<MasterGameLibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [progress, setProgress] = useState<Record<string, ProgressState>>({})

  useEffect(() => {
    let active = true
    let authRevision = 0

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      authRevision += 1
      setUserId(session?.user?.id ?? null)
      setAuthReady(true)
      setPage(1)
    })

    const initialRevision = authRevision
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || authRevision !== initialRevision) return
      setUserId(data.user?.id ?? null)
      setAuthReady(true)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const loadPage = useCallback(async () => {
    if (!userId) {
      setGames([])
      setTotal(0)
      setProgress({})
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await fetchSavedMasterGamesPage(
        supabase,
        userId,
        page,
        MASTER_GAME_LIBRARY_PAGE_SIZE,
      )
      setGames(result.games)
      setTotal(result.total)

      const gameIds = result.games.map((game) => String(game.id))
      if (gameIds.length === 0) {
        setProgress({})
      } else {
        const { data, error: progressError } = await supabase
          .from('training_progress')
          .select('theme, mastery')
          .eq('user_id', userId)
          .eq('course', 'master_games')
          .in('theme', gameIds)

        if (progressError) throw progressError

        const nextProgress: Record<string, ProgressState> = {}
        for (const gameId of gameIds) nextProgress[gameId] = 'not-started'
        for (const row of data ?? []) {
          const gameId = String(row.theme ?? '')
          if (!gameId) continue
          nextProgress[gameId] = Number(row.mastery ?? 0) >= 5 ? 'mastered' : 'in-progress'
        }
        setProgress(nextProgress)
      }
    } catch (cause) {
      console.error('Failed to load My Library:', cause)
      setError(cause instanceof Error ? cause.message : 'My Library could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [page, userId])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / MASTER_GAME_LIBRARY_PAGE_SIZE)),
    [total],
  )

  function beginLogin() {
    const target = `${location.pathname}${location.search}${location.hash}`
    const record = rememberTrainingReturnTarget(target)
    navigate('/auth?resumeTraining=1', { state: authRouterState(record) })
  }

  async function remove(gameId: number) {
    if (!userId || removingId !== null) return
    setRemovingId(gameId)
    setError('')

    try {
      await removeMasterGameFromLibrary(supabase, userId, gameId)
      if (games.length === 1 && page > 1) {
        setPage((current) => current - 1)
      } else {
        await loadPage()
      }
    } catch (cause) {
      console.error('Failed to remove saved Master Game:', cause)
      setError(cause instanceof Error ? cause.message : 'The game could not be removed.')
    } finally {
      setRemovingId(null)
    }
  }

  if (!authReady) {
    return <div className="master-game-library-page">Loading My Library...</div>
  }

  if (!userId) {
    return (
      <div className="master-game-library-page">
        <section className="master-game-library-empty" data-testid="master-game-library-signed-out">
          <p className="master-game-library-kicker">MASTER GAMES</p>
          <h1>My Library</h1>
          <p>Log in to save Master Games and open the same collection on every device.</p>
          <div className="master-game-library-actions">
            <button type="button" onClick={beginLogin}>Log In</button>
            <Link to="/master-games">Browse Master Games</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="master-game-library-page" data-testid="master-game-my-library-page">
      <header className="master-game-library-hero">
        <div>
          <p className="master-game-library-kicker">MASTER GAMES</p>
          <h1>My Library</h1>
          <p>Saved games, newest first. Removing a bookmark never removes your training progress.</p>
        </div>
        <div className="master-game-library-summary" aria-label={`${total} saved games`}>
          <strong>{total.toLocaleString()}</strong>
          <span>saved game{total === 1 ? '' : 's'}</span>
        </div>
      </header>

      <nav className="master-game-library-toolbar" aria-label="My Library actions">
        <Link to="/master-games">Browse Master Games</Link>
        <button
          type="button"
          className="master-game-library-practice"
          disabled={total === 0 || loading}
          onClick={() => navigate('/master-games/my-library/practice')}
        >
          Practice My Library
        </button>
      </nav>

      {error ? <div className="master-game-library-error" role="alert">{error}</div> : null}
      {loading && games.length === 0 ? <div className="master-game-library-loading">Loading saved games...</div> : null}

      {!loading && games.length === 0 && !error ? (
        <section className="master-game-library-empty" data-testid="master-game-library-empty">
          <h2>No games saved yet</h2>
          <p>Open any Master Game and choose “Add to My Library.”</p>
          <Link to="/master-games">Find a game</Link>
        </section>
      ) : null}

      <section className="master-game-library-grid" aria-busy={loading}>
        {games.map((game) => {
          const state = progress[String(game.id)] ?? 'not-started'
          return (
            <article className="master-game-library-card" key={game.id}>
              <div className="master-game-library-card-header">
                <Link
                  to={masterGameLibraryRoute(game)}
                  state={{ fromMyLibrary: true }}
                  className="master-game-library-card-title"
                >
                  {titleFor(game)}
                </Link>
                <span className={`master-game-library-progress is-${state}`}>
                  {state === 'mastered' ? 'Mastered' : state === 'in-progress' ? 'In progress' : 'Not started'}
                </span>
              </div>

              <div className="master-game-library-players">
                <strong>{game.white}</strong><span>vs</span><strong>{game.black}</strong>
              </div>

              <dl className="master-game-library-meta">
                <div><dt>Year</dt><dd>{game.year ?? '—'}</dd></div>
                <div><dt>Result</dt><dd>{game.result || '—'}</dd></div>
                <div><dt>Event</dt><dd>{game.event || '—'}</dd></div>
                <div><dt>Opening</dt><dd>{game.opening || '—'}</dd></div>
                <div><dt>ECO</dt><dd>{game.eco || '—'}</dd></div>
                <div><dt>Site</dt><dd>{game.site || '—'}</dd></div>
              </dl>

              <div className="master-game-library-card-actions">
                <Link to={masterGameLibraryRoute(game)} state={{ fromMyLibrary: true }}>Open game</Link>
                <Link
                  to={`${masterGameLibraryRoute(game)}?libraryPractice=1`}
                  state={{ fromMyLibrary: true }}
                >
                  Practice
                </Link>
                <button
                  type="button"
                  disabled={removingId !== null}
                  onClick={() => void remove(game.id)}
                >
                  {removingId === game.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </article>
          )
        })}
      </section>

      {total > 0 ? (
        <footer className="master-game-library-pagination">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Prev</button>
          <span>Page {page.toLocaleString()} / {totalPages.toLocaleString()}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
        </footer>
      ) : null}
    </div>
  )
}
