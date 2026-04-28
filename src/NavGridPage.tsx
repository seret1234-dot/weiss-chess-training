import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { trainingCatalog, type NavCard } from './trainingCatalog'

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

function findNode(path: string, nodes: NavCard[]): NavCard | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(path, node.children)
      if (found) return found
    }
  }
  return null
}

export default function NavGridPage() {
  const location = useLocation()

  const current = useMemo(() => {
    return findNode(location.pathname, trainingCatalog)
  }, [location.pathname])

  const cards = current?.children ?? trainingCatalog
  const title = current?.title ?? 'Chess Training'
  const subtitle = current?.subtitle ?? 'Choose a training section'

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
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
          {title}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 20,
          }}
        >
          {cards.map((item) => (
            <Card
              key={item.path}
              title={item.title}
              subtitle={item.subtitle}
              icon={item.icon}
              accent={item.accent}
              href={item.path}
            />
          ))}
        </div>
      </div>
    </div>
  )
}