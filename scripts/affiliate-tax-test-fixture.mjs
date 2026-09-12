// Synthetic eight-plan configuration. No credentials or provider requests.
export function configureAffiliateTaxFixture(env = process.env) {
  const normal = { MONTHLY_STANDARD:'P-MS', MONTHLY_TAXED:'P-MT', YEARLY_STANDARD:'P-YS', YEARLY_TAXED:'P-YT' }
  const intro = { MONTHLY_STANDARD:'P-INTRO', MONTHLY_TAXED:'P-INTRO-MT', YEARLY_STANDARD:'P-INTRO-YS', YEARLY_TAXED:'P-INTRO-YT' }
  const map = {}
  for (const [prefix, plans] of [['PAYPAL_PLAN',normal],['PAYPAL_AFFILIATE_PLAN',intro]]) {
    for (const [name,id] of Object.entries(plans)) {
      env[`${prefix}_${name}`]=id
      map[id]=name.endsWith('TAXED')?1800:0
    }
  }
  env.AFFILIATE_PAYPAL_TAX_BPS_JSON=JSON.stringify(map)
  return map
}
