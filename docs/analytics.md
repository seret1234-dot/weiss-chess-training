# GA4 integration and release gates

Measurement ID supplied by the operator: G-RLHDSPZ8WH.
Production configuration: VITE_GA4_MEASUREMENT_ID=G-RLHDSPZ8WH.
The measurement ID is public, not a secret. No dependency was added.

## One event bridge

SiteAnalytics emits page_view for a new pathname (including back/forward), not
query/hash-only changes or duplicate router initialization. The existing
trackAnalyticsEvent bridge delivers once to the GA4 adapter. Existing product
events keep their names; no new login, Weekly, quota or revenue events are invented.
subscription_activated is an existing product signal, not a new GA purchase/revenue
event or proof of payment.

All query strings and hashes are dropped. Only checked-in static paths are retained;
dynamic identifiers/slugs collapse to a generic area/activity path. Titles are
generated from safe paths, never personal game names or DOM text. External referrers
are omitted. Event fields are allowlisted categorical values/booleans only.

## Consent and advertising

No Google script/request before explicit opt-in. There is no intrusive banner.
Use Privacy Policy -> Analytics preferences (English or Hebrew) to allow or refuse.
Consent is browser-local, expires after 180 days, and is not tied to an account.
Refusal does not affect service. No pre-consent events are replayed.
Revocation disables collection and removes only this integration's GA cookies.
Ads storage, ad user data, ad personalization and Google signals stay disabled.
Basic consent behavior is used; no pre-consent cookieless pings.

## Owner gate: Enhanced Measurement

Before production activation, in GA4 Admin -> Data streams -> Weiss Chess:
- Enhanced measurement -> settings -> Page views -> Show advanced settings:
  disable Page changes based on browser history events.
- Google tag -> Configure tag settings -> Manage automatic event detection:
  disable Page views on browser history change there too if present.
- Disable automatic search, outbound-click, form, video and file-download events
  for the first release. Their default URLs/search/form fields are outside our
  app allowlist and could contain identifying data. Scroll can remain if verified.
- Keep user-provided data collection, advertising features and personalization off.

send_page_view:false disables the tag's automatic initial view, NOT Enhanced
Measurement history views. Do not deploy until the owner setting is confirmed and
a real-tag network test proves one view per transition. Do not work around a
misconfigured property by filtering only browser requests.

## Validation

Build with VITE_GA4_MEASUREMENT_ID set, then:
- node scripts/test-ga4-production.mjs (deterministic transport)
- node scripts/test-ga4-production.mjs --real-tag (actual Google tag; intercept
  outgoing collection so synthetic test data is not ingested)
- node scripts/test-auto-entry-app-rendered.mjs
- node scripts/test-privacy-accessibility-compliance.mjs

After approved deployment verify actual collection and, with owner access, DebugView
or Realtime. Never equate seeing a browser request with a confirmed GA report.
Google-side data retention is an owner/property setting, not enforced by this code.

## Local verification checkpoint — 12 September 2026 (NOT deployed)

- Production build PASS. Main asset: index-CPX-AxZd.js;
  SHA-256 63baed51a7309c5df1368748f2d6baba00f20f7e4621f3814ec91c82978ca999.
- Focused analytics TypeScript and privacy/accessibility checks PASS.
- Production entry/login/Home/Manual/Weekly-resume regression PASS.
- Deterministic GA transport: consent/withdrawal, initial view, SPA navigation,
  back/forward, refresh, query/hash stripping, generic dynamic activity URLs,
  completion event once, blocked tag, authenticated account PII exclusion PASS.
- Actual Google tag: explicit consent/withdrawal PASS, then FAILED the /home
  single-pageview gate. Captured one manual view with
  page_location=https://weisschess.com/home AND one automatic view with the raw
  local browser URL. The total pageviews became 3 rather than 2 after / -> /home.
  Collection was intercepted, so synthetic visits were not ingested by Google.
- This confirms the owner Enhanced Measurement change above is required, not
  merely a precaution. Real-tag remaining tests/Realtime/production verification
  are NOT claimed as passed. Rerun after the property setting is saved.
- Production Vercel environment still has no VITE_GA4_MEASUREMENT_ID; no production
  configuration or deployment was changed in this checkpoint.

## Production activation — 12 September 2026

The owner confirmed history-based Page views, outbound clicks, search, forms,
video and downloads disabled; Page views and Scroll remain enabled.

- Real Google-tag gate PASS after that settings change: consent/withdrawal,
  one initial/SPA/back/forward/refresh pageview, URL and event sanitization,
  completion through the existing bridge once, blocked tag resilience and
  authenticated production-bundle Auto/Home/Manual flow. Fixture collection was
  intercepted, not ingested into the reporting property.
- Additional real-tag Scroll/collection smoke PASS locally. The enabled Scroll
  event uses the same sanitized URL, without query/hash identifiers.
- Final production build, focused analytics TypeScript, privacy checks and
  upload-scope audit PASS. Reports, snapshots and test scripts are excluded.
- Added ONLY VITE_GA4_MEASUREMENT_ID=G-RLHDSPZ8WH to Vercel Production (public Config).
- Direct source deployment: dpl_2zaFtw8doxiFmPRViUoCtSEmAeCA, READY.
  Canonical: https://weisschess.com
  Deployment: https://weiss-chess-training-iiv7hmgpq-seret1234-dots-projects.vercel.app
- Live main: /assets/index-BzZUOQcU.js
  SHA-256: 18e7c350eda940e75ba79099bbc116710720703fbec74dd9a948ded767455657
- CSS: /assets/index-DnQH2d9d.css
  SHA-256: 5ab4f43834b279a2f9ff808eaf59870de11ec394144583fa6c61f27c172a0bd1
  CSS is byte-identical to the tested local build.
- The remote JS is not byte-identical to the local JS: after normalizing hashed
  asset references, the only three differences are build-time substitutions for
  VITE_AFFILIATE_DISCOVERY_ENABLED, VITE_MASTER_PUZZLES_BASE_URL and
  VITE_PAYPAL_CLIENT_ID. These are existing Production configuration, not runtime
  source edits for this task. No other configuration variable was changed.
- Live collection smoke PASS with one fresh anonymous, explicitly opted-in visit:
  Privacy -> root -> Home -> Manual -> Back Rank trainer -> Pricing, then
  back/forward/refresh. Exactly 9 expected pageviews; one tag per document.
  Observed real scroll, landing_page_visited, training_session_started and
  subscription_page_viewed through the existing mechanisms. All 10 collection
  HTTP responses were 204. Sensitive test query/hash markers were absent.
  No fake purchase, signup or training-completion events were sent live.
- Live UI: EN/HE Privacy consent controls verified in the built-in browser;
  owner's analytics preference remained off/unchanged. No uncaught errors in the
  automated live visit. Root/Home/Manual/Privacy/Privacy HE/Pricing/Account/Analyze/
  Back Rank/robots/sitemap HTTP checks all 200; sitemap remains 52 URLs.
- Realtime/DebugView NOT verified: Google reporting UI requires owner sign-in.
  HTTP collection acceptance is not reported as a verified GA reporting screen.
- No database, user-progress, subscription, gameplay or quota changes; no commit
  or push. Existing bundle-size/npm audit/install-script warnings were not fixed
  or hidden, and no dependency upgrades or npm audit fix were run.

Repeat the non-fixture collection smoke with:
node scripts/test-ga4-collection-smoke.mjs
Use --production only for an authorized live anonymous visit; that mode permits
real collection, unlike the default local interception mode.
