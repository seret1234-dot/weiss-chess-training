import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import './HintActionContext.css'

export type HintMove = {
  from: string
  to: string
}

export type HintStage = 'piece' | 'square'

export type HintActionOptions = {
  getHintMove: () => HintMove | null | Promise<HintMove | null>
  onHintStage?: (move: HintMove, stage: HintStage) => void | Promise<void>
  onHintReset?: () => void
  disabled?: boolean
  resetKey?: unknown
}

type HintRegistration = {
  getOptions: () => HintActionOptions | null
  stage: 0 | 1 | 2
  move: HintMove | null
  busy: boolean
  generation: number
  requestToken: symbol | null
}

type HintRegistry = {
  register: (
    id: symbol,
    getOptions: () => HintActionOptions | null,
  ) => () => void
  refresh: (id: symbol) => void
  invoke: (id: symbol) => Promise<void>
  reset: (id: symbol) => void
}

type HintActionControls = {
  triggerHint: () => Promise<void>
  resetHint: () => void
}

const HintRegistryContext = createContext<HintRegistry | null>(null)

function isHintMove(value: HintMove | null): value is HintMove {
  return Boolean(
    value &&
      /^[a-h][1-8]$/.test(value.from) &&
      /^[a-h][1-8]$/.test(value.to),
  )
}

export function HintActionProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const registrationsRef = useRef(new Map<symbol, HintRegistration>())
  const [registryVersion, setRegistryVersion] = useState(0)

  const refreshView = useCallback(() => {
    setRegistryVersion((version) => version + 1)
  }, [])

  const clearRegistration = useCallback((registration: HintRegistration) => {
    const options = registration.getOptions()
    registration.stage = 0
    registration.move = null
    registration.busy = false
    registration.generation += 1
    registration.requestToken = null
    options?.onHintReset?.()
  }, [])

  const register = useCallback(
    (id: symbol, getOptions: () => HintActionOptions | null) => {
      registrationsRef.current.set(id, {
        getOptions,
        stage: 0,
        move: null,
        busy: false,
        generation: 0,
        requestToken: null,
      })
      refreshView()

      return () => {
        if (!registrationsRef.current.delete(id)) return
        refreshView()
      }
    },
    [refreshView],
  )

  const reset = useCallback(
    (id: symbol) => {
      const registration = registrationsRef.current.get(id)
      if (!registration) return
      clearRegistration(registration)
      refreshView()
    },
    [clearRegistration, refreshView],
  )

  const refresh = useCallback(
    (id: symbol) => {
      const registration = registrationsRef.current.get(id)
      if (!registration) return

      if (
        registration.getOptions()?.disabled &&
        registration.stage !== 0 &&
        !registration.busy
      ) {
        clearRegistration(registration)
      }
      refreshView()
    },
    [clearRegistration, refreshView],
  )

  const invoke = useCallback(
    async (id: symbol) => {
      const registration = registrationsRef.current.get(id)
      const options = registration?.getOptions()
      if (!registration || !options || options.disabled || registration.busy) return

      const generation = registration.generation
      const requestToken = Symbol('hint-request')
      registration.busy = true
      registration.requestToken = requestToken
      refreshView()

      try {
        const move = registration.move ?? (await options.getHintMove())
        if (!isHintMove(move)) return
        if (
          registrationsRef.current.get(id) !== registration ||
          registration.generation !== generation
        ) return

        const stage: HintStage = registration.stage === 0 ? 'piece' : 'square'
        await options.onHintStage?.(move, stage)

        if (
          registrationsRef.current.get(id) !== registration ||
          registration.generation !== generation
        ) return
        registration.move = move
        registration.stage = stage === 'piece' ? 1 : 2
      } finally {
        if (registration.requestToken === requestToken) {
          registration.busy = false
          registration.requestToken = null
        }
        refreshView()
      }
    },
    [refreshView],
  )

  const registry = useMemo(
    () => ({ register, refresh, invoke, reset }),
    [invoke, refresh, register, reset],
  )

  const activeEntry = useMemo(() => {
    const entries = Array.from(registrationsRef.current.entries())
    return entries.at(-1) ?? null
  }, [registryVersion])

  const activeId = activeEntry?.[0] ?? null
  const activeRegistration = activeEntry?.[1] ?? null
  const activeOptions = activeRegistration?.getOptions() ?? null
  const isAvailable = Boolean(activeOptions && !activeOptions.disabled)

  useEffect(() => {
    if (typeof document === 'undefined') return

    document.documentElement.classList.toggle(
      'has-active-global-hint',
      isAvailable,
    )

    return () => {
      document.documentElement.classList.remove('has-active-global-hint')
    }
  }, [isAvailable])

  const resetActive = useCallback(() => {
    if (activeId) reset(activeId)
  }, [activeId, reset])

  useEffect(() => {
    for (const registration of registrationsRef.current.values()) {
      clearRegistration(registration)
    }
    refreshView()
  }, [location.pathname, location.search, clearRegistration, refreshView])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.global-floating-hint, .site-inline-hint')) return
      if (target.closest('button, a, [role="button"]')) resetActive()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
        resetActive()
      }
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [resetActive])

  const activeMove = activeRegistration?.move ?? null
  const activeStage = activeRegistration?.stage ?? 0
  const highlightCss =
    activeMove && activeStage > 0
      ? `
        [data-square="${activeMove.from}"]${
          activeStage > 1 ? `, [data-square="${activeMove.to}"]` : ''
        } {
          position: relative !important;
        }
        [data-square="${activeMove.from}"]::after {
          content: "";
          position: absolute;
          inset: 3px;
          z-index: 6;
          box-sizing: border-box;
          border: 4px solid #f2c14e;
          border-radius: 5px;
          pointer-events: none;
        }
        ${
          activeStage > 1
            ? `[data-square="${activeMove.to}"]::after {
                content: "";
                position: absolute;
                inset: 3px;
                z-index: 6;
                box-sizing: border-box;
                border: 4px dashed #50b4ff;
                border-radius: 5px;
                pointer-events: none;
              }`
            : ''
        }
      `
      : ''

  return (
    <HintRegistryContext.Provider value={registry}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <>
              {highlightCss ? <style data-global-hint-highlights>{highlightCss}</style> : null}
              {activeRegistration && isAvailable ? (
                <>
                  <div className="global-floating-hint-dock-row" aria-hidden="true" />
                  <button
                    type="button"
                    className="global-floating-hint"
                    aria-label={activeStage === 0 ? 'Hint: Piece' : 'Hint: Square'}
                    title={activeStage === 0 ? 'Hint: Piece' : 'Hint: Square'}
                    aria-busy={activeRegistration.busy}
                    disabled={activeRegistration.busy}
                    onClick={() => activeId && void invoke(activeId)}
                  >
                    <span aria-hidden="true">{"\uD83D\uDCA1"}</span>
                    <span>{activeStage === 0 ? 'Hint: Piece' : 'Hint: Square'}</span>
                  </button>
                </>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </HintRegistryContext.Provider>
  )
}

export function useHintAction(
  options: HintActionOptions | null | undefined,
): HintActionControls {
  const registry = useContext(HintRegistryContext)
  const registrationId = useRef(Symbol('hint-action'))
  const optionsRef = useRef(options ?? null)
  optionsRef.current = options ?? null
  const hasAction = Boolean(options)

  useEffect(() => {
    if (!registry || !hasAction) return
    return registry.register(registrationId.current, () => optionsRef.current)
  }, [registry, hasAction])

  useEffect(() => {
    if (!registry || !hasAction) return
    registry.refresh(registrationId.current)
  }, [registry, hasAction, options?.disabled])

  useEffect(() => {
    if (!registry || !hasAction) return
    registry.reset(registrationId.current)
  }, [registry, hasAction, options?.resetKey])

  const triggerHint = useCallback(async () => {
    if (!registry || !hasAction) return
    await registry.invoke(registrationId.current)
  }, [registry, hasAction])

  const resetHint = useCallback(() => {
    if (!registry || !hasAction) return
    registry.reset(registrationId.current)
  }, [registry, hasAction])

  return { triggerHint, resetHint }
}

export const useRegisterHintAction = useHintAction

export function HintActionRegistration(props: HintActionOptions) {
  useHintAction(props)
  return null
}
