import { useNavigate } from 'react-router-dom'

function StudyCard({
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
          fontSize: 26,
          marginBottom: 18,
        }}
      >
        {icon}
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        {title}
      </div>

      <div
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: '#cfcfcf',
        }}
      >
        {subtitle}
      </div>
    </button>
  )
}

export default function EndgameStudiesPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #2b2623 0%, #231f1d 100%)',
        color: '#f3f3f3',
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 20px 60px' }}>
        {/* Top */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 30,
          }}
        >
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>Endgame Studies</div>
            <div style={{ color: '#cfcfcf', fontSize: 14 }}>
              Advanced theoretical and tablebase-style endgames
            </div>
          </div>

          <button
            onClick={() => navigate('/endgames')}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              background: '#1f1d1c',
              color: '#d0d0d0',
              border: '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
            maxWidth: 900,
          }}
        >
          <StudyCard
            title="KQ vs KR"
            subtitle="Win against best defense with queen vs rook."
            icon="♛"
            accent="linear-gradient(135deg, #4f7cac 0%, #35597d 100%)"
            onClick={() => navigate('/endgame-studies/kqkr')}
          />

          <StudyCard
            title="KQ vs Pawn (7th)"
            subtitle="Stop promotion and avoid stalemate tricks."
            icon="♟️"
            accent="linear-gradient(135deg, #8f6a3e 0%, #5c4326 100%)"
            onClick={() => navigate('/endgame-studies/kqkp7')}
          />

          <StudyCard
            title="KNN vs KP"
            subtitle="Win with two knights only when a pawn exists."
            icon="♞"
            accent="linear-gradient(135deg, #6f8f3e 0%, #3f5c26 100%)"
            onClick={() => navigate('/endgame-studies/knnkp')}
          />

          <StudyCard
            title="KPK"
            subtitle="Opposition, key squares, triangulation, critical theory."
            icon="♔"
            accent="linear-gradient(135deg, #a98245 0%, #6e532a 100%)"
            onClick={() => navigate('/endgame-studies/kpk')}
          />

          <StudyCard
            title="Zugzwang"
            subtitle="Waiting moves, mutual zugzwang, only-move positions."
            icon="⏳"
            accent="linear-gradient(135deg, #7b5c91 0%, #4a365e 100%)"
            onClick={() => navigate('/endgame-studies/zugzwang')}
          />

          <StudyCard
            title="Pawn Endgames"
            subtitle="Passed pawns, races, breakthroughs, outside pawn."
            icon="♙"
            accent="linear-gradient(135deg, #3e8f7a 0%, #245a4f 100%)"
            onClick={() => navigate('/endgame-studies/pawns')}
          />
        </div>
      </div>
    </div>
  )
}