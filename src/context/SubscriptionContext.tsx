import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import {
  getCurrentSubscription,
  subscriptionIsPremium,
  type Subscription,
} from "../services/subscription"

interface SubscriptionContextValue {
  subscription: Subscription | null
  isPremium: boolean
  loading: boolean
  error: string | null
  refreshSubscription: () => Promise<void>
}

const SubscriptionContext = createContext<
  SubscriptionContextValue | undefined
>(undefined)

export function SubscriptionProvider({
  user,
  children,
}: {
  user: User | null
  children: ReactNode
}) {
  const [subscription, setSubscription] =
    useState<Subscription | null>(null)
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState<string | null>(null)

  const refreshSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await getCurrentSubscription()
      setSubscription(result)
    } catch (err) {
      console.error("Failed loading subscription", err)
      setSubscription(null)
      setError(
        err instanceof Error
          ? err.message
          : "Failed loading subscription",
      )
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void refreshSubscription()
  }, [refreshSubscription])

  const value = useMemo(
    () => ({
      subscription,
      isPremium: subscriptionIsPremium(subscription),
      loading,
      error,
      refreshSubscription,
    }),
    [
      subscription,
      loading,
      error,
      refreshSubscription,
    ],
  )

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)

  if (!context) {
    throw new Error(
      "useSubscription must be used inside SubscriptionProvider",
    )
  }

  return context
}
