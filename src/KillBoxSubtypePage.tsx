import { Navigate, useParams } from "react-router-dom"
import MateThemeSelectionPage, { type MateThemeCard } from "./MateThemeSelectionPage"
import createPatternMatePage from "./trainers/patternMate/createPatternMatePage"
import {
 type KillBoxSubpattern,
 getKillBoxSubpatternPageConfig,
} from "./trainers/patternMate/pageConfigs"

const subpatterns = new Set<KillBoxSubpattern>(["adjacent-rook", "rook-rail", "queen-fence"])
const distances = new Set(["m1", "m2", "m3", "m4", "m5"])

function KillBoxFamilyPage({ level }: { level: string }) {
 const mateDistance = Number(level.slice(1))
 const cards: MateThemeCard[] = [
  { title: "Kill Box — Adjacent Rook", subtitle: "Queen-supported rook mate beside the boxed king", icon: "♜", accent: "linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)", href: `/mates/${level}/kill-box-adjacent-rook` },
  { title: "Kill Box — Rook Rail", subtitle: "Queen-supported rook mate from a two-square rail", icon: "♜", accent: "linear-gradient(135deg, #c57b57 0%, #9b5939 100%)", href: `/mates/${level}/kill-box-rook-rail` },
  { title: "Kill Box — Queen Fence", subtitle: "Adjacent queen mate with a rook fencing the king", icon: "♛", accent: "linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)", href: `/mates/${level}/kill-box-queen-fence` },
 ]

 return (
  <MateThemeSelectionPage
   title={`Kill Box: Mate in ${mateDistance}`}
   contextLabel="Choose Kill Box pattern"
   heroTitle="Kill Box patterns"
   heroDescription="Choose one Kill Box mating pattern and train it separately."
   cards={cards}
   parentHref={`/mates/${level}`}
  />
 )
}

export default function KillBoxSubtypePage() {
 const { level, subpattern: routeSubpattern } = useParams()
 const subpattern = routeSubpattern?.replace(/^kill-box-/, '')
 if (!level || !distances.has(level)) {
  return <Navigate replace to="/mates" />
 }
 if (!subpattern) return <KillBoxFamilyPage level={level} />
 if (!subpatterns.has(subpattern as KillBoxSubpattern)) return <Navigate replace to="/mates" />

 const Page = createPatternMatePage(
  getKillBoxSubpatternPageConfig(subpattern as KillBoxSubpattern, Number(level.slice(1)) as 1 | 2 | 3 | 4 | 5),
 )
 return <Page />
}
