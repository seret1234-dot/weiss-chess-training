import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
 buildCurriculumAutoTrainingRoute,
 getCurriculumDecisionForUser,
} from '../training/curriculum/curriculumRuntime'

export function useAutoStudyRedirect(user: any, profile: any) {
 const navigate = useNavigate()
 const location = useLocation()

 useEffect(() => {
 if (!user || !profile) return
 if (profile.study_mode !== 'auto') return
 if (!profile.onboarding_complete) return

 async function redirect() {
 const nextItem = await getCurriculumDecisionForUser(user.id)

 if (!nextItem) {
 console.log('AUTO REDIRECT: no next item')
 return
 }

 console.log('AUTO REDIRECT RESULT:', nextItem)

 const route = buildCurriculumAutoTrainingRoute(nextItem)

 console.log('AUTO REDIRECT TO:', route)

 if (`${location.pathname}${location.search}` !== route) {
 navigate(route)
}
 }

 redirect()
 }, [user, profile, navigate, location.pathname])
}
