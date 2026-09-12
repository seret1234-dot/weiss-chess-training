export type RetentionPolicyItem = {
  id: string
  english: string
  hebrew: string
}

/**
 * Operational statements verified against the current application code and
 * repository schema history. These deliberately avoid invented time periods.
 */
export const RETENTION_POLICY: RetentionPolicyItem[] = [
  {
    id: "affiliate",
    english: "When the Affiliate Program is enabled, the referral cookie lasts 30 days and expired anonymous visitor records are removed incrementally. Affiliate applications, attributed accounts, payment/commission records, payout references and administrative audit history are retained for program administration and financial reconciliation. They are not automatically erased when an account closes; verified retention, access, correction and deletion requests require operational review.",
    hebrew: "כאשר תכנית השותפים פעילה, עוגיית ההפניה תקפה ל־30 יום ורשומות מבקרים אנונימיות שפג תוקפן מוסרות בהדרגה. בקשות הצטרפות, חשבונות שיוחסו להפניה, רישומי תשלום ועמלה, אסמכתאות העברה ויומן פעולות מנהל נשמרים לניהול התכנית ולהתאמה כספית. הם אינם נמחקים אוטומטית עם סגירת חשבון; בקשות מאומתות בנושא שמירה, עיון, תיקון ומחיקה דורשות בדיקה תפעולית.",
  },
  {
    id: "account-auth",
    english: "Account and authentication data are kept while the account remains active. There is no self-service account-deletion endpoint; verified requests are handled operationally. Authentication logs and backups follow the provider's configured plan and retention settings.",
    hebrew: "נתוני החשבון והאימות נשמרים כל עוד החשבון פעיל. אין כיום מנגנון מחיקה עצמית של חשבון; בקשות מאומתות מטופלות תפעולית. לוגים וגיבויים של האימות נשמרים לפי התכנית והגדרות השמירה של הספק.",
  },
  {
    id: "profile-plan",
    english: "Profile details, connected chess usernames, goals, and the personalized study plan remain attached to the active account. Their complete cascading deletion has not yet been verified across the production schema.",
    hebrew: "פרטי פרופיל, שמות משתמש בשירותי שחמט, יעדים ותכנית הלימוד האישית נשארים מקושרים לחשבון הפעיל. מחיקה מדורגת מלאה שלהם טרם אומתה בכל סכמת הייצור.",
  },
  {
    id: "training",
    english: "Training progress, chunk progress, mastery, review schedules, category statistics, curriculum evidence, and weekly tests are kept to preserve training continuity. Complete cascading deletion is verified only for the tables explicitly identified in the deletion audit.",
    hebrew: "התקדמות אימון, התקדמות מקטעים, שליטה, מועדי חזרה, סטטיסטיקות קטגוריה, ראיות תכנית לימוד ומבחנים שבועיים נשמרים לצורך רציפות האימון. מחיקה מדורגת מלאה אומתה רק לטבלאות שזוהו במפורש בבדיקת המחיקה.",
  },
  {
    id: "libraries",
    english: "My Library and My Openings bookmarks remain until the user removes them or the linked account is deleted. Current repository migrations define these two bookmark tables with ON DELETE CASCADE from the Auth user.",
    hebrew: "סימניות ״הספרייה שלי״ ו״הפתיחות שלי״ נשמרות עד שהמשתמש מסיר אותן או שהחשבון המקושר נמחק. המיגרציות הנוכחיות במאגר מגדירות לשתי טבלאות הסימניות מחיקה מדורגת ממשתמש האימות.",
  },
  {
    id: "analysis-imports",
    english: "Imported public games, analyzed mistakes and positions, usage counters, and generated plan data remain available to the active account. The repository does not prove one complete deletion cascade for all of these legacy tables.",
    hebrew: "משחקים ציבוריים שיובאו, טעויות ועמדות שנותחו, מוני שימוש ונתוני תכנית שנוצרו נשארים זמינים לחשבון הפעיל. המאגר אינו מוכיח מחיקה מדורגת מלאה אחת לכל הטבלאות הוותיקות האלה.",
  },
  {
    id: "subscription",
    english: "Weiss Chess keeps the PayPal subscription identifier, status, plan, and operational dates needed to manage access. The local subscription table is defined to cascade with Auth-user deletion, but deleting Weiss Chess data does not cancel a PayPal subscription or erase PayPal transaction, compliance, or account records.",
    hebrew: "Weiss Chess שומר מזהה מנוי PayPal, מצב, מסלול ומועדים תפעוליים הדרושים לניהול הגישה. טבלת המנוי המקומית מוגדרת למחיקה מדורגת עם מחיקת משתמש האימות, אך מחיקת נתוני Weiss Chess אינה מבטלת מנוי PayPal ואינה מוחקת רישומי עסקה, ציות או חשבון של PayPal.",
  },
  {
    id: "browser",
    english: "Local and session browser data remain on the device until the app, user, or browser clears them. Logging out clears the Supabase session but intentionally preserves harmless device preferences such as piece theme and coordinates; local training caches or guest progress may also remain until browser storage is cleared.",
    hebrew: "נתוני localStorage ו-sessionStorage נשארים במכשיר עד שהאפליקציה, המשתמש או הדפדפן מנקים אותם. יציאה מהחשבון מנקה את הפעלת Supabase אך משמרת בכוונה העדפות מכשיר לא מזיקות כגון ערכת כלים וקואורדינטות; מטמוני אימון מקומיים או התקדמות אורח עשויים להישאר עד ניקוי אחסון הדפדפן.",
  },
  {
    id: "provider-records",
    english: "Security, API, hosting, payment, and provider logs or backups follow each provider's settings, plan, legal duties, and retention windows. They may remain for a limited provider-controlled period after live application records are removed; Weiss Chess does not state one universal duration that the repository cannot verify.",
    hebrew: "לוגים או גיבויים של אבטחה, API, אחסון, תשלום וספקים נשמרים לפי הגדרות, תכנית, חובות משפטיות וחלונות השמירה של כל ספק. הם עשויים להישאר לתקופה מוגבלת בשליטת הספק לאחר הסרת הרשומות החיות באפליקציה; Weiss Chess אינו מצהיר על משך אחיד שהמאגר אינו יכול לאמת.",
  },
]

export const ACCOUNT_DELETION_AUDIT = {
  selfServiceAvailable: false,
  privilegedServerDeletionEndpointAvailable: false,
  cascadeVerifiedTables: [
    "subscriptions",
    "weekly_adaptive_tests",
    "image_to_position_usage",
    "coach_explanation_usage",
    "user_master_games",
    "user_opening_library",
  ],
  cascadeUnverifiedTables: [
    "profiles",
    "user_auto_profile",
    "user_study_plan",
    "training_progress",
    "user_chunk_progress",
    "user_category_stats",
    "user_imported_games",
    "user_engine_mistakes",
    "user_curriculum_state",
    "user_curriculum_area_progress",
    "user_curriculum_stage_progress",
    "user_curriculum_theme_progress",
    "user_curriculum_session_evidence",
  ],
  providerOrOperationalRecords: ["paypal_webhook_events", "provider logs", "provider backups", "PayPal records"],
  requiresSeparatePayPalCancellation: true,
  requiresSchemaAndServerWorkForSafeSelfServiceDeletion: true,
} as const
