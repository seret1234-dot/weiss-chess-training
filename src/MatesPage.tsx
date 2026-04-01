export default function MatesPage() {
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
              window.location.href = '/'
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

          <div style={{ fontSize: 26, fontWeight: 800 }}>Mate Themes</div>

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
            Choose mate pattern
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
            Choose your mate pattern
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
            Start with one motif and build automatic recognition through repetition.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 20,
          }}
        >
          <Card
            title="Back Rank"
            subtitle="Train classic mate-in-1 back rank patterns with chunk mastery and fast-solve tracking."
            icon="♜"
            accent="linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)"
            href="/backrank"
          />

          <Card
            title="Anastasia"
            subtitle="Train Anastasia mate patterns on a dedicated page with the same trainer structure."
            icon="♞"
            accent="linear-gradient(135deg, #c57b57 0%, #9b5939 100%)"
            href="/anastasia"
          />
        </div>
      </div>
    </div>
  )
}