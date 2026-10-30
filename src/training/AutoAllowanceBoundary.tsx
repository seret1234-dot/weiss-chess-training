import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AUTO_ALLOWANCE_STOP, AUTO_ALLOWANCE_TITLE, AUTO_ALLOWANCE_MESSAGE } from './autoChunkAllowance'
import { autoEntryEnabled } from './autoEntryEnabled'

/** Unmount a denied loader; never overlay a still-running, scored exercise. */
export function AutoAllowanceBoundary({ children }: { children: ReactNode }) {
  const location = useLocation(), navigate = useNavigate()
  const [stop, setStop] = useState<{ route: string; limited: boolean; message?: string } | null>(null)
  useEffect(() => {
    const receive = (event: Event) => setStop((event as CustomEvent).detail)
    window.addEventListener(AUTO_ALLOWANCE_STOP, receive)
    return () => window.removeEventListener(AUTO_ALLOWANCE_STOP, receive)
  }, [])
  if (!stop || stop.route !== location.pathname + location.search) return <>{children}</>
  return <section role="status" data-testid="auto-chunk-limit" style={{ maxWidth: 620, margin: '48px auto', padding: 24 }}>
    <h1>{stop.limited ? AUTO_ALLOWANCE_TITLE : 'Training access could not be verified'}</h1>
    <p>{stop.limited ? AUTO_ALLOWANCE_MESSAGE : stop.message}</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button data-primary-action={stop.limited} data-secondary-action={!stop.limited ? true : undefined} onClick={() => navigate('/pricing')}>View Premium</button>
      <button data-primary-action={!stop.limited} data-secondary-action={stop.limited ? true : undefined} onClick={() => { setStop(null); navigate('/auto?continue=1', { replace: true }) }}>Check next training</button>
      <button data-secondary-action onClick={() => navigate(autoEntryEnabled ? '/home' : '/')}>Home</button>
    </div>
  </section>
}
