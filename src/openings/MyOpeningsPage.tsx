import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authRouterState, rememberTrainingReturnTarget } from '../auth/trainingReturnTarget.mjs'
import { supabase } from '../lib/supabase'
import {
  OPENING_LIBRARY_PAGE_SIZE,
  fetchSavedOpeningsPage,
  openingLibraryRoute,
  removeOpeningFromLibrary,
  type OpeningLibraryItem,
} from './libraryData'
import './MyOpeningsPage.css'

type ProgressState = 'not-started' | 'in-progress' | 'mastered'

function openingTheme(opening: OpeningLibraryItem) {
  return `opening:${opening.slug}`
}

function fullStageId(opening: OpeningLibraryItem) {
  const fullMoves = Math.ceil(Math.max(0, opening.plyCount ?? 0) / 2)
  return `1-${fullMoves}-full`
}

export default function MyOpeningsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [openings, setOpenings] = useState<OpeningLibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, ProgressState>>({})
  const requestRevisionRef = useRef(0)

  useEffect(() => {
    let active = true
    let authRevision = 0
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      authRevision += 1
      setUserId(session?.user?.id ?? null)
      setAuthReady(true)
      setPage(1)
      setOpenings([])
      setTotal(0)
      setProgress({})
      requestRevisionRef.current += 1
      setLoading(false)
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
    const requestRevision = ++requestRevisionRef.current
    if (!userId) {
      setOpenings([])
      setTotal(0)
      setProgress({})
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await fetchSavedOpeningsPage(supabase, userId, page, OPENING_LIBRARY_PAGE_SIZE)
      if (requestRevision !== requestRevisionRef.current) return
      setOpenings(result.openings)
      setTotal(result.total)

      const themes = result.openings.map(openingTheme)
      if (!themes.length) {
        setProgress({})
      } else {
        const { data, error: progressError } = await supabase
          .from('training_progress')
          .select('theme,item_id,mastery')
          .eq('user_id', userId)
          .eq('course', 'openings')
          .in('theme', themes)
        if (progressError) throw progressError
        if (requestRevision !== requestRevisionRef.current) return

        const next: Record<string, ProgressState> = {}
        for (const opening of result.openings) next[opening.id] = 'not-started'
        for (const opening of result.openings) {
          const rows = (data ?? []).filter((row) => row.theme === openingTheme(opening))
          if (rows.some((row) => row.item_id === fullStageId(opening) && Number(row.mastery ?? 0) >= 5)) {
            next[opening.id] = 'mastered'
          } else if (rows.length > 0) {
            next[opening.id] = 'in-progress'
          }
        }
        setProgress(next)
      }
    } catch (cause) {
      if (requestRevision !== requestRevisionRef.current) return
      console.error('My Openings load failed:', cause)
      setError(cause instanceof Error ? cause.message : 'My Openings could not be loaded.')
    } finally {
      if (requestRevision === requestRevisionRef.current) setLoading(false)
    }
  }, [page, userId])

  useEffect(() => { void loadPage() }, [loadPage])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / OPENING_LIBRARY_PAGE_SIZE)), [total])

  function beginLogin() {
    const target = `${location.pathname}${location.search}${location.hash}`
    const record = rememberTrainingReturnTarget(target)
    navigate('/auth?resumeTraining=1', { state: authRouterState(record) })
  }

  async function remove(openingId: string) {
    if (!userId || removingId !== null) return
    setRemovingId(openingId)
    setError('')
    try {
      await removeOpeningFromLibrary(supabase, userId, openingId)
      if (openings.length === 1 && page > 1) setPage((value) => value - 1)
      else await loadPage()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The opening could not be removed.')
    } finally {
      setRemovingId(null)
    }
  }

  if (!authReady) return <div className="my-openings-page">Loading My Openings...</div>

  if (!userId) {
    return (
      <div className="my-openings-page">
        <section className="my-openings-empty" data-testid="my-openings-signed-out">
          <p className="my-openings-kicker">OPENINGS</p>
          <h1>My Openings</h1>
          <p>Log in to save opening lines and use the same practice list on every device.</p>
          <div className="my-openings-empty-actions">
            <button type="button" onClick={beginLogin}>Log In</button>
            <Link to="/openings">Browse Openings</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="my-openings-page site-mobile-dock-scroll" data-testid="my-openings-page">
      <header className="my-openings-hero">
        <div>
          <p className="my-openings-kicker">OPENINGS</p>
          <h1>My Openings</h1>
          <p>Saved opening lines, newest first. Removing a bookmark never removes mastery or review progress.</p>
        </div>
        <div className="my-openings-summary" aria-label={`${total} saved openings`}><strong>{total.toLocaleString()}</strong><span>saved line{total === 1 ? '' : 's'}</span></div>
      </header>

      <nav className="my-openings-toolbar" aria-label="My Openings actions">
        <Link to="/openings">Browse Openings</Link>
        <button type="button" className="primary" disabled={total === 0 || loading} onClick={() => navigate('/openings/my-openings/practice')}>Practice My Openings</button>
      </nav>

      {error ? <div className="my-openings-error" role="alert">{error}</div> : null}
      {loading && openings.length === 0 ? <div>Loading saved openings...</div> : null}
      {!loading && openings.length === 0 && !error ? (
        <section className="my-openings-empty" data-testid="my-openings-empty"><h2>No openings saved yet</h2><p>Open an opening line and choose “Add to My Openings.”</p><Link to="/openings">Find an opening</Link></section>
      ) : null}

      <section className="my-openings-grid" aria-busy={loading}>
        {openings.map((opening) => {
          const state = progress[opening.id] ?? 'not-started'
          return (
            <article className="my-openings-card" key={opening.id}>
              <div className="my-openings-card-header">
                <Link className="my-openings-card-title" to={openingLibraryRoute(opening)} state={{ fromMyOpenings: true }}>{opening.name}</Link>
                <span className={`my-openings-progress is-${state}`}>{state === 'mastered' ? 'Mastered' : state === 'in-progress' ? 'In progress' : 'Not started'}</span>
              </div>
              <dl className="my-openings-meta">
                <div><dt>Family</dt><dd>{opening.family}</dd></div>
                <div><dt>ECO</dt><dd>{opening.eco || '—'}</dd></div>
                <div><dt>Variation</dt><dd>{opening.variation || 'Main line'}</dd></div>
                <div><dt>Length</dt><dd>{opening.plyCount ?? '—'} plies</dd></div>
              </dl>
              {opening.subvariation ? <p style={{ color: '#bbb', fontSize: 13 }}>{opening.subvariation}</p> : null}
              <div className="my-openings-actions">
                <Link to={openingLibraryRoute(opening)} state={{ fromMyOpenings: true }}>Open</Link>
                <Link to={`${openingLibraryRoute(opening)}?libraryPractice=1`} state={{ fromMyOpenings: true }}>Practice</Link>
                <button type="button" disabled={removingId !== null} onClick={() => void remove(opening.id)}>{removingId === opening.id ? 'Removing...' : 'Remove'}</button>
              </div>
            </article>
          )
        })}
      </section>

      {total > 0 ? <footer className="my-openings-pagination"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Prev</button><span>Page {page} / {totalPages}</span><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></footer> : null}
    </div>
  )
}
