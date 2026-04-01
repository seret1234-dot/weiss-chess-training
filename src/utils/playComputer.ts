import { useNavigate } from 'react-router-dom'

export function usePlayComputer() {
  const navigate = useNavigate()

  return (fen: string, source?: string) => {
    navigate('/play-computer', {
      state: {
        fen,
        suggestedColor: fen.split(' ')[1] === 'w' ? 'white' : 'black',
        source,
      },
    })
  }
}