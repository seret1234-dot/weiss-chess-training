import { Link } from "react-router-dom"
import { SERVICE_OPERATOR } from "./complianceConfig"

export default function DataCollectionNotice({ context }: { context: "signup" | "login" | "profile" | "payment" }) {
  const copy = context === "signup"
    ? "Account details are requested voluntarily to create and secure your account and synchronize training. Without them, an account cannot be created. Supabase processes authentication data."
    : context === "login"
      ? "Your email and password are used to authenticate the account through Supabase. Without them, you cannot sign in or synchronize account progress."
    : context === "profile"
      ? "Chess usernames and training goals are voluntary and are used to import public games and personalize training. Without a username, games from that service cannot be imported. Supabase stores the profile."
      : "Payment details are provided voluntarily to PayPal to activate a paid membership. Weiss Chess receives subscription identifiers and status, not your card details. When the Affiliate Program is enabled, verified transaction amounts, tax and refund information are also used to administer referral discounts and commissions through Supabase."

  return (
    <aside className="collection-notice" aria-label="Privacy notice">
      <p>{copy}</p>
      <p>
        Controller: {SERVICE_OPERATOR.operatorDescriptionEn}. Contact for privacy, access, and correction requests: <a href={`mailto:${SERVICE_OPERATOR.contactEmail}`}>{SERVICE_OPERATOR.contactEmail}</a>.
        You may request access or correction under sections 13–14 of Israel's Privacy Protection Law. <Link to="/privacy">Read the Privacy Policy</Link>.
      </p>
    </aside>
  )
}
