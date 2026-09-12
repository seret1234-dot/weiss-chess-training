export const COMPLIANCE_LAST_UPDATED = "6 September 2026"
export const PRIVACY_LAST_UPDATED = "12 September 2026"

export const SERVICE_OPERATOR = {
  legalName: "Ariel Weiss",
  serviceName: "Weiss Chess",
  legalStatusHe: "עוסק מורשה",
  operatorDescriptionEn: "Ariel Weiss, operating Weiss Chess as an Israeli self-employed business (עוסק מורשה)",
  operatorDescriptionHe: "אריאל וייס, המפעיל את Weiss Chess כעוסק מורשה בישראל",
  contactEmail: "seret1234@gmail.com",
  publicPhysicalAddress: null,
  publicPhone: null,
  accessibilityCoordinator: null,
} as const

export const ACTIVE_SERVICE_PROVIDERS = [
  "Supabase",
  "Vercel",
  "PayPal",
  "Chess.com",
  "Lichess",
  "OpenAI",
  "Google Analytics 4 (optional, consent only)",
] as const

export const PRIVACY_FACTS = {
  configuredThirdPartyAnalyticsProvider: true,
  applicationCookies: true, // Affiliate attribution; optional GA only after consent.
  selfServiceAccountDeletion: false,
  publicPhysicalServiceLocation: false,
} as const

export const COMPLIANCE_READINESS = {
  privacyPolicyReadyForPreview: true,
  israelAccessibilityReadyForPreview: false,
} as const
