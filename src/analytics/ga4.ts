import { analyticsConsent, ANALYTICS_CONSENT_EVENT, ANALYTICS_CONSENT_KEY, ga4Enabled, ga4MeasurementId } from './config'
import { analyticsPage, analyticsProperties } from './sanitize'
import type { AnalyticsEventName, AnalyticsPayload } from '../lib/analytics'

declare global { interface Window { gtag?: (...args: any[]) => void } }
const denied = {analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'}
let installed = false
let loaded = false
let lastPage = ''
let previousPage = ''
const approved = new Set<AnalyticsEventName>(['page_view','landing_page_visited','sign_up_started','sign_up_completed','training_session_started','training_session_completed','subscription_page_viewed','checkout_started','subscription_activated','sample_training_started','sample_training_completed','signup_prompt_viewed','signup_prompt_clicked','email_verification_required','onboarding_started','onboarding_completed'])

function disableCollection() {
 (window as unknown as Record<string, unknown>)[`ga-disable-${ga4MeasurementId}`] = true
 lastPage = ''; previousPage = ''
 window.gtag?.('consent','update',denied)
 // Only remove this integration's first-party GA cookies, never auth/preferences.
 for (const name of ['_ga', `_ga_${ga4MeasurementId.slice(2)}`]) {
  for (const domain of ['', location.hostname, '.weisschess.com']) {
   document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`
  }
 }
}

function send(event: AnalyticsEventName, payload: AnalyticsPayload) {
 if (!approved.has(event) || analyticsConsent() !== 'granted') {
  if (loaded && analyticsConsent() !== 'granted') disableCollection()
  return
 }
 const page = analyticsPage(location.href)
 // Different personal activities may share one sanitized reporting path. Keep
 // the raw pathname in memory only, so sanitization does not suppress a view.
 const routeKey = location.pathname
 if (event === 'page_view' && lastPage === routeKey) return
 if (!loaded) {
  loaded = true
  window.dataLayer = window.dataLayer ?? []
  window.gtag = function () { window.dataLayer!.push(arguments as unknown as Record<string, unknown>) }
  window.gtag('consent','default',denied)
  window.gtag('set', {allow_google_signals:false, allow_ad_personalization_signals:false, ads_data_redaction:true, url_passthrough:false, ...page, page_referrer:''})
  window.gtag('js',new Date())
  window.gtag('config',ga4MeasurementId, {send_page_view:false, allow_google_signals:false, allow_ad_personalization_signals:false, cookie_expires:180*24*60*60, cookie_update:false, ...page, page_referrer:''})
  const script = document.createElement('script')
  script.id = 'weiss-ga4'; script.async = true; script.referrerPolicy = 'no-referrer'
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`
  // A blocker/network failure must never affect the application.
  script.onerror = () => { /* no retry loop, no exception */ }
  document.head.appendChild(script)
 }
 (window as unknown as Record<string, unknown>)[`ga-disable-${ga4MeasurementId}`] = false
 window.gtag?.('consent','update',{...denied,analytics_storage:'granted'})
 const fields = analyticsProperties(payload)
 window.gtag?.('set',{...page,page_referrer:previousPage})
 window.gtag?.('event',event,{...fields,...page,page_referrer:previousPage,send_to:ga4MeasurementId})
 if (event === 'page_view') { lastPage = routeKey; previousPage = page.page_location }
}

export function initializeGa4() {
 if (!ga4Enabled || installed || typeof window === 'undefined') return
 installed = true
 window.weissAnalytics = {track:send}
 const changed = () => { if (analyticsConsent() !== 'granted' && loaded) disableCollection() }
 window.addEventListener(ANALYTICS_CONSENT_EVENT,changed)
 window.addEventListener('storage',event => { if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) changed() })
}
