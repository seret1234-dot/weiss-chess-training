import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

type Family = {
  family: string
  family_slug: string
  count: number
}

export default function OpeningsLibraryPage() {
  const navigate = useNavigate()
  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void loadFamilies()
  }, [])

  async function loadFamilies() {
    setLoading(true)

    const { data, error } = await supabase.rpc('get_opening_families')

    if (error) {
      console.error(error)
    } else {
      setFamilies(data || [])
    }

    setLoading(false)
  }

  // 🔍 FILTERED RESULTS
  const filteredFamilies = useMemo(() => {
    if (!search.trim()) return families

    const s = search.toLowerCase()

    return families.filter((f) =>
      `${f.family} ${f.family_slug}`
        .toLowerCase()
        .includes(s),
    )
  }, [families, search])

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
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {/* HEADER */}
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
          <h1 style={{ fontSize: 48, margin: '0 0 12px' }}>Openings</h1>

          <p style={{ fontSize: 18, color: '#d7d7d7', marginBottom: 18 }}>
            Choose an opening family. Each family trains full lines one after another.
          </p>

          {/* 🔍 SEARCH BOX */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search openings (e.g. Ruy Lopez, Sicilian...)"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#1f1d1c',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        {loading ? (
          <div style={{ color: '#cfcfcf', padding: 20 }}>Loading openings...</div>
        ) : null}

        {/* RESULTS COUNT */}
        {!loading && (
          <div style={{ marginBottom: 16, color: '#cfcfcf', fontSize: 13 }}>
            {filteredFamilies.length} results
          </div>
        )}

        {/* GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {filteredFamilies.map((f) => (
            <button
              key={f.family_slug}
              onClick={() => navigate(`/openings/family/${f.family_slug}`)}
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
                  background: 'linear-gradient(135deg, #5fa8ff 0%, #3f7ad9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  marginBottom: 18,
                }}
              >
                📖
              </div>

              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                {f.family}
              </div>

              <div style={{ fontSize: 15, color: '#cfcfcf' }}>
                {f.count} opening lines
              </div>
            </button>
          ))}
        </div>

        {/* EMPTY STATE */}
        {!loading && filteredFamilies.length === 0 && (
          <div style={{ marginTop: 40, color: '#aaa', textAlign: 'center' }}>
            No openings found
          </div>
        )}
      </div>
    </div>
  )
}