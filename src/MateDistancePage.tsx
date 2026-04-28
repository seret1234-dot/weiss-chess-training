import { useParams } from 'react-router-dom'

export default function MateDistancePage() {
  const { level } = useParams()
  const mateLabel =
    level === 'm1' ? 'Mate in 1' :
    level === 'm2' ? 'Mate in 2' :
    level === 'm3' ? 'Mate in 3' :
    level === 'm4' ? 'Mate in 4' :
    level === 'm5' ? 'Mate in 5' :
    level === 'm6' ? 'Mate in 6' :
    level === 'm7' ? 'Mate in 7' :
    level === 'm8' ? 'Mate in 8' :
    'Mate Themes'

  function Card({
    title,
    subtitle,
    icon,
    accent,
    href,
  }: {
    title: string
    subtitle: string
    icon: string
    accent: string
    href: string
  }) {
    return (
      <button
        onClick={() => {
          window.location.href = href
        }}
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

  const themes = [
    {
      title: 'Back Rank',
      subtitle: 'Classic back rank mating patterns',
      icon: '♜',
      accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
      href: `/mates/${level}/back-rank`,
    },
    {
      title: 'Arabian',
      subtitle: 'Knight and rook mating motif',
      icon: '♞',
      accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)',
      href: `/mates/${level}/arabian`,
    },
    {
      title: 'Anastasia',
      subtitle: 'Knight and rook net against the king',
      icon: '♞',
      accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)',
      href: `/mates/${level}/anastasia`,
    },
    {
      title: 'Boden',
      subtitle: 'Crossed bishops mating pattern',
      icon: '♝',
      accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)',
      href: `/mates/${level}/boden`,
    },
    {
      title: 'Smothered',
      subtitle: 'Knight mate with trapped king',
      icon: '♞',
      accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)',
      href: `/mates/${level}/smothered`,
    },
    {
      title: 'Hook',
      subtitle: 'Hook mate attacking pattern',
      icon: '♜',
      accent: 'linear-gradient(135deg, #6bc1a3 0%, #3d8f75 100%)',
      href: `/mates/${level}/hook`,
    },
    {
      title: 'Greco',
      subtitle: 'Classic Greco mating pattern',
      icon: '♛',
      accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)',
      href: `/mates/${level}/greco`,
    },
    {
      title: 'Corridor',
      subtitle: 'Horizontal and vertical king restriction mate',
      icon: '♜',
      accent: 'linear-gradient(135deg, #d85c8a 0%, #a02f5a 100%)',
      href: `/mates/${level}/corridor`,
    },
    {
      title: 'Dovetail',
      subtitle: 'Queen-supported boxed king mate',
      icon: '♛',
      accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
      href: `/mates/${level}/dovetail`,
    },
    {
      title: 'Epaulette',
      subtitle: 'King trapped by its own pieces',
      icon: '♛',
      accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)',
      href: `/mates/${level}/epaulette`,
    },
    {
      title: 'Lolli',
      subtitle: 'Typical Lolli mating net',
      icon: '♛',
      accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)',
      href: `/mates/${level}/lolli`,
    },
    {
      title: 'Morphy',
      subtitle: 'Open-line attacking mating pattern',
      icon: '♜',
      accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)',
      href: `/mates/${level}/morphy`,
    },
    {
      title: 'Damiano',
      subtitle: 'Damiano mate pattern',
      icon: '♛',
      accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)',
      href: `/mates/${level}/damiano`,
    },
    {
      title: 'Blackburne',
      subtitle: 'Blackburne mating construction',
      icon: '♝',
      accent: 'linear-gradient(135deg, #6bc1a3 0%, #3d8f75 100%)',
      href: `/mates/${level}/blackburne`,
    },
    {
      title: 'Kill Box',
      subtitle: 'King boxed in for the final mate',
      icon: '♚',
      accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)',
      href: `/mates/${level}/kill-box`,
    },
    {
      title: 'Mixed',
      subtitle: 'Mixed mating themes together',
      icon: '♟',
      accent: 'linear-gradient(135deg, #d85c8a 0%, #a02f5a 100%)',
      href: `/mates/${level}/mixed`,
    },
  ]

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
          <button
            onClick={() => {
              window.location.href = '/mates'
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.06)',
              background: '#1f1d1c',
              color: '#f3f3f3',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ← Back
          </button>

          <div style={{ fontSize: 26, fontWeight: 800 }}>{mateLabel}</div>

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
            Choose mate theme
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
            Mate training
          </div>

          <h1
            style={{
              fontSize: 52,
              lineHeight: 1.05,
              margin: '0 0 16px',
              maxWidth: 780,
            }}
          >
            {mateLabel} themes
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
            Choose one mating motif and train it separately before mixing patterns together.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 20,
          }}
        >
          {themes.map((theme) => (
            <Card
              key={theme.title}
              title={theme.title}
              subtitle={theme.subtitle}
              icon={theme.icon}
              accent={theme.accent}
              href={theme.href}
            />
          ))}
        </div>
      </div>
    </div>
  )
}