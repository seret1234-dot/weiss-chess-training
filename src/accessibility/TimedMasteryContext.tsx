import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  readInitialTimedMasteryEnabled,
  TIMED_MASTERY_STORAGE_KEY,
} from "./timedMasteryPreference"

type TimedMasteryContextValue = {
  timedMasteryEnabled: boolean
  setTimedMasteryEnabled: (enabled: boolean) => void
}

const TimedMasteryContext = createContext<TimedMasteryContextValue | null>(null)

export function TimedMasteryProvider({ children }: { children: React.ReactNode }) {
  const [timedMasteryEnabled, setTimedMasteryEnabledState] = useState(readInitialTimedMasteryEnabled)
  const setTimedMasteryEnabled = useCallback((enabled: boolean) => {
    setTimedMasteryEnabledState(enabled)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(TIMED_MASTERY_STORAGE_KEY, String(timedMasteryEnabled))
    } catch {
      // The selected accessibility preference still works for this session.
    }
  }, [timedMasteryEnabled])

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
