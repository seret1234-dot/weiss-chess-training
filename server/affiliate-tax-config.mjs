// One fail-closed contract for checkout, verified payment processing and preflight.
// Never attach the raw environment value or parser exception to an error/log.
export class AffiliateTaxConfigError extends Error {
  constructor(reason) {
    super('AFFILIATE_TAX_CONFIG_INVALID')
    this.name = 'AffiliateTaxConfigError'
    this.code = 'AFFILIATE_TAX_CONFIG_INVALID'
    this.reason = reason
  }
}

export function affiliateTaxConfig(env = process.env) {
  const fail = reason => { throw new AffiliateTaxConfigError(reason) }
  let map
  try { map = JSON.parse(env.AFFILIATE_PAYPAL_TAX_BPS_JSON) }
  catch {
    fail(/^\{\s*[^"\s}]/.test(env.AFFILIATE_PAYPAL_TAX_BPS_JSON || '')
      ? 'MALFORMED_JSON_UNQUOTED_KEY' : 'MALFORMED_JSON')
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) fail('OBJECT_REQUIRED')
  const expected = new Map()
  const slots = new Map()
  for (const prefix of ['PAYPAL_PLAN', 'PAYPAL_AFFILIATE_PLAN']) {
    for (const period of ['MONTHLY', 'YEARLY']) {
      for (const variant of ['STANDARD', 'TAXED']) {
        const id = env[`${prefix}_${period}_${variant}`]
        if (typeof id !== 'string' || !/^P-[A-Z0-9-]+$/.test(id) || expected.has(id)) fail('PLAN_IDENTITIES_INVALID')
        expected.set(id, variant === 'TAXED' ? 1800 : 0)
        slots.set(id, `${prefix}_${period}_${variant}`)
      }
    }
  }
  if (Object.keys(map).length !== 8 || Object.keys(map).some(id => !expected.has(id))) {
    // Only static configuration slot names and counts, never environment values.
    const missing = [...slots].filter(([id]) => !Object.hasOwn(map, id)).map(([,slot]) => slot)
    fail(`PLAN_SET_INVALID: entries=${Object.keys(map).length}; missing=${missing.join(',')}`)
  }
  for (const [id, bps] of expected) {
    if (!Object.hasOwn(map, id)) fail('PLAN_SET_INVALID')
    if (!Number.isInteger(map[id]) || map[id] < 0 || map[id] > 10000) fail('RATE_INVALID')
    if (map[id] !== bps) fail('RATE_MAPPING_INVALID')
  }
  return Object.freeze(map)
}
