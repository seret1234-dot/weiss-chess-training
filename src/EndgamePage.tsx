import { useNavigate } from 'react-router-dom'

function EndgameCard({
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

      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
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

export default function EndgamePage() {
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
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
              End Game
            </div>
            <div style={{ fontSize: 15, color: '#cfcfcf' }}>
              Essential theoretical endgames and winning technique
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              background: '#1f1d1c',
              fontSize: 14,
              color: '#d0d0d0',
              border: '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer',
            }}
          >
            ← Back to Home
          </button>
        </div>

        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(79,124,172,0.18) 0%, rgba(242,193,78,0.12) 100%)',
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
            Endgame training
          </div>

          <h1
            style={{
              fontSize: 48,
              lineHeight: 1.05,
              margin: '0 0 16px',
              maxWidth: 780,
            }}
          >
            Build reliable endgame technique
          </h1>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: '#d7d7d7',
              maxWidth: 820,
              margin: 0,
            }}
          >
            Train fundamental theoretical positions step by step, starting with
            core mating patterns and later expanding into broader practical endgames.
          </p>
        </div>

        {/* ✅ FIXED GRID (2 columns) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
            maxWidth: 700,
          }}
        >
          <EndgameCard
            title="Piece Mates"
            subtitle="Learn the key checkmating methods with limited material."
            icon="♟️"
            accent="linear-gradient(135deg, #4f7cac 0%, #35597d 100%)"
            onClick={() => navigate('/endgame/piece-mates')}
          />

          {/* ✅ NEW CARD */}
          <EndgameCard
            title="Endgame Studies"
            subtitle="Study advanced theoretical endgames like KQ vs KR, pawn races, zugzwang, and fortress positions."
            icon="📚"
            accent="linear-gradient(135deg, #8f6a3e 0%, #5c4326 100%)"
            onClick={() => navigate('/endgame-studies')}
          />
        </div>
      </div>
    </div>
  )
}