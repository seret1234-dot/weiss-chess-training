const fs = require('fs')

const INPUT_FILE = 'krk_generated.json'
const OUTPUT_FILE = 'krk_chunks.json'

function normalizeFenKey(fen) {
  const parts = String(fen || '').trim().split(/\s+/)
  return parts.slice(0, 4).join(' ')
}

function normalizeFenFull(fen) {
  const parts = String(fen || '').trim().split(/\s+/)
  if (parts.length === 4) return `${parts.join(' ')} 0 1`
  if (parts.length === 5) return `${parts.join(' ')} 1`
  return parts.join(' ')
}

function chunkIdForGroup(group) {
  if (typeof group.mateIn === 'number') {
    return `krk_m${group.mateIn}`
  }

  const label = String(group.label || '').trim().toLowerCase()
  if (label === 'rank7') return 'krk_rank7'
  if (label === 'rank6') return 'krk_rank6'
  if (label === 'center') return 'krk_center'

  return `krk_${label.replace(/[^a-z0-9]+/g, '_')}`
}

function chunkLabelForGroup(group) {
  if (typeof group.mateIn === 'number') {
    return `Mate in ${group.mateIn}`
  }

  const label = String(group.label || '').trim().toLowerCase()
  if (label === 'rank7') return 'King on 7th rank'
  if (label === 'rank6') return 'King on 6th rank'
  if (label === 'center') return 'King in center'

  return String(group.label || 'Chunk')
}

function chunkSortValue(group) {
  if (typeof group.mateIn === 'number') {
    return group.mateIn
  }

  const label = String(group.label || '').trim().toLowerCase()
  if (label === 'rank7') return 100
  if (label === 'rank6') return 101
  if (label === 'center') return 102

  return 999
}

function buildChunks(raw) {
  const groups = Array.isArray(raw?.groups) ? raw.groups : []

  const sortedGroups = [...groups].sort((a, b) => chunkSortValue(a) - chunkSortValue(b))

  const chunks = sortedGroups.map((group) => {
    const positions = Array.isArray(group.positions) ? group.positions : []

    const seen = new Set()
    const deduped = []

    for (const pos of positions) {
      const fen = normalizeFenFull(pos.fen)
      const key = normalizeFenKey(fen)

      if (!fen || seen.has(key)) continue
      seen.add(key)

      deduped.push({
        fen,
      })
    }

    return {
      id: chunkIdForGroup(group),
      label: chunkLabelForGroup(group),
      mateIn: typeof group.mateIn === 'number' ? group.mateIn : null,
      positions: deduped,
    }
  })

  return { chunks }
}

function main() {
  const rawText = fs.readFileSync(INPUT_FILE, 'utf8')
  const raw = JSON.parse(rawText)

  const result = buildChunks(raw)

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8')

  console.log(`Built ${OUTPUT_FILE}`)
  console.log(`Chunks: ${result.chunks.length}`)

  for (const chunk of result.chunks) {
    console.log(`- ${chunk.id}: ${chunk.positions.length} positions`)
  }
}

main()