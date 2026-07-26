import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  PayPalButtons,
  PayPalScriptProvider,
  usePayPalScriptReducer,
} from "@paypal/react-paypal-js"
import { useSubscription } from "./context/SubscriptionContext"
import { supabase } from "./lib/supabase"

type BillingPeriod = "monthly" | "yearly"
type PayPalMode = "sandbox" | "live"

type PriceProfile = {
  mode: PayPalMode
  currency: string
  monthlyPrice: string
  yearlyPrice: string
  monthlyPlanId: string
  yearlyPlanId: string
}

const paypalClientId = String(
  import.meta.env.VITE_PAYPAL_CLIENT_ID || "",
)

function PayPalSubscriptionButton({
  userId,
  planId,
  period,
  onApproved,
}: {
  userId: string
  planId: string
  period: BillingPeriod
  onApproved: (subscriptionId: string) => Promise<void>
}) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  const [message, setMessage] = useState("")
  const [approving, setApproving] = useState(false)

  if (isRejected) {
    return (
      <div style={checkoutErrorStyle}>
        PayPal failed to load. Refresh the page and try again.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 18 }}>
      {isPending && (
        <div style={checkoutStatusStyle}>Loading PayPal...</div>
      )}

      <PayPalButtons
        key={planId}
        forceReRender={[planId, userId, period]}
        disabled={approving}
        style={{
          shape: "rect",
          color: "gold",
          layout: "vertical",
          label: "subscribe",
          height: 48,
        }}
        createSubscription={(_data, actions) =>
          actions.subscription.create({
            plan_id: planId,
            custom_id: `${userId}|${period}`,
          })
        }
        onApprove={async (data) => {
          if (!data.subscriptionID) {
            setMessage("PayPal did not return a subscription ID.")
            return
          }

          setApproving(true)
          setMessage("Verifying and activating Premium...")

          try {
            await onApproved(data.subscriptionID)
            setMessage("Premium is active.")
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "PayPal verification failed.",
            )
          } finally {
            setApproving(false)
          }
        }}
        onCancel={() => {
          setMessage("Checkout was cancelled.")
        }}
        onError={(error) => {
          console.error("PayPal subscription error", error)
          setMessage("PayPal checkout failed. Please try again.")
        }}
      />

      {message && (
        <div
          style={
            message === "Premium is active."
              ? checkoutSuccessStyle
              : checkoutErrorStyle
          }
        >
          {message}
        </div>
      )}
    </div>
  )
}

function CheckoutButton({
  userLoaded,
  userId,
  planId,
  period,
  onApproved,
  onLogin,
}: {
  userLoaded: boolean
  userId: string | null
  planId: string
  period: BillingPeriod
  onApproved: (subscriptionId: string) => Promise<void>
  onLogin: () => void
}) {
  if (!userLoaded) {
    return <div style={checkoutStatusStyle}>Loading account...</div>
  }

  if (!userId) {
    return (
      <button style={primaryButtonStyle} onClick={onLogin}>
        Log in to subscribe
      </button>
    )
  }

  if (!planId) {
    return (
      <div style={checkoutErrorStyle}>
        This PayPal plan is not configured.
      </div>
    )
  }

  return (
    <PayPalSubscriptionButton
      userId={userId}
      planId={planId}
      period={period}
      onApproved={onApproved}
    />
  )
}

export default function PricingPage() {
  const navigate = useNavigate()
  const {
    isPremium,
    subscription,
    loading: subscriptionLoading,
    refreshSubscription,
  } = useSubscription()

  const [userId, setUserId] = useState<string | null>(null)
  const [userLoaded, setUserLoaded] = useState(false)
  const [priceProfile, setPriceProfile] =
    useState<PriceProfile | null>(null)
  const [priceProfileError, setPriceProfileError] = useState("")
  const [activationMessage, setActivationMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadInitialSession() {
      const { data } = await supabase.auth.getSession()

      if (!cancelled) {
        setUserId(data.session?.user?.id ?? null)
        setUserLoaded(true)
      }
    }

    void loadInitialSession()

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return
        setUserId(session?.user?.id ?? null)
        setUserLoaded(true)
      })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPriceProfile() {
      try {
        const response = await fetch("/api/price-profile", {
          cache: "no-store",
        })
        const data = await response.json().catch(() => null)

        if (
          !response.ok ||
          !data ||
          (data.mode !== "sandbox" && data.mode !== "live") ||
          typeof data.monthlyPrice !== "string" ||
          typeof data.yearlyPrice !== "string" ||
          typeof data.monthlyPlanId !== "string" ||
          typeof data.yearlyPlanId !== "string"
        ) {
          throw new Error("Invalid price-profile response")
        }

        if (!cancelled) {
          setPriceProfile({
            mode: data.mode,
            currency:
              typeof data.currency === "string"
                ? data.currency
                : "USD",
            monthlyPrice: data.monthlyPrice,
            yearlyPrice: data.yearlyPrice,
            monthlyPlanId: data.monthlyPlanId,
            yearlyPlanId: data.yearlyPlanId,
          })
          setPriceProfileError("")
        }
      } catch (error) {
        console.error("Price-profile error", error)

        if (!cancelled) {
          setPriceProfile(null)
          setPriceProfileError(
            "Prices are temporarily unavailable. Please refresh the page.",
          )
        }
      }
    }

    void loadPriceProfile()

    return () => {
      cancelled = true
    }
  }, [])

  async function verifyApprovedSubscription(
    subscriptionId: string,
  ) {
    setActivationMessage("")

    const sessionResult = await supabase.auth.getSession()
    const accessToken = sessionResult.data.session?.access_token

    if (sessionResult.error || !accessToken) {
      throw new Error(
        "Please log in again before verifying payment.",
      )
    }

    const response = await fetch(
      "/api/verify-paypal-subscription",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscriptionId }),
      },
    )
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(
        data?.error ||
          "PayPal subscription verification failed.",
      )
    }

    await refreshSubscription()
    setActivationMessage(
      "Payment verified. Premium has been activated for this account.",
    )
  }

  const yearlySavings = (() => {
    const monthly = Number(
      priceProfile?.monthlyPrice.replace(/[^0-9.]/g, ""),
    )
    const yearly = Number(
      priceProfile?.yearlyPrice.replace(/[^0-9.]/g, ""),
    )

    if (!monthly || !yearly) return "Save with annual billing"

    const percentage = Math.round(
      (1 - yearly / (monthly * 12)) * 100,
    )

    return percentage > 0
      ? `Save about ${percentage}%`
      : "One annual payment"
  })()

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {priceProfile?.mode === "sandbox" && (
          <div style={sandboxStyle}>
            PayPal Sandbox test mode — no real money will be charged
          </div>
        )}

        {priceProfile?.mode === "live" && (
          <div style={secureStyle}>Secure recurring billing by PayPal</div>
        )}

        <div style={eyebrowStyle}>
          Weiss Chess Trainer Premium
        </div>

        <h1 style={titleStyle}>
          Build your complete personalized training plan
        </h1>

        <p style={subtitleStyle}>
          Unlimited puzzles, openings, master games and endgames,
          plus Auto Study, spaced repetition, progress tracking and
          AI coach notes. Free accounts receive 10 training items daily.
        </p>

        {activationMessage && (
          <div style={approvedStyle}>{activationMessage}</div>
        )}

        {subscriptionLoading ? (
          <div style={statusStyle}>Loading membership...</div>
        ) : isPremium ? (
          <div style={premiumStyle}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>
              Premium is active
            </div>

            <div style={{ marginTop: 8 }}>
              Plan: {subscription?.plan || "Premium"}
            </div>

            {subscription?.cancel_at_period_end && (
              <div style={{ marginTop: 8 }}>
                Renewal is cancelled. Access remains available until
                the end of the paid period.
              </div>
            )}

            <button
              style={secondaryButtonStyle}
              onClick={() => navigate("/account")}
            >
              Manage membership
            </button>
          </div>
        ) : (
          <>
            {priceProfileError ? (
              <div style={checkoutErrorStyle}>
                {priceProfileError}
              </div>
            ) : !priceProfile ? (
              <div style={statusStyle}>Loading secure prices...</div>
            ) : !paypalClientId ? (
              <div style={checkoutErrorStyle}>
                PayPal Client ID is missing from the site environment.
              </div>
            ) : (
              <PayPalScriptProvider
                options={{
                  clientId: paypalClientId,
                  components: "buttons",
                  currency: priceProfile.currency,
                  intent: "subscription",
                  vault: true,
                }}
              >
                <div style={plansStyle}>
                  <div style={planCardStyle}>
                    <div style={planNameStyle}>Monthly</div>
                    <div style={priceStyle}>
                      {priceProfile.monthlyPrice}
                    </div>
                    <div style={periodStyle}>per month</div>

                    <ul style={featureListStyle}>
                      <li>Unlimited puzzles, openings and master games</li>
                      <li>Unlimited endgame and board-vision training</li>
                      <li>Full Auto Study and spaced repetition</li>
                      <li>30 AI Coach explanations each month</li>
                      <li>Complete progress tracking</li>
                      <li>Cancel renewal from your account</li>
                    </ul>

                    <CheckoutButton
                      userLoaded={userLoaded}
                      userId={userId}
                      planId={priceProfile.monthlyPlanId}
                      period="monthly"
                      onApproved={verifyApprovedSubscription}
                      onLogin={() => navigate("/auth")}
                    />
                  </div>

                  <div
                    style={{
                      ...planCardStyle,
                      ...recommendedCardStyle,
                    }}
                  >
                    <div style={badgeStyle}>Best value</div>
                    <div style={planNameStyle}>Yearly</div>
                    <div style={priceStyle}>
                      {priceProfile.yearlyPrice}
                    </div>
                    <div style={periodStyle}>per year</div>

                    <ul style={featureListStyle}>
                      <li>Everything in Premium</li>
                      <li>{yearlySavings}</li>
                      <li>Full personalized study plan</li>
                      <li>Unlimited training and progress history</li>
                      <li>One annual payment</li>
                    </ul>

                    <CheckoutButton
                      userLoaded={userLoaded}
                      userId={userId}
                      planId={priceProfile.yearlyPlanId}
                      period="yearly"
                      onApproved={verifyApprovedSubscription}
                      onLogin={() => navigate("/auth")}
                    />
                  </div>
                </div>
              </PayPalScriptProvider>
            )}
          </>
        )}

        <div style={billingNoteStyle}>
          Subscriptions renew automatically until cancelled. Cancelling
          stops future billing; access continues through the paid period.
        </div>

        <button
          style={backButtonStyle}
          onClick={() => navigate("/")}
        >
          Back to home
        </button>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--theme-page-bg, #231f1d)",
  color: "var(--theme-text, #f4f4f4)",
  padding: "40px 20px 90px",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
}

const shellStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  textAlign: "center",
}

const sandboxStyle: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 24,
  padding: "9px 14px",
  borderRadius: 999,
  background: "rgba(242,193,78,0.14)",
  border: "1px solid rgba(242,193,78,0.4)",
  color: "#f2c14e",
  fontSize: 12,
  fontWeight: 800,
}

const secureStyle: React.CSSProperties = {
  ...sandboxStyle,
  background: "rgba(129,182,76,0.14)",
  border: "1px solid rgba(129,182,76,0.4)",
  color: "#cfe9b4",
}

const eyebrowStyle: React.CSSProperties = {
  color: "var(--theme-accent-strong, #9dcc68)",
  fontWeight: 800,
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 1.2,
}

const titleStyle: React.CSSProperties = {
  fontSize: 42,
  lineHeight: 1.1,
  margin: "14px auto 12px",
  maxWidth: 760,
}

const subtitleStyle: React.CSSProperties = {
  color: "var(--theme-muted, #c8c8c8)",
  fontSize: 17,
  lineHeight: 1.65,
  maxWidth: 740,
  margin: "0 auto 28px",
}

const plansStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 20,
  textAlign: "left",
}

const planCardStyle: React.CSSProperties = {
  background: "var(--theme-panel, #1f1d1c)",
  border: "1px solid var(--theme-border, rgba(255,255,255,0.08))",
  borderRadius: 24,
  padding: 28,
  position: "relative",
  boxShadow: "var(--theme-shadow, 0 18px 50px rgba(0,0,0,0.35))",
}

const recommendedCardStyle: React.CSSProperties = {
  border: "1px solid rgba(129,182,76,0.65)",
}

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  background: "var(--theme-accent, #81b64c)",
  color: "#fff",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 800,
}

const planNameStyle: React.CSSProperties = {
  fontSize: 23,
  fontWeight: 800,
}

const priceStyle: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  marginTop: 18,
}

const periodStyle: React.CSSProperties = {
  color: "var(--theme-muted, #aaa)",
  marginBottom: 20,
}

const featureListStyle: React.CSSProperties = {
  paddingLeft: 20,
  color: "var(--theme-text, #ddd)",
  lineHeight: 1.9,
  minHeight: 190,
}

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 13,
  padding: "14px 18px",
  background: "var(--theme-accent, #81b64c)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
}

const secondaryButtonStyle: React.CSSProperties = {
  marginTop: 20,
  border: "none",
  borderRadius: 12,
  padding: "13px 18px",
  background: "var(--theme-accent, #81b64c)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
}

const premiumStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: "30px auto",
  padding: 28,
  borderRadius: 22,
  background: "rgba(129,182,76,0.15)",
  border: "1px solid rgba(129,182,76,0.45)",
}

const approvedStyle: React.CSSProperties = {
  maxWidth: 620,
  margin: "0 auto 24px",
  padding: 18,
  borderRadius: 16,
  background: "rgba(129,182,76,0.14)",
  border: "1px solid rgba(129,182,76,0.4)",
  color: "#dff3c5",
  fontSize: 14,
  fontWeight: 700,
}

const checkoutStatusStyle: React.CSSProperties = {
  padding: "13px 0",
  color: "var(--theme-muted, #c8c8c8)",
  textAlign: "center",
  fontSize: 13,
}

const checkoutErrorStyle: React.CSSProperties = {
  margin: "12px auto",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,107,107,0.12)",
  border: "1px solid rgba(255,107,107,0.3)",
  color: "#ffaaaa",
  fontSize: 12,
  lineHeight: 1.5,
}

const checkoutSuccessStyle: React.CSSProperties = {
  ...checkoutErrorStyle,
  background: "rgba(129,182,76,0.14)",
  border: "1px solid rgba(129,182,76,0.4)",
  color: "#dff3c5",
}

const statusStyle: React.CSSProperties = {
  padding: 30,
  color: "var(--theme-muted, #ccc)",
}

const billingNoteStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "22px auto 0",
  color: "var(--theme-muted, #aaa)",
  fontSize: 12,
  lineHeight: 1.6,
}

const backButtonStyle: React.CSSProperties = {
  marginTop: 26,
  border: "none",
  background: "transparent",
  color: "var(--theme-muted, #bbb)",
  cursor: "pointer",
  fontSize: 14,
}
