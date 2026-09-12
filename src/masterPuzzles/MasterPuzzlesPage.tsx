import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import ThemedChessboard from '../theme/ThemedChessboard'
import { loadMasterProgress, saveMasterProgress, type MasterSection } from './progress'
import { requestMasterPuzzleData } from './dataSource'

type Ref = { id: string; chunk: number }
type Puzzle = {
  id: string; fen: string; learnerSide: 'w' | 'b'; learningDistance: number; primaryTheme: string | null; secondaryMotifs: string[]
  solution: { offset: number; side: 'learner' | 'opponent'; uci: string; san?: string }[]
  acceptedLearnerMoves: { plyOffset: number; canonicalMove: string; acceptedEquivalentMoves: string[] }[]
  equivalentOpponentDefenses: { plyOffset: number; canonicalMove: string; equivalentDefenses: string[] }[]
  provenance: { masterGame: Record<string, string | undefined>; historicalMoveSan: string; historicalMoveUci: string }
}
type Catalog = { canonicalPuzzleCount: number; tactics: Record<string, { count: number }>; mates: Record<string, { count: number }> }
type DistanceIndex = { themes: Record<string, number> }
type CourseIndex = { refs: Ref[] }

const tacticLabels = ['Tactic in 1', 'Tactic in 2', 'Tactic in 3', 'Tactic in 4+']
const label = (distance: number, mates: boolean) => mates ? `Mate in ${distance === 4 ? '4+' : distance}` : tacticLabels[distance - 1]

export default function MasterPuzzlesPage({ section }: { section: MasterSection }) {
  const { distance, theme } = useParams()
  const mates = section === 'mates'
  const parsedDistance = Number(distance)
  const validDistance = [1, 2, 3, 4].includes(parsedDistance)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [distanceIndex, setDistanceIndex] = useState<DistanceIndex | null>(null)
  const [courseIndex, setCourseIndex] = useState<CourseIndex | null>(null)
  const [selected, setSelected] = useState(0)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [fen, setFen] = useState('')
  const [feedback, setFeedback] = useState('')
  const [step, setStep] = useState(0)

  useEffect(() => { requestMasterPuzzleData<Catalog>('catalog.json').then(setCatalog).catch(() => setCatalog(null)) }, [])
  useEffect(() => {
    setDistanceIndex(null)
    if (!validDistance || mates || theme) return
    requestMasterPuzzleData<DistanceIndex>(`indexes/tactics-distance-${parsedDistance}.json`).then(setDistanceIndex).catch(() => setDistanceIndex(null))
  }, [mates, parsedDistance, theme, validDistance])
  useEffect(() => {
    setCourseIndex(null); setSelected(0)
    if (!validDistance || (!mates && !theme)) return
    const file = mates
      ? `indexes/mates-distance-${parsedDistance}.json`
      : `indexes/tactics-course-${parsedDistance}-${encodeURIComponent(theme)}.json`
    requestMasterPuzzleData<CourseIndex>(file).then(setCourseIndex).catch(() => setCourseIndex(null))
  }, [mates, parsedDistance, theme, validDistance])

  const refs = courseIndex?.refs || []
  const ref = refs[selected]
  useEffect(() => {
    setPuzzle(null)
    if (!ref) return
    requestMasterPuzzleData<{ puzzles: Puzzle[] }>(`puzzles/chunk-${String(ref.chunk).padStart(5, '0')}.json`).then(payload => {
      const next = payload.puzzles.find(item => item.id === ref.id) || null
      setPuzzle(next); setFen(next?.fen || ''); setStep(0); setFeedback(next ? 'Find the best continuation.' : 'Puzzle payload is unavailable.')
    }).catch(() => setFeedback('Puzzle payload could not be loaded.'))
  }, [ref?.chunk, ref?.id])

  const course = mates ? `mates:${parsedDistance}` : `tactics:${parsedDistance}:${theme}`
  const boardWidth = typeof window === 'undefined' ? 520 : window.innerWidth < 700 ? Math.max(280, window.innerWidth - 36) : 620
  const overview = useMemo(() => [1, 2, 3, 4].map(value => ({ value, count: (mates ? catalog?.mates : catalog?.tactics)?.[String(value)]?.count || 0 })), [catalog, mates])

  function onDrop(from: string, to: string, promotion?: string) {
    if (!puzzle) return false
    const move = `${from}${to}${promotion || ''}`
    const expected = puzzle.solution.find(item => item.offset === step && item.side === 'learner')
    const accepted = [expected?.uci, ...(puzzle.acceptedLearnerMoves.find(item => item.plyOffset === step)?.acceptedEquivalentMoves || [])].filter(Boolean)
    if (!expected || !accepted.includes(move)) { setFeedback('Try another move.'); return false }
    const board = new Chess(fen)
    if (!board.move({ from, to, promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined })) return false
    let nextStep = step + 1
    while (puzzle.solution.find(item => item.offset === nextStep)?.side === 'opponent') {
      const reply = puzzle.solution.find(item => item.offset === nextStep)!
      board.move({ from: reply.uci.slice(0, 2), to: reply.uci.slice(2, 4), promotion: reply.uci[4] as 'q' | 'r' | 'b' | 'n' | undefined })
      nextStep += 1
    }
    setFen(board.fen()); setStep(nextStep)
    if (nextStep >= puzzle.solution.length) {
      const current = loadMasterProgress(section, course)
      saveMasterProgress(section, course, { ...current, attempted: current.attempted + 1, correct: current.correct + 1, masteredIds: [...new Set([...current.masteredIds, puzzle.id])], reviewedIds: [...new Set([...current.reviewedIds, puzzle.id])] })
      setFeedback(`Correct. Played in the game: ${puzzle.provenance.historicalMoveSan}`)
    } else setFeedback('Correct — continue.')
    return true
  }

  if (!distance) return <main style={pageStyle}><h1>Master {mates ? 'Mates' : 'Tactics'}</h1><p>Real positions from master games. Progress is separate from regular training.</p><div style={gridStyle}>{overview.map(({ value, count }) => <Link key={value} to={`/${mates ? 'master-mates' : 'master-tactics'}/${value}`} style={cardStyle}>{label(value, mates)}<br /><small>{count.toLocaleString()} real puzzles</small></Link>)}</div></main>
  if (!validDistance) return <main style={pageStyle}>That Master course does not exist.</main>
  if (!theme && !mates) return <main style={pageStyle}><Link to="/master-tactics">Back</Link><h1>{label(parsedDistance, false)}</h1>{!distanceIndex ? <p>Loading themes…</p> : <div style={gridStyle}>{Object.entries(distanceIndex.themes).map(([name, count]) => <Link key={name} to={`/master-tactics/${parsedDistance}/${encodeURIComponent(name)}`} style={cardStyle}>{name}<br /><small>{count.toLocaleString()} puzzles</small></Link>)}</div>}</main>
  if (!puzzle) return <main style={pageStyle}>Loading Master puzzle…</main>
  const game = puzzle.provenance.masterGame
  return <main style={{ ...pageStyle, maxWidth: 1160, margin: 'auto' }}><Link to={mates ? '/master-mates' : `/master-tactics/${parsedDistance}`}>Back</Link><h1>Master {mates ? 'Mates' : 'Tactics'} · {label(parsedDistance, mates)}</h1><div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 620px) minmax(250px, 1fr)', gap: 24, alignItems: 'start' }}><ThemedChessboard id="master-puzzle" position={fen} boardWidth={boardWidth} boardOrientation={puzzle.learnerSide === 'b' ? 'black' : 'white'} onPieceDrop={onDrop} /><section style={cardStyle}><b>{game.white} – {game.black}</b><p>{[game.event, game.site, game.date || game.year].filter(Boolean).join(', ')}<br />{game.result}</p><p>{feedback}</p><p>{mates ? label(parsedDistance, true) : `Theme: ${puzzle.primaryTheme || 'Master tactic'} · ${label(parsedDistance, false)}`}</p><p style={{ opacity: .8 }}>The historical game move remains visible after solving, even when a verified equivalent move is used.</p>{refs.length > 1 && <button onClick={() => setSelected((selected + 1) % refs.length)}>Next puzzle</button>}</section></div></main>
}

const pageStyle = { padding: '32px 18px 100px', color: '#fff' }
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }
const cardStyle = { padding: 20, borderRadius: 14, background: '#393027', color: '#fff', textDecoration: 'none' }
