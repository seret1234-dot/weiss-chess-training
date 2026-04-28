import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { trainingCatalog } from './trainingCatalog'
import SemiStudyBanner from './components/SemiStudyBanner'
import { getOrCreateAutoProfile } from './training/getOrCreateAutoProfile'

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
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 22,
        padding: 24,
        background: '#1f1d1c',
        color: '#f3f3f3',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: '0 14px 34px rgba(0,0,0,0.2)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 18px 40px rgba(0,0,0,0.28)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0px)'
        e.currentTarget.style.boxShadow = '0 14px 34px rgba(0,0,0,0.2)'
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
          color: '#cfcfcf',
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
        background: '#1f1d1c',
        borderRadius: 18,
        padding: '18px 16px',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: '#f2c14e',
          marginBottom: 6,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 14, color: '#bdbdbd' }}>{label}</div>
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
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #2b2623 0%, #231f1d 100%)',
        color: '#f3f3f3',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 20px 60px' }}>
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
          style={{
            background:
              'linear-gradient(135deg, rgba(127,166,80,0.18) 0%, rgba(242,193,78,0.12) 100%)',
            borderRadius: 28,
            padding: 34,
            border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 20,
          }}
        >
          <h1 style={{ fontSize: 48, margin: '0 0 16px' }}>
            Build automatic pattern recognition
          </h1>

          <p style={{ fontSize: 18, color: '#d7d7d7', marginBottom: 20 }}>
            Train mates, tactics, endgames, openings and memory using structured chunks.
          </p>

          <button
            onClick={() => navigate('/auto')}
            style={{
              padding: '14px 22px',
              borderRadius: 999,
              background: '#f2c14e',
              color: '#1f1d1c',
              border: 'none',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Start Auto Training
          </button>
        </div>

        <div
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