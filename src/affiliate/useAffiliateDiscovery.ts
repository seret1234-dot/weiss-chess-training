import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { affiliateApi } from './client'

// Presentation only; all affiliate authorization remains on the server.
export function useAffiliateDiscovery() {
 const [state, setState] = useState({ visible: import.meta.env.VITE_AFFILIATE_DISCOVERY_ENABLED === true, active: false })
 const destination = useRef<Promise<string>>(Promise.resolve('/affiliate'))
 useEffect(() => {
  let alive = true, revision = 0
  const timers = new Set<number>()
  async function loadFlag() {
   try {
    const response = await fetch('/api/price-profile', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Affiliate discovery unavailable')
    const enabled = (await response.json()).affiliateCheckout === true
    if (alive) setState(previous => ({ ...previous, visible: enabled }))
   } catch {
    // A transient network failure is not an OFF flag. Retry without hiding a
    // previously confirmed card; only an explicit server response disables it.
    if (alive) {
     const timer = window.setTimeout(() => { timers.delete(timer); void loadFlag() }, 5000)
     timers.add(timer)
    }
   }
  }
  void loadFlag()
  function refresh() {
   const current = ++revision
   destination.current = (async () => {
   let active = false
   try {
    const { data } = await supabase.auth.getSession()
    if (data.session) active = (await affiliateApi('dashboard')).account?.status === 'active'
   } catch { /* Failed/absent membership falls back to the public program page. */ }
   if (alive && current === revision) setState(previous => ({ ...previous, active }))
   return active ? '/affiliate/dashboard' : '/affiliate'
   })()
  }
  void refresh()
  const { data } = supabase.auth.onAuthStateChange(() => {
   // Do not call asynchronous Supabase APIs while the auth callback holds its lock.
   const timer = window.setTimeout(() => { timers.delete(timer); if (alive) void refresh() }, 0)
   timers.add(timer)
  })
  return () => { alive = false; revision++; data.subscription.unsubscribe(); timers.forEach(window.clearTimeout) }
 }, [])
 async function resolveHref(): Promise<string> {
  const pending = destination.current
  const href = await pending
  return pending === destination.current ? href : resolveHref()
 }
 return { ...state, href: state.active ? '/affiliate/dashboard' : '/affiliate', resolveHref }
}
