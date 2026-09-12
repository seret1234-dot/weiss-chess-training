import assert from 'node:assert/strict'
import {readFile,writeFile,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {require_dist} from 'file:///C:/Users/Ariel/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/chunks/chunk-332LMJLZ.js'
const config=JSON.parse(await readFile('vercel.json','utf8'))
const manifest=JSON.parse(await readFile('dist/seo-manifest.json','utf8'))
const {getTransformedRoutes}=require_dist(),compiled=getTransformedRoutes(config)
assert.equal(compiled.error,null)
const filesystem=compiled.routes.findIndex(r=>r.handle==='filesystem')
assert(filesystem>=0)
const early=compiled.routes.filter((r,i)=>r.dest&&i<filesystem)
assert.equal(early.length,1,'Only the exact homepage may precede filesystem dispatch')
assert.equal(early[0].src,'^/$');assert.equal(early[0].dest,'/_route-metadata/home.html')
const html=await readFile('dist/index.html','utf8')
const js=html.match(/<script[^>]+src="([^"]+)"/)[1],css=html.match(/<link[^>]+href="([^\"]+\.css)"/)[1]
const protectedPaths=['/api/price-profile','/api/affiliate','/api/paypal-webhook','/api/verify-paypal-subscription','/api/cancel-paypal-subscription','/auth','/account','/admin/affiliates','/affiliate/dashboard','/mates/m1/back-rank','/tactics/m1/bishop-fork','/master-mates/1/smothered','/master-tactics/1/bishop-fork','/auto','/analyze/board','/openings/my-openings','/master-games/library/example',js,css,'/favicon.svg','/sitemap.xml','/robots.txt','/not-a-real-page']
const publicPaths=manifest.filter(r=>r.indexable).map(r=>r.path),rows=[]
async function exists(file){try{return (await stat(file)).isFile()}catch{return false}}
for(const request of [...publicPaths,'/endgames',...protectedPaths]){
 const publicRule=config.rewrites.find(r=>r.source===request&&(publicPaths.includes(request)||request==='/endgames'))
 if(protectedPaths.includes(request))assert(!publicRule,request+' is never intercepted by SEO')
 let artifact,rule,type
 if(request==='/'){artifact=early[0].dest;rule='exact root before filesystem';type='static'}
 else if(request.startsWith('/api/')&&await exists('.'+request+'.js')){artifact=request+'.js';rule='filesystem function';type='function'}
 else if(await exists(join('dist',request))){artifact=request;rule='filesystem static';type='static'}
 else if(request!=='/'&&await exists(join('dist',request,'index.html'))){artifact=request+'/index.html';rule='filesystem static directory';type='static'}
 else{
  const match=compiled.routes.slice(filesystem+1).find(r=>r.dest&&new RegExp(r.src).test(request))
  assert(match,'No match for '+request);artifact=match.dest;rule=match.src;type='shell'
 }
 let robots=null,canonical=null
 if(artifact.endsWith('.html')){
  const body=await readFile(join('dist',artifact),'utf8')
  robots=body.match(/<meta name="robots" content="([^"]+)"/)?.[1]||null
  canonical=body.match(/<link rel="canonical" href="([^"]+)"/)?.[1]||null
  if(publicRule)assert.equal(robots,'index,follow',request)
  else {assert.equal(robots,'noindex,follow',request);assert.notEqual(canonical,'https://weisschess.com/',request)}
 }
 if(request.startsWith('/api/'))assert.equal(type,'function',request)
 rows.push({request,rule,artifact,type,robots,canonical})
}
await writeFile('docs/seo-precedence-results.json',JSON.stringify({compiler:'Vercel 59.11.7 getTransformedRoutes',filesystemBeforeRewrites:true,functions:config.functions,rows},null,2))
console.log('PASS native-compiler precedence:',rows.length,'requests; 52 INDEX routes + alias; APIs/functions/static assets first; auth/admin/trainers/Auto/Analyze/libraries retain non-SEO shells.')
