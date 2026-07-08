import { Chess } from "chess.js"
import type { BoardFactResult, MistakeExplainInput, MistakeTag } from "./types"

type LegalMove = {
 san: string
 from: string
 to: string
 piece: string
 captured?: string
 promotion?: string
 flags?: string
}

const PIECE_NAME: Record<string, string> = {
 p: "pawn",
 n: "knight",
 b: "bishop",
 r: "rook",
 q: "queen",
 k: "king",
}

const PIECE_VALUE: Record<string, number> = {
 p: 1,
 n: 3,
 b: 3,
 r: 5,
 q: 9,
 k: 100,
}

function normalizeMoveText(moveText?: string): string {
 return (moveText || "")
 .trim()
 .replace(/0/g, "O")
 .replace(/[!?]+/g, "")
 .replace(/\s+/g, "")
}

function normalizeSan(san?: string): string {
 return normalizeMoveText(san)
 .replace(/[+#]+$/g, "")
 .replace(/e\.p\./gi, "")
}

function moveToUci(move: LegalMove): string {
 return `${move.from}${move.to}${move.promotion || ""}`.toLowerCase()
}

function getLegalMoves(chess: Chess): LegalMove[] {
 return chess.moves({ verbose: true }) as LegalMove[]
}

function isCheckmate(chess: Chess): boolean {
 const c = chess as unknown as {
 isCheckmate?: () => boolean
 in_checkmate?: () => boolean
 }

 if (typeof c.isCheckmate === "function") return c.isCheckmate()
 if (typeof c.in_checkmate === "function") return c.in_checkmate()
 return false
}

function findLegalMove(chess: Chess, san?: string, uci?: string): LegalMove | undefined {
 const moves = getLegalMoves(chess)
 const targetSan = normalizeSan(san)
 const targetRaw = normalizeMoveText(san)
 const targetUci = (uci || "").trim().toLowerCase()

 return moves.find((move) => {
 const moveSan = normalizeSan(move.san)
 const moveRaw = normalizeMoveText(move.san)
 const moveUci = moveToUci(move)

 return (
 (!!targetSan && moveSan === targetSan) ||
 (!!targetRaw && moveRaw === targetRaw) ||
 (!!targetUci && moveUci === targetUci)
 )
 })
}

function cloneAndMove(chess: Chess, move: LegalMove): Chess | null {
 try {
 const next = new Chess(chess.fen())
 next.move(move.san)
 return next
 } catch {
 return null
 }
}

function moveIsCapture(move?: LegalMove): boolean {
 return !!move?.captured || !!move?.flags?.includes("c") || !!move?.flags?.includes("e")
}

function moveIsCheckOrMate(move?: LegalMove): boolean {
 return !!move?.san.includes("+") || !!move?.san.includes("#")
}

function pieceName(piece?: string): string {
 if (!piece) return "piece"
 return PIECE_NAME[piece.toLowerCase()] || "piece"
}

function bestCaptureText(bestMove: LegalMove): string {
 const captured = pieceName(bestMove.captured)
 return `${bestMove.san} wins or captures a ${captured}.`
}

function findMatingMoves(chess: Chess): LegalMove[] {
 const result: LegalMove[] = []

 for (const move of getLegalMoves(chess)) {
 const next = cloneAndMove(chess, move)
 if (next && isCheckmate(next)) {
 result.push(move)
 }
 }

 return result
}

function findStrongOpponentCaptures(afterUserMove: Chess): LegalMove[] {
 return getLegalMoves(afterUserMove)
 .filter((move) => !!move.captured)
 .sort((a, b) => {
 const av = PIECE_VALUE[a.captured || "p"] || 1
 const bv = PIECE_VALUE[b.captured || "p"] || 1
 return bv - av
 })
}

function pushUnique<T>(arr: T[], item: T) {
 if (!arr.includes(item)) arr.push(item)
}

export function collectBoardFacts(input: MistakeExplainInput): BoardFactResult {
 const tags: MistakeTag[] = []
 const facts: string[] = []

 let chess: Chess

 try {
 chess = new Chess(input.fenBefore)
 } catch {
 return {
 tags: ["generic"],
 facts: ["The position could not be loaded from the FEN."],
 }
 }

 const userMove = findLegalMove(chess, input.userMoveSan, input.userMoveUci)
 const bestMove = findLegalMove(chess, input.bestMoveSan, input.bestMoveUci)

 const userMoveLabel = userMove?.san || input.userMoveSan || input.userMoveUci
 const bestMoveLabel = bestMove?.san || input.bestMoveSan || input.bestMoveUci

 if (!userMove) {
 facts.push("The played move was not found among the legal moves in this position.")
 }

 if (!bestMove && (input.bestMoveSan || input.bestMoveUci)) {
 facts.push("The engine best move was provided, but it was not matched to a legal move.")
 }

 const matingMoves = findMatingMoves(chess)
 const userPlayedMate =
 !!userMove && matingMoves.some((move) => moveToUci(move) === moveToUci(userMove))

 if (matingMoves.length > 0 && !userPlayedMate) {
 pushUnique(tags, "missed_mate")
 facts.push(`There was a checkmate available: ${matingMoves[0].san}.`)
 }

 if (bestMove && moveIsCapture(bestMove) && (!userMove || !moveIsCapture(userMove))) {
 pushUnique(tags, "missed_capture")
 facts.push(bestCaptureText(bestMove))
 }

 if (bestMove && moveIsCheckOrMate(bestMove) && (!userMove || !moveIsCheckOrMate(userMove))) {
 pushUnique(tags, "missed_check")
 facts.push(`${bestMove.san} was a forcing check or mating move.`)
 }

 if (bestMove && (moveIsCapture(bestMove) || moveIsCheckOrMate(bestMove))) {
 pushUnique(tags, "missed_forcing_move")
 }

 let materialAtRisk: string | undefined

 if (userMove) {
 const afterUserMove = cloneAndMove(chess, userMove)

 if (afterUserMove) {
 const opponentMates = findMatingMoves(afterUserMove)

 if (opponentMates.length > 0) {
 pushUnique(tags, "allowed_mate")
 facts.push(`After the played move, the opponent has checkmate: ${opponentMates[0].san}.`)
 }

 const captures = findStrongOpponentCaptures(afterUserMove)
 const topCapture = captures[0]

 if (topCapture?.captured) {
 const capturedValue = PIECE_VALUE[topCapture.captured] || 1

 if (capturedValue >= 3) {
 pushUnique(tags, "hung_piece")
 const capturedName = pieceName(topCapture.captured)
 materialAtRisk = capturedName
 facts.push(`The opponent can win a ${capturedName} with ${topCapture.san}.`)
 }
 }

 const movedPieceCanBeCaptured = captures.find(
 (move) => move.to === userMove.to && !!move.captured
 )

 if (movedPieceCanBeCaptured) {
 pushUnique(tags, "hung_piece")
 facts.push(`The piece moved to ${userMove.to} can be captured immediately.`)
 }
 }
 }

 if (input.phase === "opening" && input.openingName) {
 facts.push(`This happened in the opening: ${input.openingName}.`)
 }

 if (input.phase === "endgame") {
 pushUnique(tags, "endgame_technique")
 }

 if (tags.length === 0) {
 tags.push("generic")
 }

 return {
 tags,
 facts,
 userMoveLabel,
 bestMoveLabel,
 materialAtRisk,
 matingMove: matingMoves[0]?.san,
 }
}