import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { trainingCatalog } from './trainingCatalog'
import SemiStudyBanner from './components/SemiStudyBanner'
import { getOrCreateAutoProfile } from './training/getOrCreateAutoProfile'
import './CategoryLandingPages.css'

type LandingPageProps = {
 onSelectCategory?: (category: string) => void
}

function CategoryCard({
 title,
 subtitle,
 icon,
 accent,
 onClick,
}: {
 title: string
 subtitle: string
 icon: string
 accent: string
 onClick: () => void
}) {
 return (
 <button
 onClick={onClick}
 style={{
 width: '100%',
 border: '1px solid var(--theme-border)',
 borderRadius: 22,
 padding: 24,
 background: 'var(--theme-panel)',
 color: 'var(--theme-text)',
 cursor: 'pointer',
 textAlign: 'left',
 boxShadow: 'var(--theme-card-shadow)',
 transition: 'transform 0.15s ease, box-shadow 0.15s ease',
 }}
 onMouseEnter={(e) => {
 e.currentTarget.style.transform = 'translateY(-2px)'
 e.currentTarget.style.boxShadow = 'var(--theme-shadow)'
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.transform = 'translateY(0px)'
 e.currentTarget.style.boxShadow = 'var(--theme-card-shadow)'
 }}
 >
 <div
 style={{
 width: 56,
 height: 56,
 borderRadius: 16,
 background: accent,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 fontSize: 28,
 marginBottom: 18,
 }}
 >
 {icon}
 </div>

 <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>
 {title}
 </div>

 <div
 style={{
 fontSize: 15,
 lineHeight: 1.6,
 color: 'var(--theme-muted)',
 }}
 >
 {subtitle}
 </div>
 </button>
 )
}

function StatCard({ value, label }: { value: string; label: string }) {
 return (
 <div
 style={{
 background: 'var(--theme-panel)',
 borderRadius: 18,
 padding: '18px 16px',
 textAlign: 'center',
 border: '1px solid var(--theme-border)',
 }}
 >
 <div
 style={{
 fontSize: 30,
 fontWeight: 800,
 color: 'var(--theme-accent-strong)',
 marginBottom: 6,
 }}
 >
 {value}
 </div>
 <div style={{ fontSize: 14, color: 'var(--theme-muted)' }}>{label}</div>
 </div>
 )
}

export default function LandingPage({ onSelectCategory }: LandingPageProps) {
 const navigate = useNavigate()
 const [user, setUser] = useState<any>(null)
 const [profile, setProfile] = useState<any>(null)

 useEffect(() => {
 async function loadInitial() {
 const { data } = await supabase.auth.getSession()
 const u = data.session?.user ?? null
 setUser(u)

 if (u) {
 await getOrCreateAutoProfile(u.id)

 const { data: p } = await supabase
 .from('profiles')
 .select('*')
 .eq('id', u.id)
 .single()

 setProfile(p ?? null)
 } else {
 setProfile(null)
 }
 }

 loadInitial()

 const { data: listener } = supabase.auth.onAuthStateChange(async (_e, session) => {
 const u = session?.user ?? null
 setUser(u)

 if (u) {
 await getOrCreateAutoProfile(u.id)

 const { data: p } = await supabase
 .from('profiles')
 .select('*')
 .eq('id', u.id)
 .single()

 setProfile(p ?? null)
 } else {
 setProfile(null)
 }
 })

 return () => listener.subscription.unsubscribe()
 }, [])

 return (
 <div
 className="catalog-page catalog-page--home"
 style={{
 minHeight: '100vh',
 background: 'var(--theme-page-bg)',
 color: 'var(--theme-text)',
 fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
 }}
 >
 <div className="catalog-page__content" style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 20px 60px' }}>
 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 marginBottom: 30,
 }}
 >
 <div style={{ fontSize: 26, fontWeight: 800 }}>
 Weiss Chess Trainer
 </div>
 </div>

 <SemiStudyBanner user={user} profile={profile} />

 <div
 className="catalog-page__hero"
 style={{
 background:
 'var(--theme-hero-bg)',
 borderRadius: 28,
 padding: 34,
 border: '1px solid var(--theme-border)',
 marginBottom: 20,
 }}
 >
 <h1 style={{ fontSize: 'clamp(30px, 8vw, 48px)', lineHeight: 1.08, margin: '0 0 16px' }}>
 Build automatic pattern recognition
 </h1>

 <p style={{ fontSize: 18, color: 'var(--theme-muted)', marginBottom: 20 }}>
 Train tactics, openings and endgames with structured repetition instead of random puzzles.
 </p>

 <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
 <button
 onClick={() => navigate(user ? '/auto' : '/auth?mode=signup')}
 style={{
 padding: '14px 22px',
 borderRadius: 999,
 background: 'var(--theme-accent)',
 color: 'var(--theme-accent-text)',
 border: 'none',
 fontSize: 16,
 fontWeight: 800,
 cursor: 'pointer',
 }}
 >
 {user ? 'Start Auto Training' : 'Create Free Account'}
 </button>
 </div>
 </div>

 <section
 style={{
 background: 'var(--theme-panel)',
 border: '1px solid var(--theme-border)',
 borderRadius: 22,
 padding: 28,
 marginBottom: 28,
 }}
 >
 <h2 style={{ fontSize: 26, margin: '0 0 12px' }}>How it works</h2>
 <p style={{ margin: 0, color: 'var(--theme-muted)', fontSize: 16, lineHeight: 1.7 }}>
 Weiss Chess Trainer turns broad chess study into short, repeatable sessions. Instead of presenting unrelated positions, it groups tactical motifs, mating patterns, opening lines, and endgame ideas so you meet each idea in a clear progression. Structured repetition brings useful positions back when they need review, rather than leaving progress to chance. If you connect a Chess.com account, recent games can be analyzed to surface mistakes, openings, tactics, and endgames worth practicing; your personal plan can then recommend a next task. Start with <Link to="/tactics">Tactics</Link>, build reliable <Link to="/openings">Opening</Link> memory, or practice practical <Link to="/endgame">Endgames</Link>.
 </p>
 </section>

 <div
 className="catalog-page__grid"
 style={{
 display: 'grid',
 gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
 gap: 20,
 marginBottom: 28,
 }}
 >
 {trainingCatalog.map((item) => (
 <CategoryCard
 key={item.path}
 title={item.title}
 subtitle={item.subtitle}
 icon={item.icon}
 accent={item.accent}
 onClick={() => {
 onSelectCategory?.(item.title)
 navigate(item.path)
 }}
 />
 ))}
 </div>

 <div
 className="catalog-page__stats"
 style={{
 display: 'grid',
 gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
 gap: 16,
 }}
 >
 <StatCard value="30" label="Puzzles per chunk" />
 <StatCard value="5" label="Fast solves per puzzle" />
 <StatCard value="<3s" label="Fast per move" />
 <StatCard value="Auto" label="Adaptive training" />
 </div>
 </div>
 </div>
 )
}
