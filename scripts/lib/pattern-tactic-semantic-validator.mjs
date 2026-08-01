import { Chess } from "chess.js"

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING_STEPS = [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]]
const ROOK_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_STEPS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

export const VALIDATOR_SPECS = {
  "fork-knight": { tier: "A", family: "fork", piece: "n" },
  "fork-queen": { tier: "A", family: "fork", piece: "q" },
  "fork-rook": { tier: "A", family: "fork", piece: "r" },
  "fork-bishop": { tier: "A", family: "fork", piece: "b" },
  "fork-pawn": { tier: "A", family: "fork", piece: "p" },
  "king-fork": { tier: "A", family: "fork", piece: "k" },
  "pin-rook": { tier: "A", family: "pin", piece: "r" },
  "pin-queen": { tier: "A", family: "pin", piece: "q" },
  "pin-bishop": { tier: "A", family: "pin", piece: "b" },
  "pin-other": { tier: "B", family: "pin" },
  "skewer-rook": { tier: "A", family: "skewer", piece: "r" },
  "skewer-queen": { tier: "A", family: "skewer", piece: "q" },
  "skewer-bishop": { tier: "A", family: "skewer", piece: "b" },
  "skewer-other": { tier: "B", family: "skewer" },
  "xray-queen": { tier: "B", family: "xray", piece: "q" },
  "xray-rook": { tier: "B", family: "xray", piece: "r" },
  "xray-bishop": { tier: "B", family: "xray", piece: "b" },
  "xray-other": { tier: "B", family: "xray" },
  "discovered-attack": { tier: "A", family: "discovered" },
  "discovered-check": { tier: "A", family: "discovered-check" },
  "double-check": { tier: "A", family: "double-check" },
  promotion: { tier: "A", family: "promotion" },
  underpromotion: { tier: "A", family: "underpromotion" },
  "underpromotion-knight": { tier: "A", family: "underpromotion", piece: "n" },
  "en-passant": { tier: "A", family: "en-passant" },
  "mating-tactic": { tier: "A", family: "mate" },
  "hanging-piece": { tier: "B", family: "hanging-piece" },
  "trapped-piece": { tier: "B", family: "trapped-piece" },
  "remove-the-defender": { tier: "B", family: "remove-defender" },
  "attacking-f2-f7": { tier: "B", family: "f2-f7" },
  "sacrifice-queen": { tier: "C", family: "sacrifice", piece: "q" },
  "sacrifice-rook": { tier: "C", family: "sacrifice", piece: "r" },
  "sacrifice-bishop": { tier: "C", family: "sacrifice", piece: "b" },
  "sacrifice-knight": { tier: "C", family: "sacrifice", piece: "n" },
  "sacrifice-pawn": { tier: "C", family: "sacrifice", piece: "p" },
  "king-sacrifice": { tier: "C", family: "sacrifice", piece: "k" },
  clearance: { tier: "C", family: "clearance" },
  "clearance-sacrifice": { tier: "C", family: "clearance-sacrifice" },
  interference: { tier: "C", family: "interference" },
  "interference-sacrifice": { tier: "C", family: "interference-sacrifice" },
  deflection: { tier: "C", family: "deflection" },
  "decoy-attraction": { tier: "C", family: "decoy" },
  "decoy-deflection": { tier: "C", family: "decoy-deflection" },
  zwischenzug: { tier: "C", family: "zwischenzug" },
  zugzwang: { tier: "C", family: "zugzwang" },
  defense: { tier: "C", family: "defense" },
  "advanced-pawn": { tier: "C", family: "advanced-pawn" },
  "quiet-move": { tier: "C", family: "quiet-move" },
  "vulnerable-king": { tier: "C", family: "vulnerable-king" },
  "kingside-attack": { tier: "C", family: "kingside-attack" },
  "queenside-attack": { tier: "C", family: "queenside-attack" },
}

// The tactic catalog uses piece-first directory names, while the original
// validator descriptions were grouped family-first. Keep the collection key
// authoritative and normalize only inside this read-only audit.
const THEME_ALIASES = {
  "bishop-fork": "fork-bishop", "knight-fork": "fork-knight", "pawn-fork": "fork-pawn", "queen-fork": "fork-queen", "rook-fork": "fork-rook",
  "bishop-pin": "pin-bishop", "queen-pin": "pin-queen", "rook-pin": "pin-rook", "other-pin": "pin-other",
  "bishop-skewer": "skewer-bishop", "queen-skewer": "skewer-queen", "rook-skewer": "skewer-rook", "other-skewer": "skewer-other",
  "bishop-xray": "xray-bishop", "queen-xray": "xray-queen", "rook-xray": "xray-rook", "other-xray": "xray-other",
  "bishop-sacrifice": "sacrifice-bishop", "knight-sacrifice": "sacrifice-knight", "pawn-sacrifice": "sacrifice-pawn", "queen-sacrifice": "sacrifice-queen", "king-sacrifice": "king-sacrifice",
  "knight-underpromotion": "underpromotion-knight",
}

function normalizedTheme(theme) { return THEME_ALIASES[theme] ?? theme }

export function normalizeUci(value) { return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "") }
export function moveFromUci(uci) { return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined } }
export function puzzleArray(value) { return Array.isArray(value) ? value : Array.isArray(value?.puzzles) ? value.puzzles : [] }
export function storedLine(raw) {
  if (Array.isArray(raw.solutionLine)) return raw.solutionLine.map(normalizeUci).filter(Boolean)
  if (Array.isArray(raw.moves)) return raw.moves.map(normalizeUci).filter(Boolean)
  if (Array.isArray(raw.solution)) return raw.solution.map(normalizeUci).filter(Boolean)
  if (typeof raw.full_solution === "string") return raw.full_solution.split(/\s+/).map(normalizeUci).filter(Boolean)
  if (typeof raw.Moves === "string") return raw.Moves.split(/\s+/).map(normalizeUci).filter(Boolean)
  const one = normalizeUci(raw.solution ?? raw.solution_move)
  return one ? [one] : []
}

function sq(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8 ? `${String.fromCharCode(97 + x)}${y + 1}` : null }
function coords(square) { return [square.charCodeAt(0) - 97, Number(square[1]) - 1] }
function boardPiece(game, square) { return game.get(square) }
function steps(piece) { return piece.type === "r" ? ROOK_STEPS : piece.type === "b" ? BISHOP_STEPS : piece.type === "q" ? [...ROOK_STEPS, ...BISHOP_STEPS] : [] }

function attackedSquares(game, from) {
  const piece = boardPiece(game, from)
  if (!piece) return []
  const [x, y] = coords(from)
  const result = []
  const push = (dx, dy) => { const target = sq(x + dx, y + dy); if (target) result.push(target) }
  if (piece.type === "n") KNIGHT_STEPS.forEach(([dx, dy]) => push(dx, dy))
  else if (piece.type === "k") KING_STEPS.forEach(([dx, dy]) => push(dx, dy))
  else if (piece.type === "p") {
    const direction = piece.color === "w" ? 1 : -1
    push(-1, direction); push(1, direction)
  } else for (const [dx, dy] of steps(piece)) {
    for (let distance = 1; distance < 8; distance += 1) {
      const target = sq(x + dx * distance, y + dy * distance)
      if (!target) break
      result.push(target)
      if (boardPiece(game, target)) break
    }
  }
  return result
}

function lineTargets(game, from) {
  const piece = boardPiece(game, from)
  if (!piece || !["r", "b", "q"].includes(piece.type)) return []
  const [x, y] = coords(from)
  const result = []
  for (const [dx, dy] of steps(piece)) {
    const ray = []
    for (let distance = 1; distance < 8; distance += 1) {
      const target = sq(x + dx * distance, y + dy * distance)
      if (!target) break
      const targetPiece = boardPiece(game, target)
      if (targetPiece) { ray.push({ square: target, piece: targetPiece }); break }
    }
    if (ray.length) result.push(ray[0])
  }
  return result
}

function firstTwoOnRay(game, from, dx, dy) {
  const [x, y] = coords(from)
  const found = []
  for (let distance = 1; distance < 8; distance += 1) {
    const target = sq(x + dx * distance, y + dy * distance)
    if (!target) break
    const piece = boardPiece(game, target)
    if (piece) {
      found.push({ square: target, piece })
      if (found.length === 2) break
    }
  }
  return found
}

function allLineRelations(game, color, requestedPiece) {
  const relations = []
  for (const row of game.board()) for (const item of row) {
    if (!item || item.color !== color || !["r", "b", "q"].includes(item.type) || (requestedPiece && item.type !== requestedPiece)) continue
    const from = `${item.square}`
    for (const [dx, dy] of steps(item)) {
      const targets = firstTwoOnRay(game, from, dx, dy)
      if (targets.length === 2) relations.push({ attacker: from, attackerPiece: item, front: targets[0], back: targets[1], direction: [dx, dy] })
    }
  }
  return relations
}

function meaningful(piece) { return piece && (piece.type === "k" || PIECE_VALUE[piece.type] >= 3) }
function pieceSummary(piece, square) { return piece ? `${piece.color}${piece.type}@${square}` : null }
function result(status, confidence, reason, evidence = {}, detected = null) { return { status, confidence, reason, evidence, detectedTheme: detected } }
function tierFor(theme) { return VALIDATOR_SPECS[theme]?.tier ?? "C" }

function replay(raw) {
  const fen = String(raw.fen ?? raw.FEN ?? "")
  const preMove = normalizeUci(raw.preMove)
  const line = storedLine(raw)
  if (!fen || !line.length) throw new Error("missing FEN or stored solution")
  const game = new Chess(fen)
  if (preMove) game.move(moveFromUci(preMove))
  const activeLine = preMove && line[0] === preMove ? line.slice(1) : line
  if (!activeLine.length) throw new Error("stored solution contains only preMove")
  const start = new Chess(game.fen())
  const states = []
  for (const uci of activeLine) {
    const before = new Chess(game.fen())
    const move = game.move(moveFromUci(uci))
    if (!move) throw new Error(`illegal move ${uci}`)
    states.push({ uci, before, after: new Chess(game.fen()), move })
  }
  return { start, states, end: game, activeLine }
}

function validateFork(ctx, spec) {
  const first = ctx.states[0]
  const mover = first.after.get(first.move.to)
  if (!mover || mover.color !== first.move.color) return result("BROKEN / ILLEGAL", 1, "moving piece missing after the stored move")
  if (spec.piece && mover.type !== spec.piece) return result("MISCLASSIFIED", .98, `declared ${spec.piece}-fork but the tactical mover is ${mover.type}`, {}, "other")
  const targets = attackedSquares(first.after, first.move.to)
    .map((square) => ({ square, piece: first.after.get(square) }))
    .filter(({ piece, square }) => piece?.color !== mover.color && meaningful(piece) && square !== first.move.to)
  if (targets.length >= 2) return result("VALID", .98, "moving piece attacks at least two surviving meaningful enemy targets", { mover: pieceSummary(mover, first.move.to), targets: targets.map(({ piece, square }) => pieceSummary(piece, square)) }, "fork")
  const captured = first.before.get(first.move.to)
  return result("MISCLASSIFIED", .96, "moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded", { mover: pieceSummary(mover, first.move.to), targets: targets.map(({ piece, square }) => pieceSummary(piece, square)), capturedDestination: pieceSummary(captured, first.move.to) }, "ordinary-attack")
}

function validatePin(ctx, spec) {
  const color = ctx.states[0].move.color
  const relations = allLineRelations(ctx.states[0].after, color, spec.piece).filter(({ front, back }) => front.piece.color !== color && back.piece.color !== color && PIECE_VALUE[back.piece.type] > PIECE_VALUE[front.piece.type])
  const absolute = relations.filter(({ back }) => back.piece.type === "k")
  if (relations.length) return result("VALID", .94, absolute.length ? "line piece creates an absolute pin to the king" : "line piece creates a relative pin to a more valuable target", { pins: relations.slice(0, 4).map(({ attacker, front, back }) => ({ attacker: pieceSummary(ctx.states[0].after.get(attacker), attacker), pinned: pieceSummary(front.piece, front.square), target: pieceSummary(back.piece, back.square) })) }, absolute.length ? "absolute-pin" : "relative-pin")
  return result("MISCLASSIFIED", .93, "no enemy piece lies between the declared line piece and a more valuable enemy target after the tactic", {}, "ordinary-attack")
}

function validateSkewer(ctx, spec) {
  const color = ctx.states[0].move.color
  const relations = allLineRelations(ctx.states[0].after, color, spec.piece).filter(({ front, back }) => front.piece.color !== color && back.piece.color !== color && PIECE_VALUE[front.piece.type] > PIECE_VALUE[back.piece.type])
  if (relations.length) return result("VALID", .94, "line piece attacks a more valuable front target with a lower-value target behind it", { skewers: relations.slice(0, 4).map(({ attacker, front, back }) => ({ attacker: pieceSummary(ctx.states[0].after.get(attacker), attacker), front: pieceSummary(front.piece, front.square), back: pieceSummary(back.piece, back.square) })) }, "skewer")
  return result("MISCLASSIFIED", .93, "no qualifying front-and-behind enemy target pair exists on a line after the tactic", {}, "ordinary-attack")
}

function validateXray(ctx, spec) {
  const color = ctx.states[0].move.color
  const relations = allLineRelations(ctx.states[0].after, color, spec.piece)
  if (relations.length) return result("VALID BUT WEAK", .72, "line piece has a two-piece x-ray relation; strategic duty requires human confirmation", { xray: relations.slice(0, 4).map(({ attacker, front, back }) => ({ attacker: pieceSummary(ctx.states[0].after.get(attacker), attacker), intervening: pieceSummary(front.piece, front.square), endpoint: pieceSummary(back.piece, back.square) })) }, "xray")
  return result("AMBIGUOUS", .62, "no direct two-piece line relation remains after the tactic; x-ray/defense interpretation requires review", {}, "unknown")
}

function revealedLineAttacks(before, after, movedFrom, movedTo, color) {
  const revealed = []
  for (const row of after.board()) for (const item of row) {
    if (!item || item.color !== color || item.square === movedTo || !["r", "b", "q"].includes(item.type)) continue
    const beforeTargets = new Set(attackedSquares(before, item.square))
    const afterTargets = attackedSquares(after, item.square)
    for (const target of afterTargets) {
      const targetPiece = after.get(target)
      if (targetPiece?.color !== color && meaningful(targetPiece) && !beforeTargets.has(target)) revealed.push({ attacker: item.square, attackerPiece: item, target, targetPiece })
    }
  }
  return revealed
}

function validateDiscovered(ctx, spec) {
  const first = ctx.states[0]
  const color = first.move.color
  const revealed = revealedLineAttacks(first.before, first.after, first.move.from, first.move.to, color)
  const discoveredCheck = first.after.isCheck() && revealed.some(({ targetPiece }) => targetPiece.type === "k")
  if (spec.family === "discovered-check") {
    if (discoveredCheck) return result("VALID", .98, "moved piece uncovers check by a different line piece", { moved: first.move.from + first.move.to, revealed: revealed.filter(({ targetPiece }) => targetPiece.type === "k").map(({ attacker, attackerPiece, target }) => ({ attacker: pieceSummary(attackerPiece, attacker), king: target })) }, "discovered-check")
    return result("MISCLASSIFIED", .98, "stored move does not uncover a check by a different piece", { revealed: revealed.map(({ attacker, target }) => `${attacker}->${target}`) }, "ordinary-check")
  }
  if (revealed.length) return result("VALID", .94, "moved piece uncovers an attack by a different line piece", { revealed: revealed.slice(0, 4).map(({ attacker, attackerPiece, target, targetPiece }) => ({ attacker: pieceSummary(attackerPiece, attacker), target: pieceSummary(targetPiece, target) })) }, "discovered-attack")
  return result("MISCLASSIFIED", .94, "stored move does not reveal a new meaningful line-piece attack", {}, "ordinary-move")
}

function validateDoubleCheck(ctx) {
  const first = ctx.states[0]
  if (!first.after.isCheck()) return result("MISCLASSIFIED", .98, "move does not give check", {}, "non-check")
  const revealed = revealedLineAttacks(first.before, first.after, first.move.from, first.move.to, first.move.color).filter(({ targetPiece }) => targetPiece.type === "k")
  const moverAttacksKing = attackedSquares(first.after, first.move.to).some((square) => first.after.get(square)?.type === "k" && first.after.get(square)?.color !== first.move.color)
  if (moverAttacksKing && revealed.length) return result("VALID", .98, "moving piece checks while a different piece also gives revealed check", { revealed: revealed.map(({ attacker }) => attacker) }, "double-check")
  return result("MISCLASSIFIED", .98, "check is not delivered simultaneously by the moving piece and a revealed different piece", { moverAttacksKing, revealed: revealed.map(({ attacker }) => attacker) }, "single-check")
}

function validatePromotion(ctx, spec) {
  const promotions = ctx.states.filter(({ move }) => Boolean(move.promotion))
  if (!promotions.length) return result("MISCLASSIFIED", .99, "stored tactical line contains no promotion", {}, "non-promotion")
  const promotion = promotions[0]
  if (spec.family === "underpromotion") {
    if (promotion.move.promotion === "q") return result("MISCLASSIFIED", .99, "declared underpromotion uses a queen", {}, "queen-promotion")
    if (spec.piece && promotion.move.promotion !== spec.piece) return result("MISCLASSIFIED", .99, `declared ${spec.piece} underpromotion promotes to ${promotion.move.promotion}`, {}, "other-underpromotion")
    let queenWorks = false
    try {
      const alternative = new Chess(promotion.before.fen())
      const queen = alternative.move({ from: promotion.move.from, to: promotion.move.to, promotion: "q" })
      queenWorks = Boolean(queen) && (alternative.isCheckmate() || alternative.isDraw() || alternative.isCheck())
    } catch { queenWorks = false }
    if (queenWorks) return result("VALID BUT WEAK", .82, "underpromotion is legal, but queen promotion also immediately has a tactical outcome", { promotion: promotion.move.promotion }, "underpromotion")
    return result("VALID", .98, "non-queen promotion is present and queen promotion does not reproduce the immediate tactical outcome", { promotion: promotion.move.promotion }, "underpromotion")
  }
  return result("VALID", .99, "stored tactical line includes a legal promotion", { promotion: promotion.move.promotion }, "promotion")
}

function validateEnPassant(ctx) {
  const match = ctx.states.find(({ move }) => move.isEnPassant?.())
  return match ? result("VALID", .99, "stored line includes a legal en-passant capture", { move: match.uci }, "en-passant") : result("MISCLASSIFIED", .99, "stored line contains no en-passant capture", {}, "other")
}

function validateMate(ctx) {
  return ctx.end.isCheckmate() ? result("VALID", 1, "complete stored line ends in legal checkmate", {}, "mating-tactic") : result("MISCLASSIFIED", .99, "complete stored line does not end in checkmate", {}, "non-mating-line")
}

function validateHanging(ctx) {
  const first = ctx.states[0]
  const captured = first.before.get(first.move.to)
  if (!captured || captured.color === first.move.color || !first.move.captured) return result("AMBIGUOUS", .58, "first move is not a direct capture of a candidate hanging piece", {}, "unknown")
  const defenders = attackedSquares(first.before, first.move.to).filter((square) => first.before.get(square)?.color === captured.color)
  if (!defenders.length) return result("VALID BUT WEAK", .76, "first move captures a geometrically undefended enemy piece; exchange/recapture evaluation requires review", { target: pieceSummary(captured, first.move.to) }, "hanging-piece")
  return result("AMBIGUOUS", .59, "captured target has geometric defenders; tactical adequacy requires material evaluation", { target: pieceSummary(captured, first.move.to), defenderSquares: defenders }, "contested-piece")
}

function validateF2F7(ctx) {
  const first = ctx.states[0]
  const targets = ["f2", "f7"].filter((square) => first.after.get(square)?.color !== first.move.color && attackedSquares(first.after, first.move.to).includes(square))
  const capture = ["f2", "f7"].includes(first.move.to) && first.move.captured
  return targets.length || capture ? result("VALID BUT WEAK", .78, "tactical move directly attacks or captures the named f-pawn square", { targets, capture }, "f2-f7") : result("AMBIGUOUS", .6, "first move has no direct f2/f7 relation; full attacking plan requires review", {}, "attack")
}

function validateManual(ctx, spec) {
  const first = ctx.states[0]
  const forcing = Boolean(first.move.captured) || first.after.isCheck() || Boolean(first.move.promotion)
  const endsMate = ctx.end.isCheckmate()
  const structural = {
    forcingFirstMove: forcing,
    firstMoveCapture: first.move.captured ?? null,
    givesCheck: first.after.isCheck(),
    promotion: first.move.promotion ?? null,
    endsMate,
    lineLength: ctx.states.length,
  }
  if (spec.family === "sacrifice" || spec.family === "clearance-sacrifice") {
    const mover = first.before.get(first.move.from)
    const offered = mover && !first.move.captured && PIECE_VALUE[mover.type] >= 3
    return result("AMBIGUOUS", .52, offered ? "candidate material offer exists, but compensation and forced acceptance require chess-aware review" : "no unambiguous initial material offer; tactic requires manual review", structural, offered ? "candidate-sacrifice" : "unknown")
  }
  if (["deflection", "decoy", "decoy-deflection", "clearance", "interference", "interference-sacrifice", "zwischenzug", "remove-defender"].includes(spec.family)) return result("AMBIGUOUS", .5, `${spec.family} requires an identified defensive duty or forcing relationship; structural signal recorded for manual review`, structural, "manual-review")
  if (spec.family === "trapped-piece") return result("AMBIGUOUS", .55, "safe escape and adequate compensation require chess-aware evaluation", structural, "manual-review")
  if (spec.family === "zugzwang") return result("AMBIGUOUS", .5, "zugzwang requires counterfactual legal-move evaluation; manual review required", structural, "manual-review")
  return result("AMBIGUOUS", .5, "theme requires chess-aware interpretation beyond legal-line replay", structural, "manual-review")
}

export function validateTacticRecord(raw, declaredTheme) {
  const validatorTheme = normalizedTheme(declaredTheme)
  const spec = VALIDATOR_SPECS[validatorTheme] ?? { tier: "C", family: "manual-only" }
  try {
    const ctx = replay(raw)
    let output
    if (spec.family === "fork") output = validateFork(ctx, spec)
    else if (spec.family === "pin") output = validatePin(ctx, spec)
    else if (spec.family === "skewer") output = validateSkewer(ctx, spec)
    else if (spec.family === "xray") output = validateXray(ctx, spec)
    else if (["discovered", "discovered-check"].includes(spec.family)) output = validateDiscovered(ctx, spec)
    else if (spec.family === "double-check") output = validateDoubleCheck(ctx)
    else if (["promotion", "underpromotion"].includes(spec.family)) output = validatePromotion(ctx, spec)
    else if (spec.family === "en-passant") output = validateEnPassant(ctx)
    else if (spec.family === "hanging-piece") output = validateHanging(ctx)
    else if (spec.family === "f2-f7") output = validateF2F7(ctx)
    else if (spec.family === "mate" || declaredTheme.includes("mate")) output = validateMate(ctx)
    else output = validateManual(ctx, spec)
    return { ...output, tier: spec.tier, activeLine: ctx.activeLine, displayedFen: ctx.start.fen().split(/\s+/).slice(0, 4).join(" ") }
  } catch (error) {
    return { status: "BROKEN / ILLEGAL", confidence: 1, reason: error instanceof Error ? error.message.replace(/\.$/, "") : "illegal FEN or stored solution", evidence: {}, detectedTheme: "broken", tier: spec.tier, activeLine: [], displayedFen: null }
  }
}

export function canonicalIdentity(raw, theme) {
  const validated = validateTacticRecord(raw, theme)
  const source = String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.id ?? "unknown")
  return `${validated.displayedFen ?? "invalid"}|${theme}|${validated.activeLine.join(",")}|${source}`
}

export function getValidatorTier(theme) { return tierFor(normalizedTheme(theme)) }
