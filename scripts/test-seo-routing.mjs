import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
const b=await build({stdin:{contents:"export * from './src/seo/routePolicy';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'})
const policy=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const config=JSON.parse(await readFile('vercel.json','utf8'))
const name=p=>p==='/'?'home.html':p.slice(1).replaceAll('/','--')+'.html'
const exact=policy.prerenderRoutes.filter(p=>policy.seoDetails(p).indexable).map(source=>({source,destination:'/_route-metadata/'+name(source)}))
// One canonical alias already handled by the existing application router.
exact.push({source:'/endgames',destination:'/_route-metadata/endgame.html'})
if(process.argv.includes('--prove-precedence')) {
 const {require_dist}=await import('file:///C:/Users/Ariel/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/chunks/chunk-332LMJLZ.js')
 const {getTransformedRoutes}=require_dist()
 const paths=new Set(config.rewrites.map(r=>r.source))
 const proposed={...config,rewrites:[...exact.filter(r=>!paths.has(r.source)),...config.rewrites.map(r=>r.source==='/((?!data(?:/|$)).*)'?{...r,destination:'/index.html'}:r)]}
 const before=getTransformedRoutes(config),after=getTransformedRoutes(proposed)
 assert.equal(before.error,null);assert.equal(after.error,null)
 const phase=after.routes.findIndex(r=>r.handle==='filesystem')
 assert(phase>=0)
 assert.deepEqual(before.routes.slice(0,phase+1),after.routes.slice(0,phase+1),'All existing headers and filesystem dispatch preserved')
 for(const p of ['/api/affiliate','/api/paypal-webhook','/api/price-profile','/assets/app.js','/auth','/account','/admin/affiliates','/affiliate/dashboard','/mates/m1/back-rank','/master-mates/1/smothered','/master-tactics/1/bishop-fork']){
  const matches=exact.filter(r=>new RegExp('^'+r.source+'$').test(p))
  assert.equal(matches.length,0,'Public rewrite must not match '+p)
 }
 for(const old of config.rewrites.filter(r=>r.destination!=='/'))assert(proposed.rewrites.some(r=>JSON.stringify(r)===JSON.stringify(old)),'Preserve existing special rule '+old.source)
 console.log('PASS installed Vercel compiler: filesystem dispatch before every rewrite; all prior headers/functions/special route entries preserved; exact INDEX rewrites do not match protected paths or Master trainer descendants. Only existing catch-all destination changes, source pattern unchanged.')
 console.log(JSON.stringify(after.routes.filter(r=>r.dest&&(/master-mates|master-tactics|index.html/.test(r.dest)))))
} else if(process.argv.includes('--print-rewrites')) {
 const publicPaths=new Set(exact.map(r=>r.source))
 console.log(JSON.stringify([...exact,...config.rewrites.filter(r=>!publicPaths.has(r.source)&&r.destination!=='/'),{source:'/((?!data(?:/|$)).*)',destination:'/index.html'}],null,2))
} else {
 const root=exact.find(r=>r.source==='/')
 const early=config.routes.filter(r=>r.dest)
 assert.equal(early.length,1,'No broad pre-filesystem override')
 assert.equal(early[0].src,'^/$');assert.equal(early[0].dest,root.destination)
 assert.deepEqual(early[0].headers,Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value])),'Root keeps existing security headers')
 assert.equal(new Set(config.rewrites.map(r=>r.source)).size,config.rewrites.length,'No duplicate rewrite sources')
 for(const rule of exact)assert.deepEqual(config.rewrites.find(r=>r.source===rule.source),rule,rule.source)
 const served=config.rewrites.filter(r=>policy.seoDetails(r.source).indexable)
 assert.deepEqual(served.map(r=>r.source).sort(),exact.filter(r=>r.source!=='/endgames').map(r=>r.source).sort(),'INDEX registry equals public-shell routing')
 assert.deepEqual(config.rewrites.at(-1),{source:'/((?!data(?:/|$)).*)',destination:'/index.html'})
 for(const r of exact)assert(!/^\/(api|auth|account|admin)(\/|$)/.test(r.source),'Exact public rewrites cannot capture protected routes')
 console.log('PASS registry-derived routing:',exact.length-1,'INDEX rewrites; one existing canonical alias; conservative SPA fallback.')
}
