import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  TIMED_MASTERY_STORAGE_KEY,
} from "./timedMasteryPreference"

type TimedMasteryContextValue = {
  timedMasteryEnabled: boolean
  setTimedMasteryEnabled: (enabled: boolean) => void
}
import { useAccountStorageKey } from '../auth/AccountIdentityContext'
import { resolveTimedMasteryEnabled } from './timedMasteryPreference'

const TimedMasteryContext = createContext<TimedMasteryContextValue | null>(null)

export function TimedMasteryProvider({ children }: { children: React.ReactNode }) {
  const storageKey = useAccountStorageKey(TIMED_MASTERY_STORAGE_KEY)
  const [timedMasteryEnabled, setTimedMasteryEnabledState] = useState(() => {
    try { return resolveTimedMasteryEnabled(window.localStorage.getItem(storageKey)) }
    catch { return resolveTimedMasteryEnabled(null) }
  })
  const setTimedMasteryEnabled = useCallback((enabled: boolean) => {
    setTimedMasteryEnabledState(enabled)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(timedMasteryEnabled))
    } catch {
      // The selected accessibility preference still works for this session.
    }
  }, [timedMasteryEnabled, storageKey])

  const value = useMemo(
    () => ({ timedMasteryEnabled, setTimedMasteryEnabled }),
    [timedMasteryEnabled, setTimedMasteryEnabled],
  )

  return <TimedMasteryContext.Provider value={value}>{children}</TimedMasteryContext.Provider>
}

export function useTimedMastery() {
  const context = useContext(TimedMasteryContext)
  if (!context) throw new Error("useTimedMastery must be used inside TimedMasteryProvider")
  return context
}
