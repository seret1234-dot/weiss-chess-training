import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'

type OpeningLine = {
  id: string
  slug: string
  name: string
  family?: string | null
  family_slug?: string | null
  variation?: string | null
  subvariation?: string | null
  eco?: string | null
  ply_count?: number | null
}

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function lineSearchText(line: OpeningLine) {
  return [line.name, line.family, line.family_slug, line.variation, line.subvariation, line.eco]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function OpeningFamilyPage() {
  const { familySlug } = useParams()
  const navigate = useNavigate()

  const [lines, setLines] = useState<OpeningLine[]>([])
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    void loadLines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familySlug])

  async function loadLines() {
    if (!familySlug) return

    setLoading(true)
    setErrorText('')

    const { data, error } = await supabase
      .from('opening_lines')
      .select(
        `
          id,
          slug,
          name,
          family,
          family_slug,
          variation,
          subvariation,
          eco,
          ply_count
        `,
      )
      .eq('family_slug', familySlug)
      .not('slug', 'is', null)
      .order('name', { ascending: true })

    if (error) {
      console.error(error)
      setErrorText(error.message)
      setLines([])
    } else {
      setLines((data || []) as OpeningLine[])
    }

    setLoading(false)
  }

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return lines

    return lines.filter((line) => lineSearchText(line).includes(q))
  }, [lines, search])

  const familyName = lines[0]?.family || (familySlug ? titleFromSlug(familySlug) : 'Opening Family')
  const firstLine = lines[0]

  function openTrainer(line: OpeningLine) {
    if (!line.slug || !familySlug) return
    navigate(`/openings/${line.slug}?family=${familySlug}`)
  }

  function startTraining() {
    if (!firstLine?.slug || !familySlug) return
    navigate(`/openings/${firstLine.slug}?family=${familySlug}`)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #2b2623 0%, #161512 100%)',
        color: '#f3f3f3',
        fontFamily: 'Arial, sans-serif',
        padding: '28px 20px 60px',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <button
          onClick={() => navigate('/openings')}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#cfcfcf',
            cursor: 'pointer',
            fontSize: 14,
            marginBottom: 14,
            padding: 0,
          }}
        >
          ← Back to openings
        </button>

        <div
          style={{
            marginBottom: 24,
            background:
              'linear-gradient(135deg, rgba(95,168,255,0.18) 0%, rgba(127,166,80,0.12) 100%)',
            borderRadius: 28,
            padding: 34,
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 260 }}>
              <h1 style={{ fontSize: 44, margin: '0 0 10px' }}>{familyName}</h1>

              <p style={{ fontSize: 17, color: '#d7d7d7', margin: '0 0 18px' }}>
                Browse every line in this family, or start training from the first line.
              </p>

              <div style={{ fontSize: 14, color: '#cfcfcf' }}>
                {lines.length} total lines · {filteredLines.length} shown
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <button
                onClick={startTraining}
                disabled={!firstLine}
                style={{
                  background: firstLine ? '#88a94f' : '#4d4a47',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '13px 16px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: firstLine ? 'pointer' : 'not-allowed',
                }}
              >
                Start Training
              </button>
            </div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lines, variation, subvariation, ECO..."
            style={{
              width: '100%',
              maxWidth: 520,
              marginTop: 22,
              padding: '13px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#1f1d1c',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        {loading ? <div style={{ color: '#cfcfcf', padding: 20 }}>Loading lines...</div> : null}

        {errorText ? (
          <div
            style={{
              background: 'rgba(190,60,60,0.15)',
              color: '#ffb4b4',
              padding: 16,
              borderRadius: 14,
              marginBottom: 18,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {errorText}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredLines.map((line, index) => (
            <button
              key={line.id}
              onClick={() => openTrainer(line)}
              style={{
                width: '100%',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: 16,
                background: '#1f1d1c',
                color: '#f3f3f3',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 5 }}>
                    {index + 1}. {line.name}
                  </div>

                  <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.45 }}>
                    {line.variation || 'Main line'}
                    {line.subvariation ? ` · ${line.subvariation}` : ''}
                  </div>
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    textAlign: 'right',
                    color: '#aaa',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div>{line.eco || '—'}</div>
                  <div>{line.ply_count || '?'} plies</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {!loading && !errorText && filteredLines.length === 0 ? (
          <div style={{ marginTop: 40, color: '#aaa', textAlign: 'center' }}>No lines found</div>
        ) : null}
      </div>
    </div>
  )
}
