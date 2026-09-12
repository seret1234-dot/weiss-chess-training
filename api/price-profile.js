import {
  configuredPlans,
  getPayPalMode,
} from "../server/paypal-subscription-core.mjs"
import { affiliateTaxConfig } from "../server/affiliate-tax-config.mjs"

function displayPrice(name, fallback) {
  const raw = String(process.env[name] || "").trim()
  if (!raw) return fallback
  return raw.startsWith("$") ? raw : `$${raw}`
}

export default function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0",
  )

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
    // Do not advertise working checkout when its financial configuration is invalid.
    if (process.env.AFFILIATE_PROGRAM_ENABLED === 'true') affiliateTaxConfig()
    const rawLocation = req.headers["x-vercel-ip-country"]
    const locationCode = String(
      Array.isArray(rawLocation)
        ? rawLocation[0]
        : rawLocation || "",
    )
      .trim()
      .toUpperCase()

    // Location is intentionally never returned to the browser.
    const useTaxedPlans = locationCode === "IL"
    const plans = configuredPlans()

    const monthlyPlanId = useTaxedPlans
      ? String(process.env.PAYPAL_PLAN_MONTHLY_TAXED)
      : String(process.env.PAYPAL_PLAN_MONTHLY_STANDARD)

    const yearlyPlanId = useTaxedPlans
      ? String(process.env.PAYPAL_PLAN_YEARLY_TAXED)
      : String(process.env.PAYPAL_PLAN_YEARLY_STANDARD)

    if (!plans.has(monthlyPlanId) || !plans.has(yearlyPlanId)) {
      throw new Error("Prices are not configured")
    }

    res.status(200).json({
      mode: getPayPalMode(),
      affiliateCheckout: process.env.AFFILIATE_PROGRAM_ENABLED === 'true',
      currency: "USD",
      monthlyPrice: useTaxedPlans
        ? displayPrice("PAYPAL_PRICE_MONTHLY_TAXED", "$10.61")
        : displayPrice("PAYPAL_PRICE_MONTHLY_STANDARD", "$8.99"),
      yearlyPrice: useTaxedPlans
        ? displayPrice("PAYPAL_PRICE_YEARLY_TAXED", "$69.62")
        : displayPrice("PAYPAL_PRICE_YEARLY_STANDARD", "$59"),
      monthlyPlanId,
      yearlyPlanId,
    })
  } catch (error) {
    if (error.code === 'AFFILIATE_TAX_CONFIG_INVALID') {
      console.error('Affiliate tax configuration invalid', error.reason)
      return res.status(503).json({ error: 'AFFILIATE_TAX_CONFIG_INVALID' })
    }
    console.error("Price profile failed", error)
    res.status(500).json({
      error: "Prices are not configured",
    })
  }
}
