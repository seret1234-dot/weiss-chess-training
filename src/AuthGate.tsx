import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { getOrCreateAutoProfile } from './training/getOrCreateAutoProfile'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        if (!cancelled) {
          setLoading(false)
        }
        return
      }

      const user = data.session?.user ?? null

      if (!user) {
        if (!cancelled) {
          setLoading(false)
        }
        return
      }

      const autoProfile = await getOrCreateAutoProfile(user.id)

      if (!autoProfile) {
        if (!cancelled) {
          setLoading(false)
        }
        return
      }

      const isOnboardingPage = location.pathname === '/onboarding'

      // Only force onboarding when incomplete.
      // Do not auto-redirect completed users anywhere here.
      if (!autoProfile.onboarding_complete && !isOnboardingPage) {
        navigate('/onboarding', { replace: true })
        return
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    check()

    return () => {
      cancelled = true
    }
  }, [navigate, location.pathname])

  if (loading) {
    return <div style={{ color: '#fff', padding: 20 }}>Loading...</div>
  }

  return <>{children}</>
}