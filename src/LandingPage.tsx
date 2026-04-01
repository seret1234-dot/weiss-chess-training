import { useNavigate } from 'react-router-dom'

type LandingPageProps = {
  onSelectCategory?: (category: 'mates' | 'tactics' | 'endgame' | 'master-games') => void
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
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 30,
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 800 }}>Chess Trainer</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 999,
                background: '#1f1d1c',
                fontSize: 14,
                color: '#d0d0d0',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              Pattern-first training
            </div>

            <button
              onClick={() => navigate('/auth')}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                background: '#81b64c',
                color: '#fff',
                border: 'none',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}
            >
              Sign in
            </button>
          </div>
        </div>

        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(127,166,80,0.18) 0%, rgba(242,193,78,0.12) 100%)',
            borderRadius: 28,
            padding: 34,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
            marginBottom: 26,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              fontSize: 13,
              fontWeight: 700,
              color: '#f2c14e',
              background: 'rgba(0,0,0,0.22)',
              padding: '8px 12px',
              borderRadius: 999,
              marginBottom: 16,
            }}
          >
            Choose your training category
          </div>

          <h1
            style={{
              fontSize: 52,
              lineHeight: 1.05,
              margin: '0 0 16px',
              maxWidth: 780,
            }}
          >
            Build automatic pattern recognition
          </h1>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: '#d7d7d7',
              maxWidth: 800,
              margin: 0,
            }}
          >
            Start by choosing what you want to train. Mates for direct king attacks,
            tactics for combinations and calculation, endgame for technical winning
            and drawing patterns, master games for memorizing great games move by move,
            and board vision for instant square recognition.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 20,
            marginBottom: 28,
          }}
        >
          <CategoryCard
            title="Mates"
            subtitle="Train mate patterns by distance and motif."
            icon="♚"
            accent="linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)"
            onClick={() => navigate('/mates')}
          />

          <CategoryCard
            title="Tactics"
            subtitle="Train forks, pins, skewers, sacrifices and combinations."
            icon="⚔️"
            accent="linear-gradient(135deg, #c57b57 0%, #9b5939 100%)"
            onClick={() => {}}
          />

          <CategoryCard
            title="End Game"
            subtitle="Train technical endgames and conversion technique."
            icon="♟️"
            accent="linear-gradient(135deg, #4f7cac 0%, #35597d 100%)"
            onClick={() => navigate('/endgame')}
          />

          <CategoryCard
            title="Master Games"
            subtitle="Replay famous games and build memory."
            icon="👑"
            accent="linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"
            onClick={() => navigate('/master-games')}
          />

          <CategoryCard
            title="Board Vision"
            subtitle="Train instant recognition of squares, colors, diagonals and board geometry."
            icon="🎯"
            accent="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
            onClick={() => navigate('/board-vision')}
          />
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
          <StatCard value="150" label="Fast solves to master chunk" />
          <StatCard value="≤ 10s" label="Fast solve target" />
        </div>
      </div>
    </div>
  )
}