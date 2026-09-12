import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authRouterState, rememberTrainingReturnTarget } from '../auth/trainingReturnTarget.mjs'
import { supabase } from '../lib/supabase'
import { getNextSavedMasterGame, masterGameLibraryRoute } from './libraryData'
import './MyMasterGamesLibraryPage.css'

export default function MasterGamesLibraryPracticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('Opening your first saved game...')
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    let active = true

    async function launch() {
      const { data, error } = await supabase.auth.getUser()
      if (!active) return

      if (error || !data.user) {
        setSignedOut(true)
        setStatus('Log in to practice your saved Master Games.')
        return
      }

      try {
        const first = await getNextSavedMasterGame(supabase)
        if (!active) return
        if (!first) {
          setStatus('No games saved yet.')
          return
        }
        navigate(`${masterGameLibraryRoute(first)}?libraryPractice=1`, {
          replace: true,
          state: { fromMyLibrary: true },
        })
      } catch (cause) {
        console.error('Failed to begin My Library practice:', cause)
        setStatus(cause instanceof Error ? cause.message : 'Library practice could not start.')
      }
    }

    void launch()
    return () => { active = false }
  }, [navigate])

  function beginLogin() {
    const target = `${location.pathname}${location.search}${location.hash}`
    const record = rememberTrainingReturnTarget(target)
    navigate('/auth?resumeTraining=1', { state: authRouterState(record) })
  }

  return (
    <div className="master-game-library-page">
      <section className="master-game-library-empty">
        <h1>Practice My Library</h1>
        <p>{status}</p>
        <div className="master-game-library-actions">
          {signedOut ? <button type="button" onClick={beginLogin}>Log In</button> : null}
          <Link to="/master-games/my-library">Back to My Library</Link>
        </div>
      </section>
    </div>
  )
}
