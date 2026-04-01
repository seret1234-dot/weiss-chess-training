import type {
  EngineStrengthPreset,
  PlayerColor,
  ColorChoice,
} from './playComputerTypes'

export const START_FEN = 'start'

export function randomColor(): PlayerColor {
  return Math.random() < 0.5 ? 'white' : 'black'
}

export function resolveColorChoice(choice: ColorChoice): PlayerColor {
  if (choice === 'random') return randomColor()
  return choice
}

export function oppositeColor(color: PlayerColor): PlayerColor {
  return color === 'white' ? 'black' : 'white'
}

export function fenToSideToMove(fen: string): PlayerColor {
  if (!fen || fen === 'start') return 'white'
  const parts = fen.trim().split(/\s+/)
  return parts[1] === 'b' ? 'black' : 'white'
}

export function strengthPresetToEngine(preset: EngineStrengthPreset) {
  switch (preset) {
    case 'beginner':
      return { skillLevel: 4, depth: 6, moveTime: 150 }
    case 'intermediate':
      return { skillLevel: 10, depth: 10, moveTime: 300 }
    case 'strong':
      return { skillLevel: 16, depth: 14, moveTime: 500 }
    case 'max':
    default:
      return { skillLevel: 20, depth: 18, moveTime: 800 }
  }
}

export function formatEval(scoreCp?: number, mate?: number): string {
  if (typeof mate === 'number') {
    return mate > 0 ? `M${mate}` : `M${mate}`
  }

  if (typeof scoreCp === 'number') {
    const pawns = scoreCp / 100
    return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1)
  }

  return '—'
}

export function resultText(result: '1-0' | '0-1' | '1/2-1/2' | '*') {
  switch (result) {
    case '1-0':
      return 'White wins'
    case '0-1':
      return 'Black wins'
    case '1/2-1/2':
      return 'Draw'
    default:
      return 'Game in progress'
  }
}