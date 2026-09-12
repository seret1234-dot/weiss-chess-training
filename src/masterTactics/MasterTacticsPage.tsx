import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import MasterTacticsLanding from './MasterTacticsLanding'
import {readPublicHubCatalog} from '../seo/publicShellSnapshot'
import TacticThemeSelectionPage, { type TacticThemeCard } from '../TacticThemeSelectionPage'
import { tacticThemeCatalog } from '../tacticThemeCatalog'
import MasterTacticTrainer from './MasterTacticTrainer'
import { formatMasterTacticTheme, loadMasterTacticCatalog, masterTacticDistanceLabel, type MasterTacticCatalog, type MasterTacticDistance } from './data'

function isDistance(value: string | undefined): value is `${MasterTacticDistance}` {
 return value === '1' || value === '2' || value === '3' || value === '4'
}

function LoadingMasterTactics() {
 return <div role="status" aria-live="polite" style={{ minHeight: '100vh', padding: 32, color: '#f3f3f3', background: '#231f1d' }}><span role="heading" aria-level={1}>Loading Master Tactics…</span></div>
}


function MasterTacticDistancePage({ catalog, distance }: { catalog: MasterTacticCatalog; distance: MasterTacticDistance }) {
 const level = `m${distance}` as const
 const counts = catalog.tactics[String(distance)]?.themes ?? {}
 const cards = useMemo(() => {
  const result: TacticThemeCard[] = tacticThemeCatalog
   .filter((theme) => theme.key !== 'mixed' && theme.distances.includes(level) && (counts[theme.slug] ?? 0) > 0)
   .map((theme) => ({ key: theme.slug, title: theme.title, count: counts[theme.slug], href: `/master-tactics/${distance}/${theme.slug}` }))
  const mixedCount = catalog.mixed[String(distance)]?.count ?? 0
  if (mixedCount > 0) result.push({ key: 'mixed', title: 'Mixed', count: mixedCount, href: `/master-tactics/${distance}/mixed` })
  return result
 }, [counts, distance, level])
 return <TacticThemeSelectionPage title={`Master ${masterTacticDistanceLabel(distance)}`} cards={cards} parentHref="/master-tactics" contextLabel="Master Tactics" description="Choose a proven tactical motif from real master games, or train the verified Mixed course." />
}

export default function MasterTacticsPage() {
 const { distance: rawDistance, theme: rawTheme } = useParams()
 const [catalog, setCatalog] = useState<MasterTacticCatalog | null>(()=>readPublicHubCatalog<MasterTacticCatalog>('/master-tactics'))
 const [error, setError] = useState<string | null>(null)
 useEffect(() => {
  let active = true
  loadMasterTacticCatalog().then((value) => { if (active) setCatalog(value) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load Master Tactics') })
  return () => { active = false }
 }, [])
 if (error) return <div role="alert" style={{ minHeight: '100vh', padding: 32, color: '#f3f3f3', background: '#231f1d' }}><span role="heading" aria-level={1}>Master Tactics is unavailable</span>: {error}</div>
 if (!catalog) return <LoadingMasterTactics />
 if (!rawDistance) return <MasterTacticsLanding catalog={catalog} />
 if (!isDistance(rawDistance)) return <div role="heading" aria-level={1} style={{ padding: 32, color: '#fff' }}>That Master Tactics distance does not exist.</div>
 const distance = Number(rawDistance) as MasterTacticDistance
 if (!rawTheme) return <MasterTacticDistancePage catalog={catalog} distance={distance} />
 const count = rawTheme === 'mixed' ? catalog.mixed[rawDistance]?.count ?? 0 : catalog.tactics[rawDistance]?.themes?.[rawTheme] ?? 0
 const regularTheme = tacticThemeCatalog.find((theme) => theme.slug === rawTheme && theme.distances.includes(`m${distance}` as 'm1' | 'm2' | 'm3' | 'm4'))
 if (count <= 0 || (rawTheme !== 'mixed' && !regularTheme)) return <div role="heading" aria-level={1} style={{ padding: 32, color: '#fff' }}>That Master Tactics course does not exist.</div>
 return <MasterTacticTrainer distance={distance} theme={rawTheme} />
}

export { formatMasterTacticTheme }
