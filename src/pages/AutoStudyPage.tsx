import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { getOrCreateAutoProfile } from "../training/getOrCreateAutoProfile"

export default function AutoStudyPage({ user }: { user: any }) {
  const navigate = useNavigate()
  const [message, setMessage] = useState("Loading your training...")

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        if (!user) {
          if (!cancelled) setMessage("Waiting for account...")
          return
        }

        if (!cancelled) setMessage("Loading auto profile...")

        const autoProfile = await getOrCreateAutoProfile(user.id)

        if (!autoProfile) {
          if (!cancelled) setMessage("Auto profile error")
          return
        }

        if (!autoProfile.onboarding_complete) {
          navigate("/onboarding", { replace: true })
          return
        }

        if (!cancelled) setMessage("Selecting next opening...")

        // 🔥 NEW: call your SQL function
        const { data, error } = await supabase.rpc(
          "get_next_auto_opening",
          {
            p_user_id: user.id,
          }
        )

        if (error) {
          console.error(error)
          if (!cancelled) setMessage("Auto error")
          return
        }

        const slug = data?.[0]?.slug

        if (!slug) {
          console.error("No opening returned")
          if (!cancelled) setMessage("No openings available")
          return
        }

        // ✅ navigate directly to opening trainer
        navigate(`/openings/${slug}`, { replace: true })
      } catch (error) {
        console.error("AUTO PAGE error:", error)
        if (!cancelled) setMessage("Something went wrong")
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [navigate, user])

  return <div style={{ padding: 24 }}>{message}</div>
}