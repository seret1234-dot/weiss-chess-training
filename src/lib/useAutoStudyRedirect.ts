import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getNextDueItem } from '../training/getNextDueItem'

export function useAutoStudyRedirect(user: any, profile: any) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!user || !profile) return
    if (profile.study_mode !== 'auto') return
    if (!profile.onboarding_complete) return

    async function redirect() {
      const nextItem = await getNextDueItem(user.id)

      if (!nextItem) {
        console.log('AUTO REDIRECT: no next item')
        return
      }

      console.log('AUTO REDIRECT RESULT:', nextItem)

      const route = nextItem.route || '/'

      console.log('AUTO REDIRECT TO:', route)

      if (location.pathname !== route) {
        navigate(route)
      }
    }

    redirect()
  }, [user, profile, navigate, location.pathname])
}