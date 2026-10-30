import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBackgroundAnalysis, type AnalysisInput } from '../context/BackgroundAnalysisContext'
import { AUTO_TRAINING_ENTRY_ROUTE } from '../training/resolveAutoStartRoute'
import { INTRODUCTION_METADATA_KEY, INTRODUCTION_VIDEO_SRC, readIntroduction, type IntroductionState } from '../onboarding/introduction'
import '../onboarding/onboarding.css'

export default function IntroductionPage() {
 const navigate = useNavigate()
 const { job, startAnalysis, retryAnalysis, acknowledgePlanReady } = useBackgroundAnalysis()
 const [intro, setIntro] = useState<IntroductionState | null>(null)
 const [input, setInput] = useState<AnalysisInput | null>(null)
 const [error, setError] = useState('')
 const [saving, setSaving] = useState(false)
 const started = useRef(false)
 const handedOff = useRef(false)
 const resolving = useRef(false)
 useEffect(() => {
  let cancelled = false
  async function load() {
   try {
    const { data, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!data.user) { navigate('/auth', { replace: true }); return }
    const user = data.user
    const { data: profile, error: profileError } = await supabase.from('user_auto_profile')
     .select('onboarding_complete').eq('user_id', user.id).maybeSingle()
    if (profileError) throw profileError
    if (cancelled) return
    if (!profile?.onboarding_complete) { navigate('/onboarding', { replace: true }); return }
    const state = readIntroduction(user.user_metadata)
    // Absence is legacy onboarding, not a reason to enroll returning users.
    if (!state) { navigate(AUTO_TRAINING_ENTRY_ROUTE, { replace: true }); return }
    setInput({ userId: user.id,
     chesscomUsername: user.user_metadata.chessComUsername ?? user.user_metadata.chess_com_username ?? '',
     lichessUsername: user.user_metadata.lichessUsername ?? user.user_metadata.lichess_username ?? '' })
    setIntro(state)
   } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the introduction. Please refresh to retry.') }
  }
  void load()
  return () => { cancelled = true }
 }, [navigate])

 const ownJob = input && job.input?.userId === input.userId ? job : null
 // The introduction controls when a new learner enters practice. Import and
 // analysis are helpful personalization work, never a prerequisite for the
 // rating-based final-v6 starter curriculum.
 const ready = !!intro && intro.status !== 'pending'
 useEffect(() => {
  if (!intro?.requiresAnalysis || !input || started.current) return
  // Normally started by OnboardingPage. A missing local checkpoint (for example
  // a new device) resumes using the SAME import/analysis pipeline.
  if (!ownJob || ownJob.status === 'idle') {
   started.current = true
   startAnalysis(input)
  }
 }, [intro, input, ownJob, startAnalysis])
 useEffect(() => {
  // Finishing or skipping the video is the training readiness signal. The
  // background import continues after this navigation and upgrades Auto only
  // at its existing safe boundary.
  if (!intro || !ready || handedOff.current) return
  handedOff.current = true
  if (ownJob?.status === 'completed') acknowledgePlanReady()
  navigate(AUTO_TRAINING_ENTRY_ROUTE, { replace: true })
 }, [intro, ready, ownJob?.status, acknowledgePlanReady, navigate])

 async function resolveIntro(status: 'skipped' | 'completed') {
  if (!intro || intro.status !== 'pending' || resolving.current) return
  resolving.current = true
  setSaving(true)
  setError('')
  const next = { ...intro, status, resolvedAt: new Date().toISOString() }
  try {
   const { error: saveError } = await supabase.auth.updateUser({ data: { [INTRODUCTION_METADATA_KEY]: next } })
   if (saveError) throw saveError
   setIntro(next)
  } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save. Please try again.') }
  finally { resolving.current = false; setSaving(false) }
 }

 const progress = ownJob?.status === 'importing' ? 'Importing your games…'
  : ownJob?.status === 'analyzing' ? `Analyzing your games · ${ownJob.gamesCompleted} / ${ownJob.gamesTotal || '…'}`
  : ownJob?.status === 'failed' ? "We couldn't finish analyzing your games."
  : 'Preparing your training…'
 return <main className="registration-onboarding registration-introduction">
  <section className="registration-onboarding__card" aria-label="Training introduction">
   <h1>{intro?.status === 'pending' ? 'Welcome to Weiss Chess' : 'Preparing your training'}</h1>
   {intro?.status === 'pending' && <>
    {INTRODUCTION_VIDEO_SRC
     ? <video controls autoPlay playsInline src={INTRODUCTION_VIDEO_SRC} onEnded={() => void resolveIntro('completed')} aria-label="Introduction video" />
     : <div className="registration-introduction__media" role="region" aria-label="Introduction video placeholder">
       <p>Introduction video coming soon.<br />You can skip this introduction and start training.</p>
      </div>}
    <button className="registration-onboarding__primary" disabled={saving} onClick={() => void resolveIntro('skipped')}>
     {saving ? 'Saving…' : 'Skip introduction'}
    </button>
   </>}
   <p role="status">{!intro ? 'Loading…' : ready
    ? 'Opening your rating-appropriate training…'
    : `${progress} Your rating-based practice will be ready when this introduction ends.`}</p>
   {ownJob?.status === 'failed' && <button onClick={retryAnalysis}>Retry analysis</button>}
   {error && <p role="alert">{error}</p>}
  </section>
 </main>
}
