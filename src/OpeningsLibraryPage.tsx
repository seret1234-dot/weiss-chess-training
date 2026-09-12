import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authRouterState, rememberTrainingReturnTarget } from './auth/trainingReturnTarget.mjs'
import { supabase } from './lib/supabase'
import {
  OPENING_LIBRARY_CHANGED_EVENT,
  getSavedOpeningCount,
} from './openings/libraryData'
import { prepareOpeningSearchRecords, searchOpeningRecords } from './openings/openingSearch.mjs'

type OpeningLine = {
  id: string
  slug: string
  name: string
  family: string
  family_slug: string | null
  variation: string | null
  subvariation: string | null
  eco: string | null
  aliases: unknown
  ply_count: number | null
}

type Family = {
  family: string
  family_slug: string
  count: number
}

const catalogFields = 'id,slug,name,family,family_slug,variation,subvariation,eco,aliases,ply_count'

export default function OpeningsLibraryPage() {
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<OpeningLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    async function loadCatalog() {
      const lines: OpeningLine[] = []
      const pageSize = 1000
      for (let from = 0; ; from += pageSize) {
        const { data, error: loadError } = await supabase
          .from('opening_lines')
          .select(catalogFields)
          .not('slug', 'is', null)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1)
        if (loadError) throw loadError
        const page = (data ?? []) as OpeningLine[]
        lines.push(...page)
        if (page.length < pageSize) break
      }
      if (active) {
        prepareOpeningSearchRecords(lines)
        setCatalog(lines)
      }
    }

    void loadCatalog()
      .catch((cause) => {
        if (!active) return
        console.error('Opening catalog load failed:', cause)
        setError(cause instanceof Error ? cause.message : 'Openings could not be loaded.')
        setCatalog([])
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    let authRevision = 0

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      authRevision += 1
      setUserId(session?.user?.id ?? null)
    })

    const initialRevision = authRevision
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || authRevision !== initialRevision) return
      setUserId(data.user?.id ?? null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadSavedCount() {
      if (!userId) {
        setSavedCount(null)
        return
      }
      setSavedCount(null)
      try {
        const count = await getSavedOpeningCount(supabase, userId)
        if (active) setSavedCount(count)
      } catch (cause) {
        console.error('My Openings count load failed:', cause)
        if (active) setSavedCount(null)
      }
    }

    const refresh = () => void loadSavedCount()
    void loadSavedCount()
    window.addEventListener(OPENING_LIBRARY_CHANGED_EVENT, refresh)
    return () => {
      active = false
      window.removeEventListener(OPENING_LIBRARY_CHANGED_EVENT, refresh)
    }
  }, [userId])

  const families = useMemo(() => {
    const grouped = new Map<string, Family>()
    for (const line of catalog) {
      if (!line.family_slug) continue
      const current = grouped.get(line.family_slug)
      if (current) current.count += 1
      else grouped.set(line.family_slug, { family: line.family, family_slug: line.family_slug, count: 1 })
    }
    return [...grouped.values()].sort((left, right) => left.family.localeCompare(right.family))
  }, [catalog])

  const searchResults = useMemo(
    () => searchOpeningRecords(catalog, deferredSearch) as OpeningLine[],
    [catalog, deferredSearch],
  )

  const searching = Boolean(search.trim())

  function openMyOpenings() {
    if (userId) {
      navigate('/openings/my-openings')
      return
    }
    const record = rememberTrainingReturnTarget('/openings/my-openings')
    navigate('/auth?resumeTraining=1', { state: authRouterState(record) })
  }

  function openLine(line: OpeningLine) {
    const family = line.family_slug ? `?family=${encodeURIComponent(line.family_slug)}` : ''
    navigate(`/openings/${encodeURIComponent(line.slug)}${family}`)
  }

  return (
    <div className="openings-library-page site-mobile-dock-scroll" style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #2b2623 0%, #161512 100%)', color: '#f3f3f3', fontFamily: 'Arial, sans-serif', padding: '28px 20px 60px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(95,168,255,0.18) 0%, rgba(127,166,80,0.12) 100%)', borderRadius: 28, padding: 34, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 48, margin: '0 0 12px' }}>Openings</h1>
              <p style={{ fontSize: 18, color: '#d7d7d7', margin: 0 }}>Choose a family or search every opening line.</p>
            </div>
            <button type="button" onClick={openMyOpenings} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px', background: '#2f4f73', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
              {savedCount === null ? 'My Openings' : `My Openings (${savedCount.toLocaleString()})`}
            </button>
          </div>

          <section style={{ color: '#d7d7d7', lineHeight: 1.7, margin: '20px 0 22px', maxWidth: 820 }}>
            <h2 style={{ color: '#f3f3f3', fontSize: 25, margin: '0 0 10px' }}>Opening memory training and review</h2>
            <p style={{ margin: 0 }}>Choose a family and recall the next move on the board. Scheduled review keeps weak or forgotten lines active. You can also return to <Link to="/auto" style={{ color: '#9cc8ff' }}>Auto Training</Link> for a recommended session.</p>
          </section>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              aria-label="Search openings"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, variation, ECO (e.g. Najdorf, B90...)"
              style={{ width: '100%', maxWidth: 520, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: '#1f1d1c', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {searching ? <button type="button" onClick={() => setSearch('')} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', background: '#302e2b', color: '#fff', cursor: 'pointer' }}>Clear</button> : null}
          </div>
        </div>

        {loading ? <div style={{ color: '#cfcfcf', padding: 20 }}>Loading openings...</div> : null}
        {error ? <div role="alert" style={{ color: '#ffb4b4', marginBottom: 18 }}>{error}</div> : null}

        {!loading && !error ? <div data-testid="opening-results-count" style={{ marginBottom: 16, color: '#cfcfcf', fontSize: 13 }}>
          {searching
            ? `${searchResults.length.toLocaleString()} matching line${searchResults.length === 1 ? '' : 's'}`
            : `${families.length.toLocaleString()} families · ${catalog.length.toLocaleString()} lines`}
        </div> : null}

        {searching ? (
          <div className="opening-search-results" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {searchResults.map((line) => (
              <button key={line.id} type="button" onClick={() => openLine(line)} style={{ width: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, background: '#1f1d1c', color: '#f3f3f3', cursor: 'pointer', textAlign: 'left', boxShadow: '0 10px 24px rgba(0,0,0,0.16)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 5 }}>{line.name}</div>
                    <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.45 }}>{line.family}{line.variation ? ` · ${line.variation}` : ''}{line.subvariation ? ` · ${line.subvariation}` : ''}</div>
                  </div>
                  <div style={{ flexShrink: 0, color: '#aaa', fontSize: 12, lineHeight: 1.5, textAlign: 'right' }}><div>{line.eco || '—'}</div><div>{line.ply_count || '?'} plies</div></div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {families.map((family) => (
              <button key={family.family_slug} type="button" onClick={() => navigate(`/openings/family/${family.family_slug}`)} style={{ width: '100%', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 22, padding: 24, background: '#1f1d1c', color: '#f3f3f3', cursor: 'pointer', textAlign: 'left', boxShadow: '0 14px 34px rgba(0,0,0,0.2)' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #5fa8ff 0%, #3f7ad9 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 18 }}>♟</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>{family.family}</div>
                <div style={{ fontSize: 15, color: '#cfcfcf' }}>{family.count} opening lines</div>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && searching && searchResults.length === 0 ? <div style={{ marginTop: 40, color: '#aaa', textAlign: 'center' }}>No openings found</div> : null}
      </div>
    </div>
  )
}
