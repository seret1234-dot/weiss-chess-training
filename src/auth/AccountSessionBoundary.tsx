import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

const KEY = 'weiss:active-account:v1'

/** Do not mount B's trainers at A's still-current URL during an auth switch. */
export default function AccountSessionBoundary({ userId, children }: { userId: string | null; children: ReactNode }) {
  const location = useLocation()
  const owner = userId ?? 'guest'
  const [previousOwner, setPreviousOwner] = useState(() => {
    try { return sessionStorage.getItem(KEY) ?? owner } catch { return owner }
  })
  const changed = previousOwner !== owner
  useEffect(() => {
    if (changed) return
    try { sessionStorage.setItem(KEY, owner) } catch { /* No cache is required to sign in. */ }
  }, [owner, changed])
  if (changed) {
    const publicLogout = !userId && location.pathname === '/auth'
    if (!publicLogout && (location.pathname !== '/' || location.search || location.hash)) return <Navigate to="/" replace state={null} />
    setPreviousOwner(owner)
    return null
  }
  return <Fragment key={owner}>{children}</Fragment>
}
