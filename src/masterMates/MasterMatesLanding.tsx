import MateLandingPage, { type MateDistanceCard } from '../MateLandingPage'
import { masterMateLabel, type MasterMateCatalog, type MasterMateDistance } from './data'

export default function MasterMatesLanding({ catalog }: { catalog: MasterMateCatalog }) {
 const cards: MateDistanceCard[] = ([1, 2, 3, 4] as MasterMateDistance[]).map((distance, index) => ({
  title: masterMateLabel(distance),
  subtitle: `${Object.values(catalog.distances[String(distance)] ?? {}).reduce((sum, value) => sum + value, 0)} real master-game mates`,
  icon: '♚',
  accent: [
   'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
   'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)',
   'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)',
   'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)',
  ][index],
  href: `/master-mates/${distance}`,
 }))

 return <MateLandingPage title="Master Mates" contextLabel="Real master games" heroBadge="Master Mates" heroTitle="Train real master-game mates" heroDescription="Practice verified mating positions from historic master games, with separate Master progress." cards={cards} />
}

