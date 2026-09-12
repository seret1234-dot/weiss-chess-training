import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authRouterState, rememberTrainingReturnTarget } from '../auth/trainingReturnTarget.mjs'
import { supabase } from '../lib/supabase'
import { getNextSavedOpening, openingLibraryRoute } from './libraryData'
import './MyOpeningsPage.css'

export default function MyOpeningsPracticePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('Opening your first saved line...')
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    let active = true
    async function launch() {
      const { data, error } = await supabase.auth.getUser()
      if (!active) return
      if (error || !data.user) {
        setSignedOut(true)
        setStatus('Log in to practice your saved openings.')
        return
      }
      try {
        const first = await getNextSavedOpening(supabase)
        if (!active) return
        if (!first) {
          setStatus('No openings saved yet.')
          return
        }
        navigate(`${openingLibraryRoute(first)}?libraryPractice=1`, { replace: true, state: { fromMyOpenings: true } })
      } catch (cause) {
        console.error('My Openings practice start failed:', cause)
        setStatus(cause instanceof Error ? cause.message : 'My Openings practice could not start.')
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
    <div className="my-openings-page">
      <section className="my-openings-empty">
        <h1>Practice My Openings</h1>
        <p>{status}</p>
        <div className="my-openings-empty-actions">
          {signedOut ? <button type="button" onClick={beginLogin}>Log In</button> : null}
          <Link to="/openings/my-openings">Back to My Openings</Link>
        </div>
      </section>
    </div>
  )
}
