// Production-bundle UI tests with synthetic sessions and network isolation.
// Build with AFFILIATE_PROGRAM_ENABLED=true; live OFF overrides are tested below.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startFixtureServer } from './affiliate-browser-fixture-server.mjs'
const base = 'http://127.0.0.1:4252', server = startFixtureServer(4252)
const browser = await chromium.launch({ headless: true })
const user = { id: '91000000-0000-4000-8000-000000000001', email: 'discovery@test.invalid', aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-09-08T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-08T00:00:00Z' }
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url')
const session = { user, token_type: 'bearer', access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.synthetic`, refresh_token: 'fixture-only', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600 }
try {
 for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:390,height:844}]) {
  for (const role of ['guest','member','active','suspended']) {
   const context = await browser.newContext({ viewport })
   if (role !== 'guest') await context.addInitScript(session => localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(session)), session)
   const page = await context.newPage(), actions = [], errors = []
   let enabled = true, flagCalls = 0, releaseDashboard, releaseFlag
   let holdFlag = role === 'guest' && viewport.width === 1920
   const flagGate = new Promise(resolve => { releaseFlag = resolve })
   // Keep the membership request unresolved until visibility has been checked.
   // The old implementation never displayed the card in this state.
   const dashboardGate = new Promise(resolve => { releaseDashboard = resolve })
   let holdDashboard = role === 'active'
   page.setDefaultTimeout(10000)
   page.on('pageerror', error => errors.push(error.message))
   await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    const json = body => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
    if (url.hostname.endsWith('.supabase.co')) {
     if (url.pathname.includes('/auth/v1/user')) return json(user)
     if (/user_auto_profile|\/profiles/.test(url.pathname)) return json({id:user.id,user_id:user.id,onboarding_complete:true,study_mode:'manual'})
     return json([])
    }
    if (url.origin !== base) return route.abort()
    if (url.pathname === '/api/price-profile') {
     flagCalls++
     if (holdFlag) await flagGate
     if (role === 'guest' && viewport.width === 1280 && flagCalls === 1) return route.abort()
     return json({affiliateCheckout:enabled})
    }
    if (url.pathname === '/api/affiliate') {
     const body = route.request().postDataJSON(); actions.push(body.action)
     assert.ok(['dashboard','bind'].includes(body.action), 'Discovery must not activate, track, checkout, or pay')
     if (body.action === 'dashboard' && holdDashboard) await dashboardGate
     return json({account:['active','suspended'].includes(role)?{code:'fixture-coach',status:role,tier:1,effective_bps:1500,display_name:'Fixture'}:null,balances:{},commissions:[],payouts:[],applications:[]})
    }
    return route.continue()
   })
   await page.goto(base)
   const promo = page.locator('.home-how__affiliate')
   const card = promo.getByRole('button',{name:/^Affiliate (Program|Dashboard)$/})
   await card.waitFor({state:'visible'})
   if (holdFlag) {
    console.log('PASS initial card visible before the live feature-flag response')
    holdFlag = false; releaseFlag()
   }
   if (holdDashboard) console.log('PASS active-affiliate card visible while membership response is still pending')
   if (role === 'guest' && viewport.width === 1280) {
    if (flagCalls < 2) await page.waitForResponse(response => response.url().endsWith('/api/price-profile') && response.ok())
    assert.ok(flagCalls >= 2, 'Transient flag failure is retried, not permanently hidden')
   }
   await page.locator('.catalog-page__hero').getByRole('button',{name:role==='guest'?'Create Free Account':'Start Auto Training',exact:true}).waitFor()
   const box = await promo.boundingBox(), how = await page.locator('.home-how').boundingBox(), content = await page.locator('.home-how__content').boundingBox()
   const gridTitles = await page.locator('.catalog-page__grid > button').evaluateAll(cards=>cards.map(card=>card.children[1].textContent))
   assert.deepEqual(gridTitles,['Analyze','Mates','Master Mates','Tactics','Master Tactics','Endgames','Board Vision','Master Games','Openings','Play Computer','Fun Chess'],'Chess grid has its original eleven cards, ordering, and no affiliate slot')
   assert.deepEqual(await page.locator('.home-how__content p').allTextContents(),[
    'Learn the basic patterns of chess, one idea at a time.',
    'Each skill is divided into clear subthemes and trained at distances of 1, 2, 3, and 4+ moves.',
    'Repeat exercises until you can solve them fast 5 times, then they return later for reinforcement.',
    'Your individual training plan is built from your own games, so you practice what you need most.',
   ],'Original How it works wording unchanged')
   assert.equal(await promo.getByRole('heading').innerText(),'Affiliate Program')
   assert.equal(await promo.locator('p').innerText(),'Earn recurring commissions by referring players.')
   assert.equal(await page.evaluate(()=>scrollY),0,'No scrolling before visibility measurement')
   if (viewport.width >= 1000) {
    assert.ok(box.x>=content.x+content.width,'Promo is on the right of the original content')
    assert.ok(how.y+how.height<=viewport.height-48,`How it works below fold/footer at ${JSON.stringify({viewport,how})}`)
   } else {
    assert.ok(box.y>=content.y+content.height,'Mobile stacks original content then promo inside the same box')
   }
   assert.ok((await page.locator('.catalog-page__grid').boundingBox()).y>=how.y+how.height,'Promo is discoverable before the long chess grid')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
   assert.equal(await page.locator('.catalog-page__hero').getByRole('button',{name:role==='guest'?'Create Free Account':'Start Auto Training',exact:true}).count(),1,'Hero CTA unchanged')
   await card.click()
   if (holdDashboard) {
    assert.equal(page.url(),base+'/','Early click waits for membership, not an incorrect public-page redirect')
    holdDashboard = false; releaseDashboard()
   }
   await page.waitForURL(base+(role==='active'?'/affiliate/dashboard':'/affiliate'))
   await page.goto(base+'/account')
   const label=role==='active'?'Affiliate Dashboard':'Affiliate Program'
   const accountLink=page.getByRole('link',{name:label,exact:true})
   await accountLink.waitFor()
   assert.equal(await accountLink.getAttribute('href'),role==='active'?'/affiliate/dashboard':'/affiliate')
   enabled=false
   await page.goto(base)
   await page.getByRole('button',{name:/Analyze Analyze games/}).waitFor()
   // A live OFF response overrides the initial build snapshot.
   await card.waitFor({state:'hidden'})
   assert.equal(await card.count(),0,'Feature OFF hides home discovery')
   assert.equal(await page.locator('.home-how').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1,'Feature OFF restores full-width How it works')
   await page.goto(base+'/account')
   await page.getByRole('heading',{name:'Account Settings',exact:true}).waitFor()
   await page.getByRole('link',{name:/^Affiliate (Program|Dashboard)$/}).waitFor({state:'hidden'})
   assert.equal(await page.getByRole('link',{name:/^Affiliate (Program|Dashboard)$/}).count(),0,'OFF hides Account discovery')
   assert.equal(errors.length,0,JSON.stringify(errors))
   console.log(`PASS ${role} ${viewport.width}x${viewport.height}: How it works y=${Math.round(how.y)} bottom=${Math.round(how.y+how.height)}, promo layout, chess-only grid, routing, Account, flag OFF/full width, unchanged wording/hero, no overflow/page errors`)
   await context.close()
  }
 }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)) }
