import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { admitAutoChunk, type AutoChunkUnit } from './autoChunkAllowance'

/** Bind delayed data-loader work to the route/component that requested it. */
export function useAutoChunkAdmission() {
  const location = useLocation()
  const ownerRoute = location.pathname + location.search
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return (unit: AutoChunkUnit) => admitAutoChunk(unit, () => mounted.current &&
    ownerRoute === window.location.pathname + window.location.search)
}
