import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import MasterMatesLanding from './MasterMatesLanding'
import {readPublicHubCatalog} from '../seo/publicShellSnapshot'
import MateThemeSelectionPage, { type MateThemeCard } from '../MateThemeSelectionPage'
import MasterMateTrainer from './MasterMateTrainer'
import {
 formatMasterMateTheme,
 loadMasterMateCatalog,
 masterMateLabel,
 type MasterMateCatalog,
 type MasterMateDistance,
 type MasterMateTheme,
} from './data'

const themePresentation: Record<MasterMateTheme, Omit<MateThemeCard, 'title' | 'href'>> = {
 smothered: { subtitle: 'Knight mate with a trapped king', icon: '♞', accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)' },
 'back-rank': { subtitle: 'Classic back rank mating patterns', icon: '♟', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)' },
 arabian: { subtitle: 'Knight and rook mating motif', icon: '♟', accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)' },
 anastasia: { subtitle: 'Knight and rook net against the king', icon: '♟', accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)' },
 boden: { subtitle: 'Crossed bishops mating pattern', icon: '♟', accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)' },
 hook: { subtitle: 'Hook mate attacking pattern', icon: '♟', accent: 'linear-gradient(135deg, #6bc1a3 0%, #3d8f75 100%)' },
 dovetail: { subtitle: 'Queen-supported boxed king mate', icon: '♟', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)' },
 'double-bishop': { subtitle: 'Two bishops mating pattern', icon: 'B', accent: 'linear-gradient(135deg, #4f8cff, #9b5cff)' },
 'kill-box-adjacent-rook': { subtitle: 'Queen-supported rook mate beside the boxed king', icon: '♜', accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)' },
 'kill-box-rook-rail': { subtitle: 'Queen-supported rook mate from a two-square rail', icon: '♜', accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)' },
 'kill-box-queen-fence': { subtitle: 'Adjacent queen mate with a rook fencing the king', icon: '♛', accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)' },
 mixed: { subtitle: 'Real master-game mates beyond the named patterns', icon: '♟', accent: 'linear-gradient(135deg, #d85c8a 0%, #a02f5a 100%)' },
}

function isDistance(value: string | undefined): value is `${MasterMateDistance}` {
 return value === '1' || value === '2' || value === '3' || value === '4'
}

function LoadingMasterMates() {
 return <div role="status" aria-live="polite" style={{ minHeight: '100vh', padding: 32, color: '#f3f3f3', background: '#231f1d' }}><span role="heading" aria-level={1}>Loading Master Mates…</span></div>
}


function MasterMateDistancePage({ catalog, distance }: { catalog: MasterMateCatalog; distance: MasterMateDistance }) {
 const counts = catalog.distances[String(distance)]
 const cards = useMemo(() => {
  const normalThemes = [...catalog.primaryOrder, 'mixed' as const].filter((theme) => !theme.startsWith('kill-box-') && (counts?.[theme] ?? 0) > 0)
  const themeCards: MateThemeCard[] = normalThemes.map((theme) => ({
   title: formatMasterMateTheme(theme), href: `/master-mates/${distance}/${theme}`, ...themePresentation[theme],
  }))
  const killBoxCount = (counts?.['kill-box-adjacent-rook'] ?? 0) + (counts?.['kill-box-rook-rail'] ?? 0) + (counts?.['kill-box-queen-fence'] ?? 0)
  if (killBoxCount > 0) {
   themeCards.splice(Math.max(0, themeCards.length - 1), 0, {
    title: 'Kill Box', subtitle: 'Choose a focused Kill Box mating pattern', icon: '♜', accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)', href: `/master-mates/${distance}/kill-box`,
   })
  }
  return themeCards
 }, [catalog.primaryOrder, counts, distance])

 return <MateThemeSelectionPage title={`Master ${masterMateLabel(distance)}`} contextLabel="Choose Master Mate theme" heroTitle={`Master ${masterMateLabel(distance)} themes`} heroDescription="Choose a real master-game mating motif and train it with the same progression as regular Mates." cards={cards} parentHref="/master-mates" />
}

function MasterKillBoxFamilyPage({ catalog, distance }: { catalog: MasterMateCatalog; distance: MasterMateDistance }) {
 const counts = catalog.distances[String(distance)]
 const themes: MasterMateTheme[] = ['kill-box-adjacent-rook', 'kill-box-rook-rail', 'kill-box-queen-fence']
 const cards = themes.filter((theme) => (counts?.[theme] ?? 0) > 0).map((theme) => ({
  title: formatMasterMateTheme(theme), href: `/master-mates/${distance}/${theme}`, ...themePresentation[theme],
 }))
 return <MateThemeSelectionPage title={`Master Kill Box: ${masterMateLabel(distance)}`} contextLabel="Choose Kill Box pattern" heroTitle="Kill Box patterns" heroDescription="Choose one focused real-master-game Kill Box pattern and train it separately." cards={cards} parentHref={`/master-mates/${distance}`} />
}

export default function MasterMatesPage() {
 const { distance: rawDistance, theme: rawTheme } = useParams()
 const [catalog, setCatalog] = useState<MasterMateCatalog | null>(()=>readPublicHubCatalog<MasterMateCatalog>('/master-mates'))
 const [error, setError] = useState<string | null>(null)

 useEffect(() => {
  let active = true
  loadMasterMateCatalog().then((value) => {
   if (active) setCatalog(value)
  }).catch((cause) => {
   if (active) setError(cause instanceof Error ? cause.message : 'Could not load Master Mates')
  })
  return () => { active = false }
 }, [])

 if (error) return <div role="alert" style={{ minHeight: '100vh', padding: 32, color: '#f3f3f3', background: '#231f1d' }}><span role="heading" aria-level={1}>Master Mates is unavailable</span>: {error}</div>
 if (!catalog) return <LoadingMasterMates />
 if (!rawDistance) return <MasterMatesLanding catalog={catalog} />
 if (!isDistance(rawDistance)) return <div role="heading" aria-level={1} style={{ padding: 32, color: '#fff' }}>That Master Mate distance does not exist.</div>

 const distance = Number(rawDistance) as MasterMateDistance
 if (!rawTheme) return <MasterMateDistancePage catalog={catalog} distance={distance} />
 if (rawTheme === 'kill-box') return <MasterKillBoxFamilyPage catalog={catalog} distance={distance} />
 if (!(rawTheme in themePresentation) || (catalog.distances[rawDistance]?.[rawTheme as MasterMateTheme] ?? 0) === 0) {
  return <div role="heading" aria-level={1} style={{ padding: 32, color: '#fff' }}>That Master Mate course does not exist.</div>
 }

 return <MasterMateTrainer distance={distance} theme={rawTheme as MasterMateTheme} />
}
