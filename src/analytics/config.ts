// Public web-stream ID, supplied centrally by the Production build environment.
export const ga4MeasurementId = String(import.meta.env.VITE_GA4_MEASUREMENT_ID ?? '').trim()
export const ga4Enabled = import.meta.env.PROD && /^G-[A-Z0-9]+$/.test(ga4MeasurementId)
export const ANALYTICS_CONSENT_KEY = 'weiss-analytics-consent-v1'
export const ANALYTICS_CONSENT_EVENT = 'weiss:analytics-consent-change'
export const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
let storageFailure = false

export function analyticsConsent(): 'granted' | 'denied' | null {
 if (storageFailure) return 'denied'
 try {
  const saved = JSON.parse(localStorage.getItem(ANALYTICS_CONSENT_KEY) ?? 'null')
  const age = Date.now() - saved?.at
  return age >= 0 && age < CONSENT_MAX_AGE_MS && ['granted', 'denied'].includes(saved?.value) ? saved.value : null
 } catch { return null }
}

export function saveAnalyticsConsent(value: 'granted' | 'denied') {
 // Fail closed if preferences cannot be stored; never infer consent from usage.
 try { localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({value, at: Date.now()})) }
 catch { storageFailure = true; window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT)); return false }
 storageFailure = false
 window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT))
 return true
}
