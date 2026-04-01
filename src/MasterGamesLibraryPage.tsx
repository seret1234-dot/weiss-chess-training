import games from "./data/masterGamesIndex.json"
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type MasterGameItem = {
  id: string
  title?: string
  white: string
  black: string
  result: string
  event?: string
  site?: string
  date?: string
  year?: number
  opening?: string
  eco?: string
  tags?: string[]
  route?: string
  description?: string
}

const MASTER_GAMES: MasterGameItem[] = (games as MasterGameItem[]).map((g) => ({
  ...g,
  route: g.route || `/master-games/${g.id}`,
  title: g.title || `${g.white} vs ${g.black}${g.year ? `, ${g.year}` : ''}`,
}))

function safeLower(value?: string) {
  return (value || '').toLowerCase()
}

function getYearFromGame(game: MasterGameItem) {
  if (game.year) return game.year
  if (game.date && game.date.length >= 4) {
    const y = Number(game.date.slice(0, 4))
    return Number.isFinite(y) ? y : undefined
  }
  return undefined
}

export default function MasterGamesLibraryPage() {
  const [query, setQuery] = useState('')
  const [player, setPlayer] = useState('')
  const [opening, setOpening] = useState('')
  const [event, setEvent] = useState('')
  const [result, setResult] = useState('')
  const [colorFilter, setColorFilter] = useState<'all' | 'white' | 'black'>('all')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'player' | 'opening'>('newest')

  const uniqueOpenings = useMemo(() => {
    return Array.from(new Set(MASTER_GAMES.map(g => g.opening).filter(Boolean) as string[])).sort()
  }, [])

  const uniqueEvents = useMemo(() => {
    return Array.from(new Set(MASTER_GAMES.map(g => g.event).filter(Boolean) as string[])).sort()
  }, [])

  const filteredGames = useMemo(() => {
    const q = query.trim().toLowerCase()
    const p = player.trim().toLowerCase()
    const o = opening.trim().toLowerCase()
    const e = event.trim().toLowerCase()
    const yf = yearFrom ? Number(yearFrom) : null
    const yt = yearTo ? Number(yearTo) : null

    let results = MASTER_GAMES.filter((g) => {
      const year = getYearFromGame(g)

      const matchesQuery =
        !q ||
        safeLower(g.title).includes(q) ||
        safeLower(g.white).includes(q) ||
        safeLower(g.black).includes(q) ||
        safeLower(g.opening).includes(q) ||
        safeLower(g.event).includes(q) ||
        safeLower(g.site).includes(q) ||
        safeLower(g.eco).includes(q) ||
        (g.tags || []).some(tag => tag.toLowerCase().includes(q)) ||
        safeLower(g.description).includes(q)

      const matchesPlayer =
        !p ||
        safeLower(g.white).includes(p) ||
        safeLower(g.black).includes(p)

      const matchesOpening =
        !o ||
        safeLower(g.opening).includes(o)

      const matchesEvent =
        !e ||
        safeLower(g.event).includes(e)

      const matchesResult =
        !result || g.result === result

      const matchesColor =
        colorFilter === 'all' ||
        (colorFilter === 'white' && !!p && safeLower(g.white).includes(p)) ||
        (colorFilter === 'black' && !!p && safeLower(g.black).includes(p))

      const matchesYearFrom =
        yf === null || (year !== undefined && year >= yf)

      const matchesYearTo =
        yt === null || (year !== undefined && year <= yt)

      return (
        matchesQuery &&
        matchesPlayer &&
        matchesOpening &&
        matchesEvent &&
        matchesResult &&
        matchesColor &&
        matchesYearFrom &&
        matchesYearTo
      )
    })

    results = [...results].sort((a, b) => {
      const ay = getYearFromGame(a) || 0
      const by = getYearFromGame(b) || 0

      if (sortBy === 'newest') return by - ay
      if (sortBy === 'oldest') return ay - by
      if (sortBy === 'player') return a.white.localeCompare(b.white)
      if (sortBy === 'opening') return (a.opening || '').localeCompare(b.opening || '')
      return 0
    })

    return results
  }, [query, player, opening, event, result, colorFilter, yearFrom, yearTo, sortBy])

  const totalGames = MASTER_GAMES.length

  function clearFilters() {
    setQuery('')
    setPlayer('')
    setOpening('')
    setEvent('')
    setResult('')
    setColorFilter('all')
    setYearFrom('')
    setYearTo('')
    setSortBy('newest')
  }

  function quickPlayer(name: string) {
    setPlayer(name)
    setColorFilter('all')
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.heroTextWrap}>
          <div style={styles.kicker}>MASTER GAMES</div>
          <h1 style={styles.title}>Master Game Library</h1>
          <p style={styles.subtitle}>
            Search classic games by player, opening, event, year, result, and more.
          </p>

          <div style={styles.quickButtonsRow}>
            <button style={styles.quickButton} onClick={() => quickPlayer('Fischer')}>Fischer</button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Kasparov')}>Kasparov</button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Capablanca')}>Capablanca</button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Tal')}>Tal</button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Karpov')}>Karpov</button>
          </div>
        </div>

        <div style={styles.heroStats}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Total Games</div>
            <div style={styles.statValue}>{totalGames}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Results Shown</div>
            <div style={styles.statValue}>{filteredGames.length}</div>
          </div>
        </div>
      </div>

      <div style={styles.filtersPanel}>
        <div style={styles.filtersGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Search anything</label>
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fischer, Sicilian, world championship, D59..."
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Player</label>
            <input
              style={styles.input}
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="Search white or black player"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Opening</label>
            <input
              style={styles.input}
              list="openings-list"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="Queen's Gambit, Sicilian..."
            />
            <datalist id="openings-list">
              {uniqueOpenings.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Event</label>
            <input
              style={styles.input}
              list="events-list"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="World Championship, Olympiad..."
            />
            <datalist id="events-list">
              {uniqueEvents.map((ev) => (
                <option key={ev} value={ev} />
              ))}
            </datalist>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Result</label>
            <select style={styles.select} value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">All</option>
              <option value="1-0">1-0</option>
              <option value="0-1">0-1</option>
              <option value="1/2-1/2">1/2-1/2</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Player color</label>
            <select
              style={styles.select}
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value as 'all' | 'white' | 'black')}
            >
              <option value="all">All</option>
              <option value="white">As White</option>
              <option value="black">As Black</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Year from</label>
            <input
              style={styles.input}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="1900"
              inputMode="numeric"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Year to</label>
            <input
              style={styles.input}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="2026"
              inputMode="numeric"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Sort by</label>
            <select
              style={styles.select}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'player' | 'opening')}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="player">Player name</option>
              <option value="opening">Opening</option>
            </select>
          </div>
        </div>

        <div style={styles.filterButtons}>
          <button style={styles.clearButton} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      <div style={styles.resultsHeader}>
        <h2 style={styles.resultsTitle}>Games</h2>
        <div style={styles.resultsCount}>{filteredGames.length} found</div>
      </div>

      <div style={styles.cardsGrid}>
        {filteredGames.map((game) => (
          <Link key={game.id} to={game.route || `/master-games/${game.id}`} style={styles.cardLink}>
            <div style={styles.card}>
              <div style={styles.cardTop}>
                <div style={styles.cardTitle}>{game.title}</div>
                <div style={styles.resultBadge}>{game.result}</div>
              </div>

              <div style={styles.players}>
                <span style={styles.playerWhite}>{game.white}</span>
                <span style={styles.vs}>vs</span>
                <span style={styles.playerBlack}>{game.black}</span>
              </div>

              <div style={styles.metaList}>
                <div style={styles.metaRow}>
                  <span style={styles.metaLabel}>Opening:</span>
                  <span style={styles.metaValue}>{game.opening || '—'}</span>
                </div>
                <div style={styles.metaRow}>
                  <span style={styles.metaLabel}>Event:</span>
                  <span style={styles.metaValue}>{game.event || '—'}</span>
                </div>
                <div style={styles.metaRow}>
                  <span style={styles.metaLabel}>Year:</span>
                  <span style={styles.metaValue}>{getYearFromGame(game) || '—'}</span>
                </div>
                <div style={styles.metaRow}>
                  <span style={styles.metaLabel}>ECO:</span>
                  <span style={styles.metaValue}>{game.eco || '—'}</span>
                </div>
              </div>

              {game.description ? (
                <div style={styles.description}>{game.description}</div>
              ) : null}

              {game.tags?.length ? (
                <div style={styles.tags}>
                  {game.tags.map((tag) => (
                    <span key={tag} style={styles.tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      {filteredGames.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyTitle}>No games found</div>
          <div style={styles.emptyText}>Try another player, opening, year range, or clear filters.</div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f1115',
    color: '#f5f7fb',
    padding: '24px'
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: '1.8fr 0.8fr',
    gap: '18px',
    marginBottom: '24px'
  },
  heroTextWrap: {
    background: 'linear-gradient(135deg, #171b24, #10141c)',
    border: '1px solid #2b3342',
    borderRadius: '20px',
    padding: '24px'
  },
  kicker: {
    fontSize: '12px',
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    color: '#8ea3c7',
    marginBottom: '10px'
  },
  title: {
    margin: 0,
    fontSize: '34px',
    lineHeight: 1.1
  },
  subtitle: {
    marginTop: '12px',
    marginBottom: '18px',
    color: '#b9c4d8',
    fontSize: '16px',
    maxWidth: '720px'
  },
  heroStats: {
    display: 'grid',
    gap: '18px'
  },
  statCard: {
    background: '#171b24',
    border: '1px solid #2b3342',
    borderRadius: '20px',
    padding: '22px'
  },
  statLabel: {
    color: '#9badc9',
    fontSize: '13px',
    marginBottom: '8px'
  },
  statValue: {
    fontSize: '36px',
    fontWeight: 700
  },
  quickButtonsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px'
  },
  quickButton: {
    background: '#202837',
    color: '#edf2ff',
    border: '1px solid #34415a',
    borderRadius: '999px',
    padding: '10px 14px',
    cursor: 'pointer'
  },
  filtersPanel: {
    background: '#171b24',
    border: '1px solid #2b3342',
    borderRadius: '20px',
    padding: '20px',
    marginBottom: '22px'
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '13px',
    color: '#aebad0'
  },
  input: {
    background: '#0f131a',
    color: '#f5f7fb',
    border: '1px solid #30394a',
    borderRadius: '12px',
    padding: '12px 14px',
    outline: 'none'
  },
  select: {
    background: '#0f131a',
    color: '#f5f7fb',
    border: '1px solid #30394a',
    borderRadius: '12px',
    padding: '12px 14px',
    outline: 'none'
  },
  filterButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '14px'
  },
  clearButton: {
    background: '#263349',
    color: '#edf2ff',
    border: '1px solid #3b4d6b',
    borderRadius: '12px',
    padding: '10px 16px',
    cursor: 'pointer'
  },
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  resultsTitle: {
    margin: 0,
    fontSize: '24px'
  },
  resultsCount: {
    color: '#aebad0'
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px'
  },
  cardLink: {
    textDecoration: 'none',
    color: 'inherit'
  },
  card: {
    background: '#171b24',
    border: '1px solid #2b3342',
    borderRadius: '18px',
    padding: '18px',
    height: '100%',
    transition: 'transform 0.15s ease'
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    lineHeight: 1.25
  },
  resultBadge: {
    background: '#263349',
    border: '1px solid #42557a',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    whiteSpace: 'nowrap'
  },
  players: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '14px',
    color: '#dbe5f7',
    flexWrap: 'wrap'
  },
  playerWhite: {
    fontWeight: 600
  },
  playerBlack: {
    fontWeight: 600
  },
  vs: {
    color: '#8da0bf'
  },
  metaList: {
    display: 'grid',
    gap: '8px'
  },
  metaRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start'
  },
  metaLabel: {
    minWidth: '62px',
    color: '#8ea3c7',
    fontSize: '13px'
  },
  metaValue: {
    color: '#edf2ff',
    fontSize: '14px'
  },
  description: {
    marginTop: '14px',
    color: '#b8c4d9',
    fontSize: '14px',
    lineHeight: 1.5
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '14px'
  },
  tag: {
    background: '#101722',
    border: '1px solid #2d3a50',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#b9c8e1'
  },
  emptyState: {
    marginTop: '24px',
    background: '#171b24',
    border: '1px solid #2b3342',
    borderRadius: '18px',
    padding: '26px',
    textAlign: 'center'
  },
  emptyTitle: {
    fontSize: '22px',
    fontWeight: 700,
    marginBottom: '8px'
  },
  emptyText: {
    color: '#aebad0'
  }
}