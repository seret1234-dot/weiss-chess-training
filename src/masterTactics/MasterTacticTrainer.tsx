import { useMemo } from 'react'
import PatternTacticTrainer, { type PatternTacticPuzzle } from '../trainers/patternTactic/PatternTacticTrainer'
import MasterGamePlayerBar from '../components/chess/MasterGamePlayerBar'
import { orientMasterGamePlayers } from '../components/chess/masterGamePlayerLabels.mjs'
import MasterProvenanceCard from '../masterPuzzles/MasterProvenanceCard'
import { resolveTacticExplanationKey } from '../content/trainerExplanationKeys'
import { createMasterTacticCourseDataSource, formatMasterTacticTheme, masterTacticDistanceLabel, type MasterTacticDistance } from './data'

export default function MasterTacticTrainer({ distance, theme }: { distance: MasterTacticDistance; theme: string }) {
 const dataSource = useMemo(() => createMasterTacticCourseDataSource(distance, theme), [distance, theme])
 const explanationKey = resolveTacticExplanationKey(theme)
 if (!explanationKey) throw new Error(`Missing Master Tactic explanation mapping for ${theme}`)
 const renderBoardPlayerLabels = (puzzle: PatternTacticPuzzle | null, orientation: 'white' | 'black') => {
  const game = puzzle?.masterProvenance?.masterGame
  if (!game) return null
  const players = orientMasterGamePlayers({ white: String(game.white ?? ''), black: String(game.black ?? ''), orientation, whiteMeta: String(game.year ?? game.date ?? ' - '), blackMeta: String(game.site ?? ' - ') })
  return { top: <MasterGamePlayerBar player={players.topPlayer} />, bottom: <MasterGamePlayerBar player={players.bottomPlayer} /> }
 }
 return <PatternTacticTrainer config={{
  trainerKey: `master-tactics:${distance}:${theme}`,
  trainerTitle: `${formatMasterTacticTheme(theme)}: ${masterTacticDistanceLabel(distance)}`,
  dataBasePath: 'master-tactics-remote',
  dataSource,
  explanationKey,
  backHref: `/master-tactics/${distance}`,
  renderPuzzleInfo: (puzzle, solved) => <MasterProvenanceCard provenance={puzzle?.masterProvenance} solved={solved} />,
  renderBoardPlayerLabels,
 }} />
}
