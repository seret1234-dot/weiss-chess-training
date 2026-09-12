import { Link } from "react-router-dom"
import {
  ACTIVE_SERVICE_PROVIDERS,
  COMPLIANCE_LAST_UPDATED,
  PRIVACY_LAST_UPDATED,
  SERVICE_OPERATOR,
} from "./complianceConfig"
import { RETENTION_POLICY } from "./retentionPolicy"
import { AnalyticsPreferences } from "../analytics/AnalyticsPreferences"
import "./compliance.css"

function ContactLink() {
  return <a href={`mailto:${SERVICE_OPERATOR.contactEmail}`}>{SERVICE_OPERATOR.contactEmail}</a>
}

function RetentionList({ hebrew }: { hebrew: boolean }) {
  return (
    <ul>
      {RETENTION_POLICY.map((item) => <li key={item.id}>{hebrew ? item.hebrew : item.english}</li>)}
    </ul>
  )
}

function LanguageLinks({ section, hebrew }: { section: "privacy" | "accessibility"; hebrew: boolean }) {
  return (
    <nav className="legal-language-links" aria-label={hebrew ? "בחירת שפה" : "Language selection"}>
      {hebrew ? <><Link to={`/${section}`}>English</Link><span aria-hidden="true">·</span><strong>עברית</strong></> : <><strong>English</strong><span aria-hidden="true">·</span><Link to={`/${section}/he`} lang="he" dir="rtl">עברית</Link></>}
    </nav>
  )
}

function LegalLayout({
  title,
  description,
  section,
  hebrew,
  children,
}: {
  title: string
  description: string
  section: "privacy" | "accessibility"
  hebrew: boolean
  children: React.ReactNode
}) {
  return (
    <article className="legal-page" lang={hebrew ? "he" : "en"} dir={hebrew ? "rtl" : "ltr"} aria-labelledby={`${section}-page-title`}>
      <div className="legal-page__card">
        <LanguageLinks section={section} hebrew={hebrew} />
        <h1 id={`${section}-page-title`}>{title}</h1>
        <p className="legal-page__lead">{description}</p>
        <p className="legal-page__updated"><strong>{hebrew ? "עודכן לאחרונה:" : "Last updated:"}</strong> {section === 'privacy' ? PRIVACY_LAST_UPDATED : COMPLIANCE_LAST_UPDATED}</p>
        {children}
      </div>
    </article>
  )
}

export function PrivacyPage({ hebrew = false }: { hebrew?: boolean }) {
  if (hebrew) {
    return (
      <LegalLayout hebrew title="מדיניות פרטיות" description="הסבר זה מתאר איזה מידע שירות Weiss Chess מעבד בפועל, מדוע ועם מי הוא עשוי להיות משותף." section="privacy">
        <AnalyticsPreferences hebrew />
        <section><h2>מי מפעיל את השירות וכיצד יוצרים קשר</h2><p>בעל השליטה במידע ומפעיל השירות הוא <strong>{SERVICE_OPERATOR.operatorDescriptionHe}</strong>. לפניות פרטיות, בקשות לעיון במידע או לתיקונו ולפניות אחרות בנושא פרטיות: <ContactLink />. השירות מופעל באופן מקוון ואינו מציע מקום ציבורי לקבלת קהל. לא מתפרסמים כתובת בית, מספר טלפון או מזהה אישי/עסקי פרטי.</p></section>
        <section><h2>מידע שמוסרים לנו</h2><ul><li>כתובת דוא״ל וסיסמה לצורך יצירה ואבטחה של חשבון. האימות מנוהל ב-Supabase; Weiss Chess אינו שומר עותק נפרד של הסיסמה הגלויה.</li><li>שמות משתמש ב-Chess.com וב-Lichess, אם בוחרים לחברם, וכן יעדי דירוג וזמן אימון.</li><li>תמונות לוח, עמדות, FEN או הקשר משחק שנשלחים מרצון לכלי הניתוח וההסבר.</li><li>בחירות שמירה ב״הספרייה שלי״ וב״הפתיחות שלי״.</li></ul></section>
        <section><h2>מידע שנוצר במהלך השימוש</h2><p>השירות שומר לפי הצורך מזהה חשבון, משחקים ציבוריים שיובאו, טעויות ועמדות שנותחו, תכנית לימוד, התקדמות, שליטה בחידות, מועדי חזרה, מבחנים שבועיים, והעדפות קורס. כאשר נרכש מנוי נשמרים מזהה המנוי, מצבו ומועדים תפעוליים; פרטי הכרטיס מוזנים אצל PayPal ואינם נשמרים ב-Weiss Chess.</p></section>
        <section><h2>אחסון בדפדפן</h2><p>האפליקציה משתמשת ב-localStorage וב-sessionStorage לצורך הפעלת החשבון, שמירת התקדמות מקומית, מכסות אורח, ערכת כלים, קואורדינטות, גודל לוח, העדפות נגישות ואימון, ניווט זמני ומטמון הסברים. כאשר תכנית השותפים פעילה ונכנסים דרך קישור שותף, נוצרת עוגיית צד ראשון מסוג HttpOnly למשך 30 יום לצורך שיוך ההפניה. Google Analytics 4 משתמש בעוגיות אנליטיקה של האתר רק לאחר הסכמה; ראו העדפות אנליטיקה לעיל. רכיב התשלום של PayPal עשוי להשתמש בעוגיות או בטכנולוגיות של PayPal בהתאם למדיניות PayPal.</p><p>למשתתפים בתכנית השותפים נשמרים גם קוד הפניה, שם תצוגה, קישורי אימות שנמסרו, דוא״ל לתשלום, הסכמה לתנאים, שיוכים ורשומות עמלות, תשלומים וביקורת. השותפים רואים נתונים מצטברים ומזהים אנונימיים של עמלות, לא את זהות הלקוחות. רשומות כספיות נשמרות לבירור תשלומים, החזרים ומחלוקות; מחיקתן אינה אוטומטית עם מחיקת חשבון. לפניות ולעיון או תיקון: <ContactLink />.</p></section>
        <section><h2>מטרות, מסירה וספקים</h2><p>המידע משמש להפעלת החשבון, התאמת אימון, שמירת התקדמות, יבוא משחקים, ניתוח, תמיכה במנוי, אבטחה ואבחון תקלות. השירות נעזר ב-{ACTIVE_SERVICE_PROVIDERS.join(", ")}. ספקי ענן עשויים לעבד מידע מחוץ לישראל לפי מיקום התשתית ותנאי הספק. איננו מוסרים מידע לצורכי פרסום התנהגותי.</p></section>
        <section><h2>מסירת מידע היא מרצון</h2><p>אין חובה חוקית למסור מידע ל-Weiss Chess. ללא דוא״ל וסיסמה לא ניתן ליצור חשבון או לסנכרן התקדמות. ללא שם משתמש חיצוני לא ניתן לייבא משחקים מאותו שירות, אך אפשר להשתמש בחלקים אחרים של המוצר. ללא פרטי תשלום לא ניתן להפעיל מנוי בתשלום.</p></section>
        <section><h2>אבטחה</h2><p>המערכת משתמשת באימות Supabase, הרשאות ברמת מסד הנתונים היכן שהוגדרו, HTTPS ותשתיות ענן. אין מערכת מאובטחת לחלוטין.</p></section>
        <section><h2>שמירה ומחיקה בפועל</h2><RetentionList hebrew /><p>לבקשת מחיקה תפעולית מאומתת פנו אל <ContactLink />. מחיקת נתוני Weiss Chess אינה מבטלת מנוי PayPal ואינה מוחקת רישומי עסקה של PayPal, ולכן יש לטפל במנוי פעיל בנפרד. עדיין אין מנגנון שרת בטוח למחיקה עצמית, ולא אומתה מחיקה מלאה של כל הטבלאות הוותיקות; לכן אין כאן הבטחה שכל המידע נמחק מיד.</p></section>
        <section><h2>עיון ותיקון</h2><p>בכפוף לסעיפים 13 ו-14 לחוק הגנת הפרטיות, ניתן לבקש לעיין במידע אישי ולבקש לתקן מידע שאינו נכון, שלם, ברור או מעודכן. פנו אל <ContactLink /> וציינו את כתובת הדוא״ל של החשבון ואת הבקשה. בקשת מחיקת חשבון היא בקשת מוצר נפרדת ואינה מוצגת כאן כזכות סטטוטורית כללית.</p></section>
        <section><h2>קטינים ושינויים</h2><p>השירות אינו כולל זרימת הסכמה הורית ייעודית. הורה או אפוטרופוס שמאמין כי קטין מסר מידע ללא הרשאה מתבקש לפנות אלינו. נעדכן מדיניות זו כאשר אופן העיבוד משתנה ונציג בעמוד את מועד העדכון.</p></section>
      </LegalLayout>
    )
  }

  return (
    <LegalLayout hebrew={false} title="Privacy Policy" description="This notice explains what information Weiss Chess actually processes, why it is used, and who may receive it." section="privacy">
      <AnalyticsPreferences />
      <section><h2>Who operates the service and how to contact us</h2><p>The controller and operator is <strong>{SERVICE_OPERATOR.operatorDescriptionEn}</strong>. For privacy inquiries, requests to inspect or access personal information, correction requests, or other privacy-related contact, email <ContactLink />. The service operates online and offers no public in-person service location. No home address, phone number, or private personal or business identifier is published.</p></section>
      <section><h2>Information you provide</h2><ul><li>Email address and password for account creation and security. Authentication is handled by Supabase; Weiss Chess does not keep a separate copy of your readable password.</li><li>Chess.com and Lichess usernames, if you connect them, plus optional rating goals and training-time choices.</li><li>Board images, positions, FEN, or game context that you choose to submit to analysis and explanation tools.</li><li>Games and openings you choose to save to My Library or My Openings.</li></ul></section>
      <section><h2>Information generated through use</h2><p>As needed to provide the service, we store an account identifier, imported public games, analyzed mistakes and positions, a study plan, puzzle mastery, progress, review schedules, weekly tests, and course preferences. If you buy a subscription, the service stores a subscription identifier, status, and operational dates. Card details are entered with PayPal and are not stored by Weiss Chess.</p></section>
      <section><h2>Browser storage</h2><p>The app uses localStorage and sessionStorage for account operation, local progress, guest quota, piece theme, coordinates, board size, accessibility and training preferences, temporary navigation, and explanation caches. When the Affiliate Program is enabled and you follow an affiliate link, a first-party HttpOnly cookie lasts 30 days to attribute the referral. Optional Google Analytics 4 uses first-party analytics cookies only after your consent; see Analytics preferences above. PayPal's checkout may use its own cookies or similar technology under PayPal's notice.</p><p>Affiliate participants also provide a referral code, display name, verification links, payout email and terms acceptance. Referral, commission, payout and audit records administer the program. Affiliates see aggregate statistics and anonymized commission references, not customer identities. Financial records are retained for payments, reversals and disputes rather than automatically erased on account deletion. Contact <ContactLink /> for privacy, access or correction requests.</p></section>
      <section><h2>Purposes, recipients, and cloud processing</h2><p>We use information to operate accounts, personalize training, preserve progress, import games, analyze positions, manage subscriptions, secure the service, and diagnose failures. Relevant recipients/processors are {ACTIVE_SERVICE_PROVIDERS.join(", ")}. Cloud providers may process information outside Israel according to their infrastructure and terms. We do not disclose information for behavioural advertising.</p></section>
      <section><h2>Providing information is voluntary</h2><p>You are not legally required to provide personal information to Weiss Chess. Without an email and password, you cannot create an account or synchronize progress. Without an external chess username, games cannot be imported from that service, but other product areas remain available. Without payment information submitted to PayPal, a paid membership cannot be activated.</p></section>
      <section><h2>Security</h2><p>The verified architecture uses Supabase authentication, database access controls where configured, HTTPS, and cloud infrastructure. No system can be guaranteed completely secure.</p></section>
      <section><h2>Operational retention and deletion</h2><RetentionList hebrew={false} /><p>For a verified operational deletion request, contact <ContactLink />. Deleting Weiss Chess data does not cancel a PayPal subscription or erase PayPal transaction records, so an active subscription must be handled separately. A safe self-service server endpoint and complete deletion coverage for every legacy table have not yet been verified, so this policy does not promise that all information is deleted immediately.</p></section>
      <section><h2>Access and correction</h2><p>Subject to sections 13 and 14 of Israel's Privacy Protection Law, you may request access to personal information and ask for correction when it is inaccurate, incomplete, unclear, or out of date. Email <ContactLink /> with your account email and request. An account-deletion request is a separate voluntary product request; this notice does not describe it as a general statutory deletion right.</p></section>
      <section><h2>Children and changes</h2><p>The service does not currently include a dedicated parental-consent flow. A parent or guardian who believes a child provided information without authorization should contact us. We will update this notice when material processing changes and show the revision date here.</p></section>
    </LegalLayout>
  )
}

export function AccessibilityPage({ hebrew = false }: { hebrew?: boolean }) {
  if (hebrew) {
    return (
      <LegalLayout hebrew title="הצהרת נגישות" description="Weiss Chess מחויב לשיפור הגישה לשירות השחמט המקוון לאנשים עם מוגבלות." section="accessibility">
        <section><h2>מסגרת ויעד</h2><p>אנו פועלים להתאמת השירות לחוק שוויון זכויות לאנשים עם מוגבלות, לתקנות נגישות השירות ולתקן הישראלי ת״י 5568 על תיקוניו, ברמת AA. הצהרה זו אינה טוענת שהאתר נגיש במלואו.</p></section>
        <section><h2>התאמות שבוצעו</h2><ul><li>קישור דילוג לתוכן הראשי וקישורי מדיניות קבועים.</li><li>כותרות ומטא-נתונים ייעודיים לעמודים אלה.</li><li>סגנון מיקוד ברור לקישורים, כפתורים ובקרי טופס.</li><li>תוויות ושיוך שגיאות בטפסי ההתחברות המרכזיים.</li><li>תיאור נסתר משותף ללוחות, כולל כיוון, תור, מצב כלים ומצב קואורדינטות.</li><li>רשימות מסעים מרכזיות כוללות שיוך מסע/צבע ומסע נוכחי.</li><li>משוב חשוב מסומן כאזור סטטוס נגיש היכן שנבדק.</li><li>שיפור מיקוד, שם ומלכודת מקלדת בדיאלוג בחירת כלי לקידום.</li><li>בהגדרות החשבון ניתן לכבות את דרישת זמן הזיהוי של שתי שניות בחישוב פתרון מושלם; ניסיונות שגויים ורמזים עדיין מונעים פתרון מושלם.</li><li>הממשק מגיב לרוחבי מסך שונים ומכבד העדפת הפחתת תנועה.</li></ul></section>
        <section><h2>מקלדת ולוח השחמט</h2><p>רוב הניווט והבקרים הרגילים ניתנים להפעלה במקלדת. לוחות משותפים כוללים תיאור קורא-מסך תמציתי של מטרת הלוח, הכיוון, התור, הכלים והמשבצת שנבחרה, ללא הכרזה מחדש בכל רינדור. שמות המשבצות נשארים זמינים בתיאור גם כשהקואורדינטות החזותיות כבויות. במאמני התבניות קיימים שדות מקור/יעד נגישים המשתמשים באותו צינור מסעים; בלוח הגדרת העמדה יש נקודת Tab אחת וניווט פנימי בחצים.</p></section>
        <section><h2>מגבלות ידועות</h2><p>נדרשת עדיין בדיקה ידנית מקיפה עם NVDA ועם טכנולוגיות מסייעות נוספות. טרם הושלמה בדיקה בכל שילובי הדפדפנים והטכנולוגיות המסייעות.</p></section>
        <section><h2>בדיקות ותאימות</h2><p>נבדקו מבנה סמנטי, מקלדת, מיקוד, רספונסיביות וטפסים באמצעות בדיקות אוטומטיות ובדיקה מקומית בדפדפן. בדיקה אוטומטית אינה מוכיחה עמידה משפטית מלאה. לא הושלמה בדיקת NVDA ידנית מקיפה, הסמכה חיצונית או בדיקה בכל שילובי דפדפן וטכנולוגיה מסייעת.</p></section>
        <section><h2>שירות מקוון ופנייה</h2><p>Weiss Chess הוא שירות מקוון ואינו מציע מקום ציבורי לקבלת קהל, ולכן אין כאן פירוט חניה, מעליות או סידורים פיזיים. לפניות בנושא נגישות: <ContactLink />. מומלץ לציין את העמוד, הדפדפן והמכשיר, הטכנולוגיה המסייעת והבעיה. לא מונה רכז נגישות; כתובת הדוא״ל היא ערוץ לפניות בנושא נגישות ואינה מוצגת כפרטי רכז או ממונה.</p></section>
      </LegalLayout>
    )
  }

  return (
    <LegalLayout hebrew={false} title="Accessibility Statement" description="Weiss Chess is committed to improving access to its online chess service for people with disabilities." section="accessibility">
      <section><h2>Framework and target</h2><p>We are working toward alignment with Israel's Equal Rights for Persons with Disabilities Law, the Service Accessibility Regulations, and Israeli Standard 5568 as amended, at target level AA. This statement does not claim that the site is fully accessible.</p></section>
      <section><h2>Adjustments implemented</h2><ul><li>A skip-to-content link and persistent legal links.</li><li>Dedicated titles and metadata for these legal pages.</li><li>Visible focus styling for links, buttons, and form controls.</li><li>Labels and error association on the main authentication form.</li><li>A shared hidden board description covering orientation, side to move, piece placement, and coordinate visibility.</li><li>Move/color association and current-step semantics on principal move lists.</li><li>Important feedback exposed as accessible status information where audited.</li><li>Focus entry, naming, Escape cancellation, and keyboard containment for the promotion dialog.</li><li>An Account Settings option can disable the two-second recognition requirement for puzzle mastery; wrong attempts and hints still prevent a perfect solve.</li><li>Responsive layouts and reduced-motion support.</li></ul></section>
      <section><h2>Keyboard and chessboard use</h2><p>Most ordinary navigation and controls work by keyboard. Shared boards provide a concise screen-reader description of purpose, orientation, side to move, pieces, and the selected square without announcing it on every render. Square names remain available in that description when visual coordinates are hidden. Pattern trainers provide source/destination fields that use the existing move pipeline; Setup Position uses one Tab stop with internal Arrow-key navigation.</p></section>
      <section><h2>Known limitations</h2><p>Comprehensive manual testing with NVDA and additional assistive technologies is still required. Testing across every browser and assistive-technology combination has not been completed.</p></section>
      <section><h2>Testing and compatibility</h2><p>Semantic structure, keyboard use, focus, responsive layouts, and forms were reviewed with automated checks and local browser testing. Automated checks do not establish legal conformity. A comprehensive manual NVDA session, independent certification, and exhaustive assistive-technology/browser testing have not been completed.</p></section>
      <section><h2>Online service and contact</h2><p>Weiss Chess is an online service and offers no public in-person service location, so this statement does not invent parking, lifts, or other physical arrangements. Accessibility inquiries: <ContactLink />. Please include the page, browser/device, assistive technology, and problem. No accessibility coordinator has been appointed; the email address is an accessibility-inquiries channel and is not presented as an officer or coordinator.</p></section>
    </LegalLayout>
  )
}
