const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const PIECE_NAMES = {
  k: 'king',
  q: 'queen',
  r: 'rooks',
  b: 'bishops',
  n: 'knights',
  p: 'pawns',
}

const SINGULAR_PIECE_NAMES = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}

function joinSquares(squares) {
  if (squares.length <= 1) return squares[0] || 'none'
  return `${squares.slice(0, -1).join(', ')} and ${squares.at(-1)}`
}

function pieceSummary(entries, color) {
  const groups = new Map(Object.keys(PIECE_NAMES).map((piece) => [piece, []]))
  for (const [square, code] of entries) {
    if (code?.[0] !== color) continue
    const piece = code.slice(-1).toLowerCase()
    if (groups.has(piece)) groups.get(piece).push(square)
  }

  const colorName = color === 'w' ? 'White' : 'Black'
  const details = [...groups.entries()]
    .filter(([, squares]) => squares.length > 0)
    .map(([piece, squares]) => `${PIECE_NAMES[piece]} ${joinSquares(squares)}`)
  return `${colorName}: ${details.join('; ') || 'no pieces'}`
}

export function entriesFromFen(fen) {
  const board = String(fen || START_FEN).trim().split(/\s+/)[0]
  const ranks = board.split('/')
  if (ranks.length !== 8) return []

  const entries = []
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let fileIndex = 0
    for (const token of ranks[rankIndex]) {
      if (/\d/.test(token)) {
        fileIndex += Number(token)
        continue
      }
      if (fileIndex > 7 || !/[prnbqk]/i.test(token)) return []
      const square = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`
      entries.push([square, `${token === token.toUpperCase() ? 'w' : 'b'}${token.toLowerCase()}`])
      fileIndex += 1
    }
    if (fileIndex !== 8) return []
  }
  return entries
}

export function entriesFromPositionObject(position) {
  if (!position || typeof position !== 'object' || Array.isArray(position)) return []
  return Object.entries(position)
    .filter(([square]) => /^[a-h][1-8]$/.test(square))
    .map(([square, value]) => {
      if (typeof value === 'string') return [square, value]
      const code = value?.pieceType || value?.type || value?.piece || ''
      return [square, String(code)]
    })
    .filter(([, code]) => /^[wb][prnbqk]$/i.test(code))
    .map(([square, code]) => [square, code.toLowerCase()])
}

function normalizedEntries(position) {
  const fen = typeof position === 'string'
    ? (position === 'start' ? START_FEN : position)
    : null
  return {
    fen,
    entries: fen ? entriesFromFen(fen) : entriesFromPositionObject(position),
  }
}

export function describeBoardSquare(square, position, { selected = false } = {}) {
  const normalizedSquare = String(square || '').toLowerCase()
  if (!/^[a-h][1-8]$/.test(normalizedSquare)) return ''
  const { entries } = normalizedEntries(position)
  const code = entries.find(([entrySquare]) => entrySquare === normalizedSquare)?.[1]
  const piece = code && /^[wb][prnbqk]$/i.test(code)
    ? `${code[0].toLowerCase() === 'w' ? 'White' : 'Black'} ${SINGULAR_PIECE_NAMES[code.slice(-1).toLowerCase()]}`
    : 'empty square'
  return `${normalizedSquare}, ${piece}${selected ? ', selected' : ''}`
}

function humanizeBoardId(value) {
  const text = String(value || 'chessboard')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Chessboard'
}

export function buildBoardAccessibilityDescription({
  id,
  title,
  position,
  orientation = 'white',
  showCoordinates = true,
  interactionDescription,
  selectedSquare,
  currentMove,
  status,
}) {
  const { fen, entries } = normalizedEntries(position)
  const sideCode = fen?.trim().split(/\s+/)[1]
  const sideToMove = sideCode === 'b' ? 'Black' : sideCode === 'w' ? 'White' : null
  const boardName = String(title || '').trim() || humanizeBoardId(id)
  const orientationName = orientation === 'black' ? 'Black' : 'White'
  const positionText = entries.length
    ? `${pieceSummary(entries, 'w')}. ${pieceSummary(entries, 'b')}.`
    : 'Position description is unavailable for this board state.'
  const selectedText = selectedSquare
    ? `Selected square: ${describeBoardSquare(selectedSquare, position, { selected: true })}.`
    : ''

  return {
    label: `${boardName} chessboard`,
    description: [
      `Board orientation: ${orientationName} at bottom.`,
      sideToMove ? `${sideToMove} to move.` : '',
      currentMove ? `Current move: ${currentMove}.` : '',
      status ? `Status: ${status}.` : '',
      selectedText,
      positionText,
      `Visual coordinates are ${showCoordinates ? 'shown' : 'hidden'}; square names remain available in this description.`,
      interactionDescription || 'Use nearby controls to make or review moves. When supported, select a source square and destination square or drag a piece.',
    ].filter(Boolean).join(' '),
  }
}

export function isDecorativeTransitionBoard(id) {
  return String(id || '').includes('transition-cover')
}
