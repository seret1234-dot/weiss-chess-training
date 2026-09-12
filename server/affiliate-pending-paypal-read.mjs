import { getPayPalAccessToken, getPayPalBaseUrl, getPayPalMode } from './paypal-subscription-core.mjs'
const code = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : null
const debugId = value => typeof value === 'string' && /^[a-f0-9]{8,64}$/i.test(value) ? value : null

// Shared eligibility transport. Uses the existing production OAuth helper, not a
// separate credential system. Never returns raw errors, headers, tokens or payer data.
export function pendingPayPalReader(diagnostics, authoritativeIds) {
  if(!Array.isArray(authoritativeIds) || authoritativeIds.length>12 || authoritativeIds.some(id=>!/^I-[A-Z0-9]+$/i.test(id))) throw Error('Invalid authoritative history IDs')
  const paths=new Set(authoritativeIds.map(id=>`/v1/billing/subscriptions/${id}`))
  let tokenPromise
  return async function read(path) {
    const base = getPayPalBaseUrl()
    const url = new URL(path, base)
    const expected=getPayPalMode()==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com'
    if (base !== expected || url.origin !== base || !paths.has(url.pathname)
      || !!url.search || !!url.hash) throw Error('Read path rejected')
    const diagnostic = { api_base: base, endpoint_path: url.pathname,
      start_time: url.searchParams.get('start_time'), end_time: url.searchParams.get('end_time'),
      oauth_succeeded: false, http_status: null, paypal_error_name: null, paypal_issue_codes: [], debug_id: null }
    diagnostics.push(diagnostic)
    try {
      tokenPromise ??= getPayPalAccessToken()
      const token = await tokenPromise
      diagnostic.oauth_succeeded = true
      const response = await fetch(url.href, { method: 'GET', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
      diagnostic.http_status = response.status
      const payload = await response.json().catch(() => null)
      // Only PayPal's request-correlation ID is permitted from response headers.
      diagnostic.debug_id = debugId(payload?.debug_id) || debugId(response.headers.get('paypal-debug-id'))
      if (!response.ok) {
        diagnostic.paypal_error_name = code(payload?.name)
        diagnostic.paypal_issue_codes = Array.isArray(payload?.details)
          ? [...new Set(payload.details.slice(0,10).map(d => code(d.issue)).filter(Boolean))] : []
        throw Error('Provider read failed')
      }
      if (!payload || typeof payload !== 'object') throw Error('Invalid provider JSON')
      return payload
    } catch {
      // Keep the existing verifier's fail-closed exception contract; diagnostics
      // are separately projected and contain no credential-bearing error object.
      throw Object.assign(Error('Provider read unavailable'),{providerDiagnostic:diagnostic})
    }
  }
}
