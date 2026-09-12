import { Link, useLocation } from 'react-router-dom'
import { createHierarchyNavigationState } from './navigation/hierarchicalBack.mjs'
import { useHierarchicalNavigation } from './navigation/useHierarchicalNavigation'

export type TacticThemeCard = {
 key: string
 title: string
 count: number
 href: string
}

function getThemeInitial(title: string) {
 const cleaned = title.replace(/\/.*/, '').replace(/\+.*/, '').trim()
 const words = cleaned.split(/\s+/).filter(Boolean)
 return words.length >= 2 ? `${words[0][0]}${words[1][0]}`.toUpperCase() : cleaned.slice(0, 2).toUpperCase()
}

function getIconBackground(index: number, isMixed: boolean) {
 if (isMixed) return 'linear-gradient(135deg, #f5c33b, #6aa84f)'
 const accents = [
  'linear-gradient(135deg, #6aa84f, #8cc152)',
  'linear-gradient(135deg, #d1874f, #c65f48)',
  'linear-gradient(135deg, #4c89c9, #3f6fab)',
  'linear-gradient(135deg, #9b6bd3, #7447b8)',
  'linear-gradient(135deg, #f5c33b, #d59a2f)',
  'linear-gradient(135deg, #5e9ca0, #417f83)',
 ]
 return accents[index % accents.length]
}

export default function TacticThemeSelectionPage({
 title,
 cards,
 parentHref,
 contextLabel,
 description,
}: {
 title: string
 cards: TacticThemeCard[]
 parentHref: string
 contextLabel?: string
 description?: string
}) {
 const location = useLocation()
 const { backToParent } = useHierarchicalNavigation()
 const total = cards.reduce((sum, card) => sum + card.count, 0)

 return (
  <div style={{ minHeight: '100vh', padding: '34px 22px 90px', color: '#f4f4f0', background: 'radial-gradient(circle at top center, rgba(94, 72, 42, 0.28), transparent 35%), linear-gradient(135deg, #1f1b19 0%, #221d1a 48%, #181514 100%)' }}>
   <section style={{ maxWidth: 1160, margin: '0 auto' }}>
    <div style={{ marginBottom: 16 }}>
     <button onClick={() => backToParent(parentHref)} style={{ color: 'rgba(244,244,240,0.78)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 800 }}>
      Back to {contextLabel ?? 'Tactics'}
     </button>
    </div>

    <div style={{ borderRadius: 20, padding: '24px 26px', background: 'linear-gradient(135deg, rgba(73, 66, 42, 0.92), rgba(56, 48, 34, 0.94))', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 55px rgba(0,0,0,0.30)', marginBottom: 18 }}>
     <div style={{ color: '#f5c33b', fontWeight: 950, fontSize: 16, marginBottom: 9, letterSpacing: '0.05em' }}>
      {cards.length} TRAINERS / {total.toLocaleString()} PUZZLES
     </div>
     <h1 style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 50px)', lineHeight: 1.02, letterSpacing: '-0.045em' }}>{title}</h1>
     <p style={{ maxWidth: 710, margin: '12px 0 0', color: 'rgba(244,244,240,0.76)', lineHeight: 1.5, fontSize: 18 }}>
      {description ?? 'Choose a tactical motif. Each trainer is focused and ordered from easier puzzles to harder puzzles.'}
     </p>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(285px, 1fr))', gap: 14 }}>
     {cards.map((card, index) => {
      const isMixed = card.key === 'mixed'
      return (
       <Link key={card.key} to={card.href} state={createHierarchyNavigationState(location.pathname)} style={{ textDecoration: 'none', color: 'inherit', minHeight: 150, borderRadius: 18, padding: 22, border: isMixed ? '1px solid rgba(245,195,59,0.28)' : '1px solid rgba(255,255,255,0.07)', background: isMixed ? 'linear-gradient(135deg, rgba(245,195,59,0.12), rgba(255,255,255,0.04))' : 'rgba(255,255,255,0.035)', boxShadow: '0 14px 34px rgba(0,0,0,0.22)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
         <div style={{ width: 62, height: 62, flex: '0 0 auto', borderRadius: 18, display: 'grid', placeItems: 'center', background: getIconBackground(index, isMixed), color: '#201a13', fontWeight: 950, fontSize: 20 }}>{getThemeInitial(card.title)}</div>
         <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 23, fontWeight: 950, lineHeight: 1.18, letterSpacing: '-0.015em' }}>{card.title}</div>
          <div style={{ marginTop: 8, color: isMixed ? '#f5c33b' : 'rgba(244,244,240,0.64)', fontSize: 16, fontWeight: 800 }}>{card.count.toLocaleString()} puzzles</div>
         </div>
        </div>
       </Link>
      )
     })}
    </div>
   </section>
  </div>
 )
}
