import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDueSummary, type DueSummary } from '../training/getNextDueItem'

type SemiStudyBannerProps = {
  user: any
  profile: any
}

export default function SemiStudyBanner({
  user,
  profile,
}: SemiStudyBannerProps) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DueSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false

    async function load() {
      if (!user || !profile) {
        if (!isCancelled) {
          setSummary(null)
          setLoading(false)
        }
        return
      }

      if (profile.study_mode !== 'semi') {
        if (!isCancelled) {
          setSummary(null)
          setLoading(false)
        }
        return
      }

      if (!profile.onboarding_complete) {
        if (!isCancelled) {
          setSummary(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)

      const nextSummary = await getDueSummary(user.id)

      if (!isCancelled) {
        if (
          nextSummary &&
          nextSummary.dueCount > 0 &&
          nextSummary.nextItem &&
          (nextSummary.nextItem.dueState === 'overdue' ||
            nextSummary.nextItem.dueState === 'due_today')
        ) {
          setSummary(nextSummary)
        } else {
          setSummary(null)
        }

        setLoading(false)
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [user?.id, profile?.study_mode, profile?.onboarding_complete])

  if (loading) return null
  if (!summary || !summary.nextItem) return null

  const { nextItem, dueCount } = summary

  const dueLabel =
    dueCount === 1
      ? 'You have 1 review due'
      : `You have ${dueCount} reviews due`

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '16px auto',
        padding: '14px 16px',
        borderRadius: 14,
        background: '#2f3b24',
        color: '#f3f3f3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {dueLabel}
        </div>

        <div
          style={{
            fontSize: 13,
            color: '#d6e2c8',
          }}
        >
          Next up: {nextItem.trainerKey.replace(/-/g, ' ')}
        </div>
      </div>

      <button
        onClick={() => navigate(nextItem.route)}
        style={{
          border: 'none',
          borderRadius: 10,
          padding: '12px 16px',
          background: '#8bc34a',
          color: '#1c1c1c',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Review now
      </button>
    </div>
  )
}