import { useMemo } from 'react'
import PatternMateTrainer, { type PatternMatePuzzle } from '../trainers/patternMate/PatternMateTrainer'
import MasterGamePlayerBar from '../components/chess/MasterGamePlayerBar'
import { orientMasterGamePlayers } from '../components/chess/masterGamePlayerLabels.mjs'
import MasterMateProvenanceCard from './MasterMateProvenanceCard'
import { resolveMateExplanationKey } from '../content/trainerExplanationKeys'
import {
 createMasterMateCourseDataSource,
 formatMasterMateTheme,
 masterMateLabel,
 type MasterMateDistance,
 type MasterMateTheme,
} from './data'

export default function MasterMateTrainer({ distance, theme }: { distance: MasterMateDistance; theme: MasterMateTheme }) {
 const dataSource = useMemo(() => createMasterMateCourseDataSource(distance, theme), [distance, theme])
 const title = `${formatMasterMateTheme(theme)}: ${masterMateLabel(distance)}`
 const explanationKey = resolveMateExplanationKey(theme)
 if (!explanationKey) throw new Error(`Missing Master Mate explanation mapping for ${theme}`)
 const backHref = theme.startsWith('kill-box-')
  ? `/master-mates/${distance}/kill-box`
  : `/master-mates/${distance}`

 const renderBoardPlayerLabels = (puzzle: PatternMatePuzzle | null, orientation: 'white' | 'black') => {
  const game = puzzle?.masterProvenance?.masterGame
  if (!game) return null
  const players = orientMasterGamePlayers({
   white: String(game.white ?? ''),
   black: String(game.black ?? ''),
   orientation,
   whiteMeta: String(game.year ?? game.date ?? ' - '),
   blackMeta: String(game.site ?? ' - '),
  })
  return {
   top: <MasterGamePlayerBar player={players.topPlayer} />,
   bottom: <MasterGamePlayerBar player={players.bottomPlayer} />,
  }
 }

 return (
  <PatternMateTrainer
   config={{
    trainerKey: `master-mates:${distance}:${theme}`,
    trainerTitle: title,
    dataBasePath: 'master-mates-remote',
    dataSource,
    explanationKey,
    backHref,
    renderPuzzleInfo: (puzzle, solved) => <MasterMateProvenanceCard puzzle={puzzle} solved={solved} />,
    renderBoardPlayerLabels,
   }}
  />
 )
}
