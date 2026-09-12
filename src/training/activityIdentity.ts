/** Logical course identity only. Never use this to merge puzzle/mastery payloads.
 * Recognize the revisions actually emitted by the Pattern generators. Colons
 * in Master keys, Mixed scope/phase keys and unknown future revisions stay intact.
 */
// Existing explicit M3–M5 Anastasia catalog aliases; not a general rename rule.
const courseAlias = (key: string) => /^anastasia-mate-in-[3-5]$/.test(key) ? key.replace('-mate-in-', '-mate-') : key

export function activityIdentity(key: string) {
 const colon = key.lastIndexOf(':')
 const base = courseAlias(colon < 0 ? key : key.slice(0, colon))
 const revision = colon < 0 ? '' : key.slice(colon + 1)
 const mate = base.match(/^[a-z0-9]+(?:-[a-z0-9]+)*-mate-([1-5])$/)
 const tactic = base.match(/^tactic-[a-z0-9]+(?:-[a-z0-9]+)*-m([1-4])$/)
 const known = mate
  ? revision === 'full-precut-v1' || revision === `m${mate[1]}-v1`
  : tactic ? new RegExp(`^m${tactic[1]}-(?:v1|full-precut-v1|verified-final-v1|semantic-v[2-5])$`).test(revision) : false
 return { logicalKey: known || colon < 0 ? base : key, progressKey: key, revision: known ? revision : null }
}

export function logicalActivityKey(key: string) { return activityIdentity(key).logicalKey }
export function sameLogicalActivity(a: string, b: string) { return logicalActivityKey(a) === logicalActivityKey(b) }

/** Exact read aliases; no wildcard/prefix query and no write-key normalization. */
export function activityReadKeys(key: string): string[] {
 const base = logicalActivityKey(key)
 const mate = base.match(/^[a-z0-9]+(?:-[a-z0-9]+)*-mate-([1-5])$/)
 const tactic = base.match(/^tactic-[a-z0-9]+(?:-[a-z0-9]+)*-m([1-4])$/)
 const revisions = mate ? ['full-precut-v1', `m${mate[1]}-v1`]
  : tactic ? ['full-precut-v1', 'verified-final-v1', 'semantic-v2', 'semantic-v3', 'semantic-v4', 'semantic-v5', 'v1'].map(v => `m${tactic[1]}-${v}`) : []
 const bases = /^anastasia-mate-[3-5]$/.test(base) ? [base, base.replace('-mate-', '-mate-in-')] : [base]
 return [...new Set([key, ...bases, ...bases.flatMap(b => revisions.map(v => `${b}:${v}`))])]
}

export function isPatternChunkActivity(key: string) {
 return /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-mate-[1-5]|tactic-[a-z0-9]+(?:-[a-z0-9]+)*-m[1-4]|master-(?:mates|tactics):[1-5]:[a-z0-9-]+)$/.test(logicalActivityKey(key))
}
