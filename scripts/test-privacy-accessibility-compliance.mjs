import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const read = (path) => readFile(join(root, path), 'utf8')

const [router, pages, config, retention, chrome, notice, auth, account, onboarding, pricing, seo, metadata, sitemap, css, moveInput, shell, tactics, mates, analytics, packageJson, main, timedContext, timedSetting, timedPreference] = await Promise.all([
  read('src/AppRouter.tsx'),
  read('src/compliance/LegalPages.tsx'),
  read('src/compliance/complianceConfig.ts'),
  read('src/compliance/retentionPolicy.ts'),
  read('src/compliance/ComplianceChrome.tsx'),
  read('src/compliance/DataCollectionNotice.tsx'),
  read('src/AuthPage.tsx'),
  read('src/AccountPage.tsx'),
  read('src/pages/OnboardingPage.tsx'),
  read('src/PricingPage.tsx'),
  read('src/components/SeoHead.tsx'),
  read('src/seo/routeMetadata.json'),
  read('public/sitemap.xml'),
  read('src/compliance/compliance.css'),
  read('src/components/chess/AccessibleMoveInput.tsx'),
  read('src/components/trainer/TrainerShell.tsx'),
  read('src/trainers/patternTactic/PatternTacticTrainer.tsx'),
  read('src/trainers/patternMate/PatternMateTrainer.tsx'),
  read('src/lib/analytics.ts'),
  read('package.json'),
  read('src/main.tsx'),
  read('src/accessibility/TimedMasteryContext.tsx'),
  read('src/accessibility/TimedMasterySetting.tsx'),
  read('src/accessibility/timedMasteryPreference.ts'),
])

for (const route of ['/privacy', '/privacy/he', '/accessibility', '/accessibility/he']) {
  assert.match(router, new RegExp(`path="${route.replace('/', '\\/')}"`), `${route} is routed`)
  assert.ok(JSON.parse(metadata).routes[route], `${route} has SEO metadata`)
  assert.match(sitemap, new RegExp(`weisschess\\.com${route.replace('/', '\\/')}`), `${route} is in the sitemap`)
}

assert.match(router, /id="site-main-content"[\s\S]{0,120}role="main"[\s\S]{0,120}tabIndex=\{-1\}/)
assert.match(chrome, /href="#site-main-content"/)
assert.match(chrome, /to="\/privacy"/)
assert.match(chrome, /to="\/accessibility"/)
assert.match(css, /\.skip-to-content:focus/)
assert.match(css, /focus-visible/)
assert.match(css, /prefers-reduced-motion/)

assert.match(pages, /title="Privacy Policy"/)
assert.match(pages, /title="מדיניות פרטיות"/)
assert.match(pages, /title="Accessibility Statement"/)
assert.match(pages, /title="הצהרת נגישות"/)
assert.match(pages, /dir=\{hebrew \? "rtl" : "ltr"\}/)
assert.match(seo, /document\.documentElement\.lang = isHebrewLegalPage \? 'he' : 'en'/)
assert.match(pages, /does not claim that the site is fully accessible/i)
assert.doesNotMatch(pages, /fully (?:WCAG|AA) compliant|(?:is|are) completely secure|military-grade/i)

for (const provider of ['Supabase', 'Vercel', 'PayPal', 'Chess.com', 'Lichess', 'OpenAI']) {
  assert.match(config, new RegExp(`"${provider.replace('.', '\\.')}"`), `${provider} is centrally declared`)
}
assert.match(config, /Google Analytics 4 \(optional, consent only\)/, 'optional GA4 accurately disclosed')
assert.equal(/Meta Pixel|Hotjar|PostHog|Sentry/.test(config), false, 'inactive providers are not claimed')
assert.match(analytics, /window\.dataLayer/)
assert.doesNotMatch(packageJson, /google-analytics|posthog|hotjar|sentry/i)

assert.match(config, /legalName: "Ariel Weiss"/)
assert.match(config, /serviceName: "Weiss Chess"/)
assert.match(config, /legalStatusHe: "עוסק מורשה"/)
assert.match(config, /contactEmail: "seret1234@gmail\.com"/)
assert.match(config, /publicPhysicalAddress: null/)
assert.match(config, /publicPhone: null/)
assert.match(config, /accessibilityCoordinator: null/)
assert.match(config, /privacyPolicyReadyForPreview: true/)
assert.match(config, /israelAccessibilityReadyForPreview: false/)
assert.match(config, /operatorDescriptionEn: "Ariel Weiss, operating Weiss Chess as an Israeli self-employed business \(עוסק מורשה\)"/)
assert.match(config, /operatorDescriptionHe: "אריאל וייס, המפעיל את Weiss Chess כעוסק מורשה בישראל"/)
assert.match(pages, /SERVICE_OPERATOR\.operatorDescriptionEn/)
assert.match(pages, /SERVICE_OPERATOR\.operatorDescriptionHe/)
assert.match(pages, /Accessibility inquiries: <ContactLink/)
assert.match(pages, /לפניות בנושא נגישות: <ContactLink/)
assert.match(pages, /No accessibility coordinator has been appointed/)
assert.match(pages, /לא מונה רכז נגישות/)
assert.doesNotMatch(pages, /Accessibility (?:Coordinator|Officer):/)
assert.doesNotMatch(pages, /רכז(?:ת)? נגישות:\s*<ContactLink/)
assert.match(pages, /<RetentionList hebrew/)
assert.match(retention, /selfServiceAvailable: false/)
assert.match(retention, /privilegedServerDeletionEndpointAvailable: false/)
assert.match(retention, /requiresSeparatePayPalCancellation: true/)
assert.match(retention, /requiresSchemaAndServerWorkForSafeSelfServiceDeletion: true/)
for (const table of ['subscriptions', 'weekly_adaptive_tests', 'image_to_position_usage', 'coach_explanation_usage', 'user_master_games', 'user_opening_library']) {
  assert.match(retention, new RegExp(`"${table}"`), `${table} is included in the centralized deletion audit`)
}
for (const table of ['profiles', 'user_auto_profile', 'user_study_plan', 'training_progress', 'user_chunk_progress', 'user_imported_games', 'user_engine_mistakes']) {
  assert.match(retention, new RegExp(`"${table}"`), `${table} is explicitly marked as cascade-unverified`)
}
assert.match(pages, /does not cancel a PayPal subscription or erase PayPal transaction/)
assert.match(pages, /אינה מבטלת מנוי PayPal ואינה מוחקת רישומי עסקה/)
assert.match(pages, /does not promise that all information is deleted immediately/)
assert.match(pages, /אין כאן הבטחה שכל המידע נמחק מיד/)
assert.match(pages, /comprehensive manual NVDA session/)
assert.match(pages, /בדיקת NVDA ידנית מקיפה/)

assert.match(notice, /sections 13–14/)
assert.match(notice, /Controller:/)
assert.match(notice, /SERVICE_OPERATOR\.operatorDescriptionEn/)
assert.match(auth, /htmlFor="auth-email"/)
assert.match(auth, /htmlFor="auth-password"/)
assert.match(auth, /DataCollectionNotice context=\{mode === "signup" \? "signup" : "login"\}/)
assert.match(account, /DataCollectionNotice context="profile"/)
assert.match(onboarding, /DataCollectionNotice context="profile"/)
assert.match(pricing, /DataCollectionNotice context="payment"/)

assert.match(moveInput, /Select source/)
assert.match(moveInput, /onSquareClick\(square\)/)
assert.match(moveInput, /perfect-solve recognition timer starts at that action/)
assert.match(moveInput, /recognition time is not used for mastery/)
assert.match(shell, /boardControls\?: ReactNode/)
assert.match(tactics, /<AccessibleMoveInput/)
assert.match(mates, /<AccessibleMoveInput/)
assert.match(tactics, /onSquareClick=\{onSquareClick\}/)
assert.match(mates, /onSquareClick=\{onSquareClick\}/)
assert.match(pages, /An Account Settings option can disable the two-second recognition requirement/)
assert.match(pages, /accessibility and training preferences/)
assert.match(pages, /בהגדרות החשבון ניתן לכבות את דרישת זמן הזיהוי/)
assert.match(pages, /העדפות נגישות ואימון/)
assert.doesNotMatch(pages, /this audit did not change that training rule/)
assert.match(main, /<TimedMasteryProvider>/)
assert.match(account, /<TimedMasterySetting \/>/)
assert.match(timedContext, /window\.localStorage\.setItem\(TIMED_MASTERY_STORAGE_KEY/)
assert.match(timedSetting, /role="switch"/)
assert.match(timedSetting, /aria-describedby=\{helpId\}/)
assert.match(timedPreference, /weiss-chess-timed-mastery-enabled-v1/)
assert.match(timedPreference, /DEFAULT_TIMED_MASTERY_ENABLED = true/)

console.log('Privacy/accessibility compliance static checks passed.')
