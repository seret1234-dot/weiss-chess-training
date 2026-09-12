import { useEffect, useState } from 'react'
import { analyticsConsent, ga4Enabled, saveAnalyticsConsent, ANALYTICS_CONSENT_EVENT, ANALYTICS_CONSENT_KEY } from './config'

// Deliberate opt-in on the existing Privacy page: no banner over the chessboard.
export function AnalyticsPreferences({hebrew = false}: {hebrew?: boolean}) {
 const [choice,setChoice] = useState(analyticsConsent)
 const [failed,setFailed] = useState(false)
 useEffect(() => {
  const update = () => setChoice(analyticsConsent())
  const storage = (e: StorageEvent) => { if (e.key === ANALYTICS_CONSENT_KEY || e.key === null) update() }
  window.addEventListener(ANALYTICS_CONSENT_EVENT,update);window.addEventListener('storage',storage)
  return () => {window.removeEventListener(ANALYTICS_CONSENT_EVENT,update);window.removeEventListener('storage',storage)}
 },[])
 function select(value: 'granted' | 'denied') {setFailed(!saveAnalyticsConsent(value));setChoice(analyticsConsent())}
 return <section id="analytics-preferences" aria-labelledby="analytics-preferences-title">
  <h2 id="analytics-preferences-title">{hebrew?'העדפות אנליטיקה':'Analytics preferences'}</h2>
  <p>{hebrew?'Google Analytics 4 נטען רק לאחר הסכמה מפורשת בדפדפן זה. אפשר לסרב ולהמשיך להשתמש באתר כרגיל. נשמרים נתוני שימוש כלליים וכתובות עמודים מסוננות, ללא שמות, דוא״ל, מזהי חשבון או תוכן משחקים. Google עשויה לעבד מזהי עוגיות, מידע על המכשיר ונתוני שימוש מחוץ לישראל. אין שימוש לפרסום מותאם אישית.':'Google Analytics 4 loads only after explicit consent in this browser. You can decline and use the site normally. We send general usage events and sanitized page URLs, not names, emails, account IDs or game content. Google may process cookie identifiers, device information and usage data outside Israel. Advertising personalization is disabled.'}</p>
  <p>{hebrew?'הבחירה נשמרת בדפדפן ל-180 יום. אפשר לשנותה כאן בכל עת. ביטול הסכמה מפסיק איסוף עתידי ומוחק את עוגיות GA של האתר; הוא אינו מוחק אוטומטית מידע שכבר התקבל אצל Google. תקופת שמירת המידע אצל Google תלויה בהגדרות הנכס.':'Your choice is stored in this browser for 180 days and can be changed here anytime. Withdrawing consent stops future collection and removes this site’s GA cookies; it does not automatically erase data already received by Google. Google-side retention depends on the property settings.'}</p>
  <p><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">{hebrew?'מדיניות הפרטיות של Google':'Google Privacy Policy'}</a></p>
  <p role="status">{failed?(hebrew?'לא ניתן לשמור את הבחירה. האנליטיקה נשארת כבויה.':'Could not save your preference. Analytics remains off.'):
   !ga4Enabled?(hebrew?'האנליטיקה אינה מוגדרת בבנייה זו.':'Analytics is not configured in this build.'):
   choice==='granted'?(hebrew?'אנליטיקה: פעילה בהסכמתך':'Analytics: on with your consent'):(hebrew?'אנליטיקה: כבויה':'Analytics: off')}</p>
  <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
   <button type="button" disabled={!ga4Enabled||choice==='granted'} onClick={()=>select('granted')}>{hebrew?'אישור אנליטיקה':'Allow analytics'}</button>
   <button type="button" onClick={()=>select('denied')}>{hebrew?'ללא אנליטיקה':'No analytics'}</button>
  </div>
 </section>
}
