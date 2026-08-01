export type SemanticDisclosureEvent = 'reveal' | 'timer' | 'next-puzzle' | 'restart'

// Semantic evidence is an explanation of the current position, not transient
// move feedback. Timers may clear move feedback, but never this disclosure.
export function nextSemanticDisclosureState(current: boolean, event: SemanticDisclosureEvent) {
  return event === 'next-puzzle' || event === 'restart' ? false : event === 'reveal' ? true : current
}

export function getSemanticDisclosurePresentation(
  explanation: string | null,
  squares: string[],
  revealed: boolean,
) {
  const visible = Boolean(explanation) && revealed
  return { explanation, visible, squares: visible ? squares : [] }
}
