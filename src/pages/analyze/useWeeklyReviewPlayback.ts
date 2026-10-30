import { useEffect, useRef, useState } from 'react'

/** Roughly 200 words/minute, plus time to orient to the board and metadata. */
export function weeklyReviewReadingMs(text: string) {
 const words = text.trim().split(/\s+/).filter(Boolean).length
 return Math.min(18000, Math.max(4000, 2000 + words * 300))
}

type Options = {
 reviewKey: string | null; ready: boolean; ply: number; total: number
 sequentialThrough: number; text: string
 advance: (ply: number) => void; complete: () => void
}

export function useWeeklyReviewPlayback(options: Options) {
 const { reviewKey, ready, ply, total, sequentialThrough, text } = options
 const callbacks = useRef(options)
 callbacks.current = options
 const [state, setState] = useState<{ key: string | null; paused: boolean }>({ key: null, paused: false })
 const [visible, setVisible] = useState(() => !document.hidden)
 const storageKey = reviewKey ? `weiss-weekly-playback:${reviewKey}` : null
 useEffect(() => {
  let paused = false
  try { paused = !!storageKey && sessionStorage.getItem(storageKey) === 'paused' } catch { /* optional storage */ }
  setState({ key: reviewKey, paused })
 }, [reviewKey, storageKey])
 useEffect(() => {
  const update = () => setVisible(!document.hidden)
  document.addEventListener('visibilitychange', update)
  return () => document.removeEventListener('visibilitychange', update)
 }, [])
 function setPaused(paused: boolean) {
  setState({ key: reviewKey, paused })
  try { if (storageKey) sessionStorage.setItem(storageKey, paused ? 'paused' : 'playing') } catch { /* optional storage */ }
 }
 const paused = state.paused
 const readingMs = weeklyReviewReadingMs(text)
 useEffect(() => {
  if (!reviewKey || state.key !== reviewKey || paused || !visible || !ready || total < 0) return
  const timer = window.setTimeout(() => {
   if (ply < total) callbacks.current.advance(ply + 1)
   else if (sequentialThrough === total) callbacks.current.complete()
   else setPaused(true) // Last/list jumps never satisfy the ordered review.
  }, ply === 0 ? 0 : readingMs)
  return () => window.clearTimeout(timer)
 }, [reviewKey, state.key, paused, visible, ready, ply, total, sequentialThrough, readingMs])
 return { paused, readingMs, pause: () => setPaused(true), resume: () => setPaused(false) }
}
