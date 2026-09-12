import { useParams } from "react-router-dom"
import {
 tacticDistanceLabels,
 tacticThemeCatalog,
 type TacticDistanceId,
} from "./tacticThemeCatalog"
import TacticThemeSelectionPage from './TacticThemeSelectionPage'

function isTacticDistanceId(value: string | undefined): value is TacticDistanceId {
 return value === "m1" || value === "m2" || value === "m3" || value === "m4"
}

export default function TacticDistancePage() {
 const params = useParams()
 const level = isTacticDistanceId(params.level) ? params.level : "m1"
 const title = tacticDistanceLabels[level]

 const themes = tacticThemeCatalog.filter((theme) =>
 theme.distances.includes(level)
 )

 const cards = themes.map((theme) => ({
  key: theme.key,
  title: theme.title,
  count: (theme.countByDistance as Record<string, number>)[level] ?? 0,
  href: `/tactics/${level}/${theme.slug}`,
 }))

 return <TacticThemeSelectionPage title={title} cards={cards} parentHref="/tactics" />
}
