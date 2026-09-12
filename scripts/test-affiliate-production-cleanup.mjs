import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import approval from '../api/affiliate-approval-link.js'
import pending from '../api/affiliate-pending-verification.js'

const oldFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('Retired facilities must never access the network') }
try {
  for (const enabled of ['true', 'false']) {
    process.env.AFFILIATE_PROGRAM_ENABLED = enabled
    process.env.AFFILIATE_PENDING_VERIFICATION_ENABLED = 'true'
    for (const handler of [approval, pending]) for (const method of ['GET', 'POST', 'DELETE']) {
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
      await handler({ method, headers: { authorization: 'Bearer synthetic-owner' }, query: { subscription_id: 'I-84CXF3309VM8' } }, res)
      assert.equal(res.code, 404)
      assert.deepEqual(res.data, { error: 'Not found' })
      assert.match(res.headers['Cache-Control'], /no-store/)
    }
  }
  for (const file of ['PendingVerification', 'ApprovalLinkVerification', 'CheckoutDecisionPreview']) {
    assert.equal(existsSync(new URL(`../src/affiliate/${file}.tsx`, import.meta.url)), false)
  }
  assert.equal(existsSync(new URL('../server/affiliate-pending-verification.mjs', import.meta.url)), false)
  const account = readFileSync(new URL('../src/AccountPage.tsx', import.meta.url), 'utf8')
  const pricing = readFileSync(new URL('../src/PricingPage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(account, /PendingVerification|ApprovalLinkVerification|verify-pending|approval-link/)
  assert.doesNotMatch(pricing, /CheckoutDecisionPreview|checkout-preview/)
  const api = readFileSync(new URL('../api/affiliate.js', import.meta.url), 'utf8')
  assert.match(api, /if\(!enabled\(\)\)/)
  assert.doesNotMatch(api, /readOnlyPreview/)
  assert.match(api, /action==='checkout_preview'/, 'Keep the authenticated production decision API')
  console.log('PASS retired endpoints permanently 404 under all flags/methods, zero network, temporary UI/helpers removed, production preview retained behind feature flag')
} finally { globalThis.fetch = oldFetch }
