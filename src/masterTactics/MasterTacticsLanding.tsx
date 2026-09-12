import { TacticsLandingPage, type TacticsLevelCard } from '../TacticsPage'
import { masterTacticDistanceLabel, type MasterTacticCatalog, type MasterTacticDistance } from './data'

export default function MasterTacticsLanding({ catalog }: { catalog: MasterTacticCatalog }) {
 const levels: TacticsLevelCard[] = ([1, 2, 3, 4] as MasterTacticDistance[]).map((distance) => {
  const count = (catalog.tactics[String(distance)]?.count ?? 0) + (catalog.mixed[String(distance)]?.count ?? 0)
  return {
   id: String(distance),
   icon: distance === 4 ? '4+' : String(distance),
   title: masterTacticDistanceLabel(distance),
   subtitle: `${count.toLocaleString()} real master-game tactics`,
   description: distance === 1 ? 'Fast tactical recognition from real master games.' : distance === 4 ? 'Deep master-game tactical calculation.' : `Calculate ${distance} learner moves through the tactic.`,
   href: `/master-tactics/${distance}`,
  }
 })
 const total = levels.reduce((sum, level) => sum + Number(level.subtitle.replace(/\D/g, '')), 0)
 return <TacticsLandingPage title="Master Tactics" description="Train proven tactical ideas from real master games with the same progression as regular Tactics. Master progress is tracked separately." levels={levels} showAutoTraining={false} showRegularIntroduction={false} parentHref="/" stats={[[total.toLocaleString(), 'Course memberships'], [String(catalog.canonicalPuzzleCount.toLocaleString()), 'Canonical Master puzzles'], ['30', 'Puzzles per chunk'], ['Real', 'Master-game positions']]} />
}

