import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './lib/supabase'

type MasterGameItem = {
  id: number
  slug?: string
  title?: string
  white: string
  black: string
  result: string
  event?: string
  site?: string
  year?: number
  opening?: string
  eco?: string
  description?: string
  total_count?: number
}

type GameProgressState = {
  started: boolean
  mastered: boolean
  dueToday: boolean
  nextReviewAt: string | null
}

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 300
const REQUEST_TIMEOUT_MS = 12000
const TOTAL_GAMES_FALLBACK = 132365
const PLAYER_SUGGESTION_LIMIT = 8

function normalizeTitle(game: MasterGameItem) {
  return game.title || `${game.white} vs ${game.black}${game.year ? `, ${game.year}` : ''}`
}

function pageCountFrom(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Request timed out.')), ms)
    }),
  ])
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
  const [page, setPage] = useState(1)

  const [games, setGames] = useState<MasterGameItem[]>([])
  const [totalGames] = useState(TOTAL_GAMES_FALLBACK)
  const [resultsCount, setResultsCount] = useState(0)

  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [progressMap, setProgressMap] = useState<Record<string, GameProgressState>>({})
  const [progressLoading, setProgressLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [playerSuggestions, setPlayerSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showPlayerSuggestions, setShowPlayerSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)

  const latestRequestIdRef = useRef(0)
  const latestSuggestionRequestIdRef = useRef(0)
  const playerInputWrapRef = useRef<HTMLDivElement | null>(null)

  const debouncedFilters = useDebouncedValue(
    {
      query: query.trim(),
      player: player.trim(),
      opening: opening.trim(),
      event: event.trim(),
      result,
      colorFilter,
      yearFrom,
      yearTo,
      sortBy,
    },
    SEARCH_DEBOUNCE_MS,
  )

  const debouncedPlayerSuggestionQuery = useDebouncedValue(player.trim(), 150)

  const effectiveFilters = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(debouncedFilters.query)
    const normalizedPlayer = normalizeSearchValue(debouncedFilters.player)

    const sameQueryAndPlayer =
      normalizedQuery !== '' &&
      normalizedPlayer !== '' &&
      normalizedQuery === normalizedPlayer

    return {
      ...debouncedFilters,
      query: sameQueryAndPlayer ? '' : debouncedFilters.query,
    }
  }, [debouncedFilters])

  const hasActiveSearch = useMemo(() => {
    return Boolean(
      effectiveFilters.query ||
        effectiveFilters.player ||
        effectiveFilters.opening ||
        effectiveFilters.event ||
        effectiveFilters.result ||
        effectiveFilters.yearFrom ||
        effectiveFilters.yearTo ||
        effectiveFilters.colorFilter !== 'all',
    )
  }, [effectiveFilters])

  const searchIsTooShort = useMemo(() => {
    const values = [
      effectiveFilters.query,
      effectiveFilters.player,
      effectiveFilters.opening,
      effectiveFilters.event,
    ]
      .map((v) => v.trim())
      .filter(Boolean)

    if (values.length === 0) return false
    return values.every((v) => v.length < 2)
  }, [effectiveFilters])

  const requestKey = useMemo(() => {
    return JSON.stringify({
      effectiveFilters,
      hasActiveSearch,
      page,
      searchIsTooShort,
    })
  }, [effectiveFilters, hasActiveSearch, page, searchIsTooShort])

  useEffect(() => {
    setPage(1)
  }, [
    effectiveFilters.query,
    effectiveFilters.player,
    effectiveFilters.opening,
    effectiveFilters.event,
    effectiveFilters.result,
    effectiveFilters.colorFilter,
    effectiveFilters.yearFrom,
    effectiveFilters.yearTo,
    effectiveFilters.sortBy,
  ])

  useEffect(() => {
    let active = true

    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setCurrentUserId(data.user?.id ?? null)
    }

    void loadUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!playerInputWrapRef.current) return
      if (!playerInputWrapRef.current.contains(event.target as Node)) {
        setShowPlayerSuggestions(false)
        setActiveSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [])

  useEffect(() => {
    let active = true
    const requestId = ++latestSuggestionRequestIdRef.current

    async function loadPlayerSuggestions() {
      const q = debouncedPlayerSuggestionQuery

      if (q.length < 2) {
        setPlayerSuggestions([])
        setSuggestionsLoading(false)
        setActiveSuggestionIndex(-1)
        return
      }

      setSuggestionsLoading(true)

      try {
        const { data, error } = await withTimeout(
          supabase.rpc('master_game_player_suggestions', {
            p_query: q,
            p_limit: PLAYER_SUGGESTION_LIMIT,
          }),
          REQUEST_TIMEOUT_MS,
        )

        if (!active || requestId !== latestSuggestionRequestIdRef.current) return
        if (error) throw error

        const names = ((data ?? []) as Array<{ name: string }>).map((row) => row.name).filter(Boolean)

        setPlayerSuggestions(names)
        setActiveSuggestionIndex(names.length > 0 ? 0 : -1)
      } catch (err) {
        console.error('Failed to load player suggestions:', err)
        if (!active || requestId !== latestSuggestionRequestIdRef.current) return
        setPlayerSuggestions([])
        setActiveSuggestionIndex(-1)
      } finally {
        if (!active || requestId !== latestSuggestionRequestIdRef.current) return
        setSuggestionsLoading(false)
      }
    }

    void loadPlayerSuggestions()

    return () => {
      active = false
    }
  }, [debouncedPlayerSuggestionQuery])

  useEffect(() => {
    let active = true
    const requestId = ++latestRequestIdRef.current

    async function loadPage() {
      const hadResultsAlready = games.length > 0

      if (hadResultsAlready) {
        setRefreshing(true)
      } else {
        setInitialLoading(true)
      }

      setError('')

      try {
        const yearFromNum = effectiveFilters.yearFrom ? Number(effectiveFilters.yearFrom) : null
        const yearToNum = effectiveFilters.yearTo ? Number(effectiveFilters.yearTo) : null

        if (
          (effectiveFilters.yearFrom && !Number.isFinite(yearFromNum)) ||
          (effectiveFilters.yearTo && !Number.isFinite(yearToNum))
        ) {
          if (!active || requestId !== latestRequestIdRef.current) return
          setError('Year filters must be valid numbers.')
          setRefreshing(false)
          setInitialLoading(false)
          return
        }

        if (searchIsTooShort) {
          if (!active || requestId !== latestRequestIdRef.current) return
          setError('Type at least 2 letters for search.')
          setRefreshing(false)
          setInitialLoading(false)
          return
        }

        let rows: MasterGameItem[] = []

        const playerOnlySearch =
          effectiveFilters.player &&
          !effectiveFilters.query &&
          !effectiveFilters.opening &&
          !effectiveFilters.event &&
          !effectiveFilters.result &&
          !effectiveFilters.yearFrom &&
          !effectiveFilters.yearTo

        if (playerOnlySearch) {
          const { data, error } = await withTimeout(
            supabase.rpc('search_master_games_by_player', {
              p_player: effectiveFilters.player,
              p_color: effectiveFilters.colorFilter,
              p_page_num: page,
              p_page_size: PAGE_SIZE,
            }),
            REQUEST_TIMEOUT_MS,
          )

          if (!active || requestId !== latestRequestIdRef.current) return
          if (error) throw error

          rows = (data ?? []) as MasterGameItem[]
        } else if (hasActiveSearch) {
          const { data, error } = await withTimeout(
            supabase.rpc('search_master_games', {
              p_q: effectiveFilters.query,
              p_player: effectiveFilters.player,
              p_opening: effectiveFilters.opening,
              p_event: effectiveFilters.event,
              p_result: effectiveFilters.result,
              p_color: effectiveFilters.colorFilter,
              p_year_from: yearFromNum,
              p_year_to: yearToNum,
              p_sort: effectiveFilters.sortBy,
              p_page_num: page,
              p_page_size: PAGE_SIZE,
            }),
            REQUEST_TIMEOUT_MS,
          )

          if (!active || requestId !== latestRequestIdRef.current) return
          if (error) throw error

          rows = (data ?? []) as MasterGameItem[]
        } else {
          const { data, error } = await withTimeout(
            supabase.rpc('browse_master_games', {
              p_page_num: page,
              p_page_size: PAGE_SIZE,
            }),
            REQUEST_TIMEOUT_MS,
          )

          if (!active || requestId !== latestRequestIdRef.current) return
          if (error) throw error

          rows = (data ?? []) as MasterGameItem[]
        }

        const normalized = rows.map((g) => ({
          ...g,
          title: normalizeTitle(g),
        }))

        if (!active || requestId !== latestRequestIdRef.current) return

        setGames(normalized)
        setResultsCount(normalized[0]?.total_count ?? 0)
      } catch (err) {
        console.error('Failed to load master games:', err)
        if (!active || requestId !== latestRequestIdRef.current) return

        const message =
          err instanceof Error && err.message === 'Request timed out.'
            ? 'Search is taking too long. The SQL function still needs to be made lighter.'
            : 'Failed to load games.'

        setError(message)
      } finally {
        if (!active || requestId !== latestRequestIdRef.current) return
        setRefreshing(false)
        setInitialLoading(false)
      }
    }

    void loadPage()

    return () => {
      active = false
    }
  }, [requestKey])

  useEffect(() => {
    let active = true

    async function loadVisibleProgress() {
      if (!currentUserId) {
        setProgressMap({})
        setProgressLoading(false)
        return
      }

      const themeIds = games.map((g) => String(g.id))
      if (themeIds.length === 0) {
        setProgressMap({})
        setProgressLoading(false)
        return
      }

      setProgressLoading(true)

      const { data, error } = await supabase
        .from('training_progress')
        .select('theme, item_id, mastery, next_review_at')
        .eq('user_id', currentUserId)
        .eq('course', 'master_games')
        .in('theme', themeIds)

      if (!active) return

      if (error) {
        console.error('Failed to load master games progress:', error)
        setProgressMap({})
        setProgressLoading(false)
        return
      }

      const nextMap: Record<string, GameProgressState> = {}
      const now = Date.now()

      for (const themeId of themeIds) {
        nextMap[themeId] = {
          started: false,
          mastered: false,
          dueToday: false,
          nextReviewAt: null,
        }
      }

      for (const row of data ?? []) {
        const theme = String(row.theme ?? '')
        if (!theme) continue

        if (!nextMap[theme]) {
          nextMap[theme] = {
            started: false,
            mastered: false,
            dueToday: false,
            nextReviewAt: null,
          }
        }

        nextMap[theme].started = true

        const mastery = Number(row.mastery ?? 0)
        if (mastery >= 5) {
          nextMap[theme].mastered = true
        }

        const nextReviewAt = row.next_review_at ? String(row.next_review_at) : null
        if (nextReviewAt) {
          if (!nextMap[theme].nextReviewAt || nextReviewAt < nextMap[theme].nextReviewAt!) {
            nextMap[theme].nextReviewAt = nextReviewAt
          }

          const due = new Date(nextReviewAt).getTime()
          if (!Number.isNaN(due) && due <= now) {
            nextMap[theme].dueToday = true
          }
        }
      }

      setProgressMap(nextMap)
      setProgressLoading(false)
    }

    void loadVisibleProgress()

    return () => {
      active = false
    }
  }, [currentUserId, games])

  const firstDueGame = useMemo(() => {
    return games.find((game) => getProgressState(progressMap, game.id).dueToday) || null
  }, [games, progressMap])

  const totalPages = pageCountFrom(resultsCount)
  const canGoPrev = page > 1
  const canGoNext = page < totalPages
  const shouldShowPlayerSuggestions =
    showPlayerSuggestions && player.trim().length >= 2 && (playerSuggestions.length > 0 || suggestionsLoading)

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
    setPage(1)
    setShowPlayerSuggestions(false)
    setActiveSuggestionIndex(-1)
  }

  function quickPlayer(name: string) {
    setQuery('')
    setPlayer(name)
    setColorFilter('all')
    setPage(1)
    setShowPlayerSuggestions(false)
    setActiveSuggestionIndex(-1)
  }

  function applyPlayerSuggestion(name: string) {
    setPlayer(name)
    setPage(1)
    setShowPlayerSuggestions(false)
    setActiveSuggestionIndex(-1)
  }

  function handlePlayerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!shouldShowPlayerSuggestions || playerSuggestions.length === 0) {
      if (event.key === 'Escape') {
        setShowPlayerSuggestions(false)
        setActiveSuggestionIndex(-1)
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestionIndex((prev) => {
        if (prev < 0) return 0
        return Math.min(prev + 1, playerSuggestions.length - 1)
      })
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestionIndex((prev) => {
        if (prev <= 0) return 0
        return prev - 1
      })
      return
    }

    if (event.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < playerSuggestions.length) {
        event.preventDefault()
        applyPlayerSuggestion(playerSuggestions[activeSuggestionIndex])
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setShowPlayerSuggestions(false)
      setActiveSuggestionIndex(-1)
    }
  }

  function renderProgressBadge(gameId: number) {
    const progress = getProgressState(progressMap, gameId)

    if (progressLoading) {
      return <div style={{ ...styles.progressBadge, ...styles.progressBadgeIdle }}>...</div>
    }

    if (progress.mastered) {
      return <div style={{ ...styles.progressBadge, ...styles.progressBadgeMastered }}>Mastered</div>
    }

    if (progress.started) {
      return <div style={{ ...styles.progressBadge, ...styles.progressBadgeStarted }}>In progress</div>
    }

    return <div style={{ ...styles.progressBadge, ...styles.progressBadgeIdle }}>Not started</div>
  }

  function renderDueBadge(gameId: number) {
    const progress = getProgressState(progressMap, gameId)

    if (!progress.dueToday) return null

    return <div style={{ ...styles.progressBadge, ...styles.progressBadgeDue }}>Due today</div>
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
            <button style={styles.quickButton} onClick={() => quickPlayer('Fischer')}>
              Fischer
            </button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Kasparov')}>
              Kasparov
            </button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Carlsen')}>
              Carlsen
            </button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Tal')}>
              Tal
            </button>
            <button style={styles.quickButton} onClick={() => quickPlayer('Capablanca')}>
              Capablanca
            </button>

            {firstDueGame ? (
              <Link
                to={`/master-games/${encodeURIComponent(firstDueGame.slug || String(firstDueGame.id))}`}
                style={styles.continueReviewLink}
              >
                Continue review
              </Link>
            ) : null}
          </div>
        </div>

        <div style={styles.heroStats}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Total Games</div>
            <div style={styles.statValue}>{totalGames.toLocaleString()}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Results</div>
            <div style={styles.statValue}>
              {initialLoading && resultsCount === 0 ? '…' : resultsCount.toLocaleString()}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Page</div>
            <div style={styles.statValue}>
              {initialLoading && resultsCount === 0 ? '…' : `${page.toLocaleString()} / ${totalPages.toLocaleString()}`}
            </div>
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
            <div style={styles.inputWrap} ref={playerInputWrapRef}>
              <input
                style={styles.input}
                value={player}
                onChange={(e) => {
                  setPlayer(e.target.value)
                  setShowPlayerSuggestions(true)
                  setActiveSuggestionIndex(-1)
                }}
                onFocus={() => {
                  if (player.trim().length >= 2) {
                    setShowPlayerSuggestions(true)
                  }
                }}
                onKeyDown={handlePlayerKeyDown}
                placeholder="Search white or black player"
                autoComplete="off"
              />

              {shouldShowPlayerSuggestions ? (
                <div style={styles.suggestionsDropdown}>
                  {suggestionsLoading ? (
                    <div style={styles.suggestionItemMuted}>Searching...</div>
                  ) : playerSuggestions.length > 0 ? (
                    playerSuggestions.map((name, index) => (
                      <button
                        key={`${name}-${index}`}
                        type="button"
                        style={{
                          ...styles.suggestionItem,
                          ...(index === activeSuggestionIndex ? styles.suggestionItemActive : null),
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          applyPlayerSuggestion(name)
                        }}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                      >
                        {name}
                      </button>
                    ))
                  ) : (
                    <div style={styles.suggestionItemMuted}>No matches</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Opening</label>
            <input
              style={styles.input}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="Queen's Gambit, Sicilian..."
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Event</label>
            <input
              style={styles.input}
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="World Championship, Olympiad..."
            />
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
              placeholder="1850"
              inputMode="numeric"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Year to</label>
            <input
              style={styles.input}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="2025"
              inputMode="numeric"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Sort</label>
            <select style={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="player">Player</option>
              <option value="opening">Opening</option>
            </select>
          </div>
        </div>

        <div style={styles.filtersActions}>
          <button style={styles.clearButton} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      <div style={styles.resultsBar}>
        <div style={styles.resultsMeta}>
          {initialLoading && games.length === 0
            ? 'Loading…'
            : refreshing
              ? 'Refreshing…'
              : `${resultsCount.toLocaleString()} result${resultsCount === 1 ? '' : 's'}`}
        </div>

        <div style={styles.paginationControls}>
          <button style={styles.pageButton} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!canGoPrev || initialLoading || refreshing}>
            Prev
          </button>
          <div style={styles.pageText}>
            Page {page.toLocaleString()} / {totalPages.toLocaleString()}
          </div>
          <button
            style={styles.pageButton}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!canGoNext || initialLoading || refreshing}
          >
            Next
          </button>
        </div>
      </div>

      {error ? <div style={styles.errorBox}>{error}</div> : null}

      <div style={styles.cardsWrap}>
        {games.map((game) => {
          const routeValue = encodeURIComponent(game.slug || String(game.id))

          return (
            <Link key={game.id} to={`/master-games/${routeValue}`} style={styles.cardLink}>
              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <div style={styles.cardTitle}>{normalizeTitle(game)}</div>
                  <div style={styles.badgesRow}>
                    {renderDueBadge(game.id)}
                    {renderProgressBadge(game.id)}
                  </div>
                </div>

                <div style={styles.playersRow}>
                  <span style={styles.playerNameWhite}>{game.white}</span>
                  <span style={styles.vsText}>vs</span>
                  <span style={styles.playerNameBlack}>{game.black}</span>
                </div>

                <div style={styles.metaGrid}>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Year</span>
                    <span style={styles.metaValue}>{game.year ?? '—'}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Result</span>
                    <span style={styles.metaValue}>{game.result || '—'}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Event</span>
                    <span style={styles.metaValue}>{game.event || '—'}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Opening</span>
                    <span style={styles.metaValue}>{game.opening || '—'}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>ECO</span>
                    <span style={styles.metaValue}>{game.eco || '—'}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Site</span>
                    <span style={styles.metaValue}>{game.site || '—'}</span>
                  </div>
                </div>

                {game.description ? <div style={styles.description}>{game.description}</div> : null}
              </div>
            </Link>
          )
        })}
      </div>

      {!initialLoading && games.length === 0 && !error ? (
        <div style={styles.emptyState}>No games found for the current filters.</div>
      ) : null}

      <div style={{ ...styles.resultsBar, marginTop: 20 }}>
        <div style={styles.resultsMeta}>
          {!initialLoading && resultsCount > 0 ? `Showing ${games.length} on this page` : ''}
        </div>

        <div style={styles.paginationControls}>
          <button style={styles.pageButton} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!canGoPrev || initialLoading || refreshing}>
            Prev
          </button>
          <div style={styles.pageText}>
            Page {page.toLocaleString()} / {totalPages.toLocaleString()}
          </div>
          <button
            style={styles.pageButton}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!canGoNext || initialLoading || refreshing}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

function getProgressState(progressMap: Record<string, GameProgressState>, gameId: number): GameProgressState {
  return (
    progressMap[String(gameId)] || {
      started: false,
      mastered: false,
      dueToday: false,
      nextReviewAt: null,
    }
  )
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value)
    }, delayMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [value, delayMs])

  return debounced
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#161512',
    color: '#f3f3f3',
    padding: '32px 20px 48px',
    fontFamily: 'Arial, sans-serif',
  },
  hero: {
    maxWidth: 1320,
    margin: '0 auto 20px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 16,
    alignItems: 'stretch',
  },
  heroTextWrap: {
    background: '#211f1c',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 20,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: 800,
    color: '#9fc59f',
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: '10px 0 0',
    color: '#cfcfcf',
    maxWidth: 780,
    lineHeight: 1.5,
  },
  quickButtonsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
    alignItems: 'center',
  },
  quickButton: {
    background: '#2f4f2f',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  continueReviewLink: {
    textDecoration: 'none',
    color: '#fff',
    background: '#4d7c4d',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 800,
  },
  heroStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(140px, 1fr))',
    gap: 12,
  },
  statCard: {
    background: '#211f1c',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 18,
    minWidth: 140,
  },
  statLabel: {
    fontSize: 12,
    color: '#b9b9b9',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 26,
    fontWeight: 800,
  },
  filtersPanel: {
    maxWidth: 1320,
    margin: '0 auto 18px',
    background: '#211f1c',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 18,
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    position: 'relative',
  },
  label: {
    fontSize: 13,
    color: '#c8c8c8',
    fontWeight: 700,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#2b2825',
    color: '#f5f5f5',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '11px 12px',
    outline: 'none',
  },
  select: {
    background: '#2b2825',
    color: '#f5f5f5',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '11px 12px',
    outline: 'none',
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    background: '#25221f',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
    overflow: 'hidden',
    zIndex: 50,
  },
  suggestionItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    color: '#f5f5f5',
    border: 'none',
    padding: '11px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  suggestionItemActive: {
    background: '#34302c',
  },
  suggestionItemMuted: {
    padding: '11px 12px',
    color: '#bfbfbf',
    fontSize: 14,
  },
  filtersActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  clearButton: {
    background: '#34302c',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  resultsBar: {
    maxWidth: 1320,
    margin: '0 auto 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  resultsMeta: {
    color: '#cbcbcb',
    fontSize: 14,
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  pageButton: {
    background: '#2f4f2f',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  pageText: {
    color: '#d5d5d5',
    fontSize: 14,
    minWidth: 110,
    textAlign: 'center',
  },
  cardsWrap: {
    maxWidth: 1320,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 14,
  },
  cardLink: {
    textDecoration: 'none',
    color: 'inherit',
  },
  card: {
    background: '#211f1c',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 18,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: 800,
    lineHeight: 1.25,
  },
  badgesRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  playersRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    fontSize: 16,
  },
  playerNameWhite: {
    color: '#ffffff',
    fontWeight: 700,
  },
  playerNameBlack: {
    color: '#d0d0d0',
    fontWeight: 700,
  },
  vsText: {
    color: '#9e9e9e',
    fontWeight: 700,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  },
  metaItem: {
    background: '#2a2724',
    borderRadius: 12,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: '#a9a9a9',
    fontWeight: 700,
  },
  metaValue: {
    fontSize: 14,
    color: '#f1f1f1',
    lineHeight: 1.35,
  },
  description: {
    color: '#cfcfcf',
    lineHeight: 1.45,
    fontSize: 14,
  },
  progressBadge: {
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  progressBadgeIdle: {
    background: '#34312d',
    color: '#d2d2d2',
  },
  progressBadgeStarted: {
    background: '#735b22',
    color: '#fff0c2',
  },
  progressBadgeMastered: {
    background: '#2f5f39',
    color: '#d9ffe1',
  },
  progressBadgeDue: {
    background: '#7a332c',
    color: '#ffd7d2',
  },
  errorBox: {
    maxWidth: 1320,
    margin: '0 auto 16px',
    background: '#40211f',
    color: '#ffd4d0',
    border: '1px solid rgba(255,120,120,0.3)',
    borderRadius: 14,
    padding: 14,
  },
  emptyState: {
    maxWidth: 1320,
    margin: '24px auto 0',
    background: '#211f1c',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 24,
    color: '#d1d1d1',
    textAlign: 'center',
  },
}