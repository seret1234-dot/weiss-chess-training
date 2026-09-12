import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { affiliateApi } from './client'

export default function AffiliateTracking() {
 const location = useLocation(), navigate = useNavigate()
 useEffect(() => {
  const short = location.pathname.match(/^\/r\/([a-z0-9-]+)\/?$/i)
  const code = short?.[1] || new URLSearchParams(location.search).get('ref')
  if (!code) return
  // Tracking never blocks the trainer or changes its destination/query/hash.
  void affiliateApi('track', { code, destination: short ? '/' : `${location.pathname}${location.search}${location.hash}` })
   .catch(() => {})
   .finally(() => { if (short) navigate('/', { replace: true }) })
 }, [location.pathname, location.search, location.hash, navigate])
 useEffect(() => {
  let active = true
  const bind = () => { if (active) void affiliateApi('bind').catch(() => {}) }
  void supabase.auth.getSession().then(({ data }) => { if (data.session) bind() })
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
   if (event === 'SIGNED_IN' && session) window.setTimeout(bind, 0)
  })
  return () => { active = false; data.subscription.unsubscribe() }
 }, [])
 return null
}
