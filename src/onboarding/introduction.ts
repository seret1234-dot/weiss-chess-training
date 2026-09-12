// Account-persisted UX state only. Never used for authorization or entitlement.
export const INTRODUCTION_METADATA_KEY = 'training_introduction_v1'
export const INTRODUCTION_ROUTE = '/onboarding/introduction'
// Replace with the supplied media URL when the introduction video is available.
export const INTRODUCTION_VIDEO_SRC: string | null = null
export type IntroductionState = {
  version: 1
  status: 'pending' | 'completed' | 'skipped'
  startedAt: string
  resolvedAt?: string
  requiresAnalysis: boolean
}
export function readIntroduction(metadata: Record<string, unknown> | undefined): IntroductionState | null {
  const value = metadata?.[INTRODUCTION_METADATA_KEY] as IntroductionState | undefined
  return value?.version === 1 && ['pending', 'completed', 'skipped'].includes(value.status)
    && typeof value.startedAt === 'string' && typeof value.requiresAnalysis === 'boolean' ? value : null
}
