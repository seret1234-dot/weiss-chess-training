// Shared Auto entry flow, promoted unchanged from the approved local prototype.
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AUTO_TRAINING_ENTRY_ROUTE } from '../training/resolveAutoStartRoute'
import { isPlayableAutoRoute } from '../training/autoPlayableRoute'
import { isAutoMixedEligible, mixedAutoRoute } from '../training/autoMixedEligibility'
import { getOrCreateAutoProfile } from '../training/getOrCreateAutoProfile'
import { supabase } from '../lib/supabase'
import { readIntroduction } from '../onboarding/introduction'

export const DEMO_AUTO_ROUTE = '/demo-auto'
const keyFor = (userId: string) => `weiss-auto-entry-demo-v1:${userId}`

export function isDemoAutoLocation(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return false
  const url = new URL(value, 'https://demo.invalid')
  return url.searchParams.get('auto') === '1' &&
    (isPlayableAutoRoute(value) || ['/play-computer', '/play-vs-computer'].includes(url.pathname))
}

export function demoResumeTarget(userId: string) {
  try {
    const saved = sessionStorage.getItem(keyFor(userId))
    if (saved && isDemoAutoLocation(saved)) return saved
  } catch { /* Unavailable storage falls back to the existing scheduler. */ }
  return AUTO_TRAINING_ENTRY_ROUTE
}

export function DemoAutoLocationTracker({ userId }: { userId?: string }) {
  const location = useLocation()
  useEffect(() => {
    if (!userId) return
    const route = `${location.pathname}${location.search}${location.hash}`
    try {
      // /auto means the existing controller is selecting the next course item.
      // Home/Manual never run that selection or write training progress.
      if (location.pathname === '/auto') sessionStorage.removeItem(keyFor(userId))
      else if (isDemoAutoLocation(route)) sessionStorage.setItem(keyFor(userId), route)
    } catch { /* This optional entry bookmark never gates training. */ }
  }, [userId, location.pathname, location.search, location.hash])
  return null
}

export function DemoAutoEntry({ userId }: { userId?: string }) {
  const target = userId ? demoResumeTarget(userId) : '/auth'
  const [checked, setChecked] = useState<{ key: string; route: string } | null>(null)
  const [error, setError] = useState('')
  const key = `${userId}:${target}`
  useEffect(() => {
    if (!userId) return
    let active = true
    setError('')
    void (async () => {
      const profile = await getOrCreateAutoProfile(userId)
      if (!active) return
      if (!profile) throw new Error('Unable to load your training account. Please try again.')
      let route = target
      if (!profile.onboarding_complete) route = '/onboarding'
      else {
        const { data, error: authError } = await supabase.auth.getUser()
        if (!active) return
        if (authError || data.user?.id !== userId) throw new Error('Your account changed. Please reopen Auto Training.')
        if (readIntroduction(data.user.user_metadata)?.status === 'pending') route = '/onboarding/introduction'
        else if (mixedAutoRoute(target) && !await isAutoMixedEligible(userId, target)) route = AUTO_TRAINING_ENTRY_ROUTE
      }
      if (active) setChecked({ key, route })
    })().catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [userId, target, key])
  if (!userId) return <Navigate replace to="/auth" />
  if (error) return <div role="alert">{error}</div>
  if (checked?.key !== key) return <div role="status">Loading your training…</div>
  // Returning mounts the existing trainer anew: its normal persisted progress
  // is restored, but no old in-memory attempt/reaction timer is carried over.
  return <Navigate replace to={checked.route} />
}

export function DemoManualPractice({ signedIn }: { signedIn: boolean }) {
  return <section style={{ maxWidth: 1000, margin: '72px auto', padding: 24, color: 'var(--theme-text)' }}>
    <h1>Manual Practice</h1>
    <p>Choose your own practice. Your Auto Training course is kept in place.</p>
    <nav aria-label="Manual practice choices" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <Link to="/mates">Mates</Link>
      <Link to="/tactics">Tactics</Link>
      <Link to="/endgame">Endgames</Link>
      <Link to="/home">Home</Link>
      {signedIn && <Link to={DEMO_AUTO_ROUTE}>Return to Auto</Link>}
    </nav>
  </section>
}
