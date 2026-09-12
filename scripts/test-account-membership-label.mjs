import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

// Exercise the actual Account display expression, without changing entitlement
// calculation, starting the application, or reading/writing customer data.
const source = await readFile(new URL('../src/AccountPage.tsx', import.meta.url), 'utf8')
const expression = source.match(/const planLabel =\s*([\s\S]*?)\s+const membershipDescription =/)
assert.ok(expression, 'Account membership display expression must exist')
assert.match(source, /subscriptionLoading \? "Loading\.\.\." : planLabel/, 'Rendered membership uses the tested expression')
for (const plan of ['monthly', 'yearly']) {
  const pending = Object.freeze({ plan, status: 'inactive', provider_status: 'APPROVAL_PENDING' })
  assert.equal(runInNewContext(expression[1], { subscription: pending, isPremium: false }), 'Free', `Unapproved ${plan} does not claim Premium`)
  const active = Object.freeze({ plan, status: 'active' })
  assert.equal(runInNewContext(expression[1], { subscription: active, isPremium: true }), `${plan === 'monthly' ? 'Monthly' : 'Yearly'} Premium`, `Active ${plan} title unchanged`)
  assert.equal(runInNewContext(expression[1], { subscription: active, isPremium: false }), 'Free', 'Display follows entitlement, not a stored plan/status alone')
}
assert.equal(runInNewContext(expression[1], { subscription: null, isPremium: false }), 'Free')
assert.equal(runInNewContext(expression[1], { subscription: { plan: 'crypto_30' }, isPremium: true }), 'Premium')
console.log('PASS Account display: pending monthly/yearly = Free; active entitled monthly/yearly = Premium; entitlement decision is not modified')
