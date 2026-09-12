import { supabase } from '../lib/supabase'
export async function affiliateApi(action: string, data: Record<string, unknown> = {}) {
 const { data: session } = await supabase.auth.getSession()
 const response = await fetch('/api/affiliate', { method: 'POST', credentials: 'same-origin', headers: {
  'Content-Type': 'application/json', ...(session.session ? { Authorization: `Bearer ${session.session.access_token}` } : {}),
 }, body: JSON.stringify({ ...data, action }), signal: AbortSignal.timeout(action==='track'?5000:30000) })
 const result = await response.json()
 if (!response.ok) throw new Error(result.error==='AFFILIATE_ELIGIBILITY_UNAVAILABLE'
  ? `${result.error}: ${result.message} (${result.reason})` : result.error || 'Affiliate request failed')
 return result
}
export function referralLink(code: string, value = '/') {
 const url = new URL(value, 'https://weisschess.com')
 if (url.origin !== 'https://weisschess.com' || url.username || url.password) throw new Error('Choose a Weiss Chess URL')
 url.searchParams.set('ref', code)
 return url.href
}
