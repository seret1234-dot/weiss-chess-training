// Actual application bundle, router, AuthPage, Supabase SDK, Auto scheduler and
// Pattern Mate trainer. Only HTTP backend responses are controlled; no fixture
// route components substitute for the login, dashboard or exercise UI.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { preview } from 'vite'

// Default to the normal production build, never the development/demo server.
// An explicit origin also permits isolated tests of the actual deployed assets.
const server = process.env.AUTO_DEMO_URL ? null : await preview({mode:'production',preview:{host:'127.0.0.1',port:0,open:false}})
const base = process.env.AUTO_DEMO_URL || server.resolvedUrls.local[0].replace(/\/$/,'')
const supabaseOrigin = 'https://lahzgtcpbshmzsqoqswf.supabase.co'
const user = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', email: 'auto-demo@example.test',
  aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { username: 'Auto demo test' } }
const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user }
const browser = await chromium.launch({ headless: true })
try {
  for (const entryCase of ['session', 'login', 'signup-to-login', 'weekly-resume'].filter(value=>!process.env.ENTRY_TEST_CASE||value===process.env.ENTRY_TEST_CASE)) {
    const alreadySignedIn = ['session','weekly-resume'].includes(entryCase)
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const errors = [], calls = []
    await context.route(`${supabaseOrigin}/**`, async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      calls.push(`${request.method()} ${path}`)
      const single = (request.headers().accept || '').includes('application/vnd.pgrst.object+json')
      let data = []
      if (path === '/auth/v1/token') data = session
      else if (path === '/auth/v1/user') data = user
      else if (path === '/auth/v1/logout') data = {}
      else if (path.endsWith('/user_auto_profile')) data = [{ user_id:user.id, onboarding_complete:true,
        manual_current_rating:1200, current_rating:1200, daily_minutes:20, target_rating:1500 }]
      else if (path.endsWith('/profiles')) data = [{id:user.id, study_mode:'auto', onboarding_complete:true}]
      else if (path.endsWith('/user_study_plan')) data = [{user_id:user.id, max_active_trainers:3, mates_weight:30}]
      else if (path.endsWith('/weekly_adaptive_tests')) data = [{state:entryCase === 'weekly-resume' ? {
        userId:user.id,weekKey:url.searchParams.get('week_key')?.replace(/^eq\./,''),currentGame:0,engineElo:1500,
        games:[{color:'white',started:true,completed:false,pgn:'1. e4 e5',fen:'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',result:'*'}, {color:'black',started:false,completed:false,pgn:'',result:'*'}],
        updatedAt:new Date().toISOString(),
      } : {
        weekKey: url.searchParams.get('week_key')?.replace(/^eq\./,''), currentGame:2,
        games:[{completed:true},{completed:true}], completedAt:new Date().toISOString(),
      }}]
      else if (path.endsWith('/user_chunk_progress')) data = [{ trainer_key:'back-rank-mate-1',chunk_index:0,
        next_due_at:'2020-01-01T00:00:00.000Z', is_mastered:false,mastered_puzzles_count:0 }]
      else if (path.includes('/rpc/')) data = { tier:'free',limit:10,used:0,remaining:10,allowed:true }
      // The SDK applies its normal maybeSingle conversion for JSON arrays.
      if (single && Array.isArray(data)) data = data[0] ?? null
      await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/0'},body:JSON.stringify(data)})
    })
    await context.route('**/api/**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({affiliateCheckout:false,enabled:false})}))
    if (alreadySignedIn) await context.addInitScript(value => {
      if (!localStorage.getItem('sb-lahzgtcpbshmzsqoqswf-auth-token')) localStorage.setItem('sb-lahzgtcpbshmzsqoqswf-auth-token',JSON.stringify(value))
    },session)
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(base)
    if (entryCase === 'weekly-resume') {
      await page.waitForURL(url=>url.pathname==='/play-computer'&&url.searchParams.get('weekly')==='1',{timeout:30000})
      await page.getByText('Ready',{exact:true}).waitFor({timeout:60000})
      // Engine readiness replaces the transient "resumed" status. Assert the
      // restored game itself, not that short-lived notification.
      await page.waitForFunction(()=>{
        const game=JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')||'{}').games?.[0]
        return game?.started && game.fen==='rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
      }).catch(async error=>{
        console.error({url:page.url(),weekly:await page.evaluate(()=>JSON.parse(localStorage.getItem('weiss-weekly-adaptive-test-v1')||'null')),text:(await page.locator('body').innerText()).slice(-2600),calls:calls.slice(-15),errors})
        throw error
      })
      await page.locator('[data-square="e4"] [data-piece="wP"]').first().waitFor()
      await page.locator('[data-square="e5"] [data-piece="bP"]').first().waitFor()
      assert.equal(await page.getByRole('button',{name:/Start Weekly Game/}).count(),0)
      const current=page.url();await page.goto(base+'/home')
      await page.getByRole('button',{name:'Resume Auto Training',exact:true}).click();await page.waitForURL(current)
      assert.deepEqual(errors,[])
      console.log('PASS production Weekly-in-progress root entry and Home resume; saved position restored')
      await context.close();continue
    }
    if (!alreadySignedIn) {
      await page.getByRole('button',{name:'Create Free Account',exact:true}).waitFor()
      assert.equal(new URL(page.url()).pathname,'/','logged-out root remains public landing')
      if (entryCase === 'signup-to-login') {
        await page.getByRole('button',{name:'Create Free Account',exact:true}).click()
        await page.getByRole('heading',{name:'Create Free Account',exact:true}).waitFor()
        await page.locator('.auth-page__login-prompt').getByRole('button',{name:'Log In',exact:true}).click()
      } else {
        await page.getByRole('button',{name:'Menu',exact:true}).hover()
        await page.locator('#global-floating-play-desktop-panel').getByRole('button',{name:'Log In',exact:true}).click()
      }
      await page.getByRole('heading',{name:'Log In',exact:true}).waitFor()
      await page.getByLabel('Email',{exact:true}).fill(user.email)
      await page.getByLabel('Password',{exact:true}).fill('fixture-password')
      const documentRequests=[]; page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documentRequests.push(r.url())})
      await page.locator('form').getByRole('button',{name:'Log In',exact:true}).click()
      try { await page.waitForURL('**/mates/m1/back-rank?**',{timeout:25000}) }
      catch(e) { console.error({phase:'after login',url:page.url(),text:(await page.locator('body').innerText()).slice(0,2200),errors,calls:calls.slice(-25),documentRequests}); throw e }
      assert.deepEqual(documentRequests,[],'login succeeds via reactive SPA navigation, no forced reload')
    }
    try {
      await page.waitForURL('**/mates/m1/back-rank?**',{timeout:25000})
      await page.locator('[data-square="e4"]').first().waitFor({timeout:25000})
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.trim()==='Hint'&&!b.disabled),{timeout:25000})
    } catch(e) { console.error({url:page.url(),text:(await page.locator('body').innerText()).slice(0,2200),errors,calls:calls.slice(-20)}); throw e }
    assert.equal(await page.getByRole('button',{name:/Start Auto|Continue Auto|Start recommended training/}).count(),0)
    const trainerUrl=page.url()
    console.log(`PASS actual app ${entryCase} → real active Back Rank exercise`)
    if(alreadySignedIn){
      async function menu(name){await page.getByRole('button',{name:'Menu',exact:true}).hover();await page.locator('#global-floating-play-desktop-panel').getByRole('button',{name,exact:true}).click()}
      await menu('Home')
      await page.getByRole('button',{name:'Resume Auto Training',exact:true}).waitFor()
      await page.reload()
      await page.getByRole('button',{name:'Resume Auto Training',exact:true}).waitFor()
      assert.equal(new URL(page.url()).pathname,'/home')
      await page.getByRole('button',{name:'Resume Auto Training',exact:true}).click()
      await page.waitForURL(trainerUrl)
      await page.locator('[data-square="e4"]').first().waitFor()
      await menu('Manual Practice')
      await page.getByRole('heading',{name:'Manual Practice',exact:true}).waitFor()
      await page.reload()
      await page.getByRole('heading',{name:'Manual Practice',exact:true}).waitFor()
      assert.equal(new URL(page.url()).pathname,'/manual')
      await page.getByRole('link',{name:'Return to Auto',exact:true}).click()
      await page.waitForURL(trainerUrl)
      await page.locator('[data-square="e4"]').first().waitFor()
      console.log('PASS actual app Home remains Home / Manual remains Manual / Return resumes same Auto route and renders real board')
      await menu('Logout')
      await page.getByRole('heading',{name:'Log In',exact:true}).waitFor()
      await page.getByLabel('Email',{exact:true}).fill(user.email)
      await page.getByLabel('Password',{exact:true}).fill('fixture-password')
      await page.locator('form').getByRole('button',{name:'Log In',exact:true}).click()
      await page.waitForURL(trainerUrl,{timeout:25000})
      await page.locator('[data-square="e4"]').first().waitFor()
      console.log('PASS production logout/login preserves the same Auto course location')
    }
    assert.deepEqual(errors,[],'no uncaught application errors')
    await context.close()
  }
} finally { await browser.close(); if(server) await new Promise(resolve=>server.httpServer.close(resolve)) }
