import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { supabase } from './lib/supabase'

export default function OpeningTrainerTest() {
  const [game, setGame] = useState(new Chess())
  const [moves, setMoves] = useState<string[]>([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('opening_lines')
      .select('*')
      .limit(1)
      .single()

    if (error) {
      console.error(error)
      return
    }

    setMoves(data.uci_moves ?? [])
    setGame(new Chess())
    setIndex(0)
  }

  function onDrop(source: string, target: string) {
    const move = source + target
    const expectedMove = moves[index]

    if (!expectedMove || move !== expectedMove) {
      return false
    }

    const newGame = new Chess(game.fen())

    try {
      newGame.move({
        from: source,
        to: target,
        promotion: 'q',
      })
    } catch {
      return false
    }

    setGame(newGame)
    setIndex((i) => i + 1)

    return true
  }

  return (
    <div>
      <Chessboard
        position={game.fen()}
        onPieceDrop={onDrop}
      />
      <div>Move: {index}/{moves.length}</div>
    </div>
  )
}