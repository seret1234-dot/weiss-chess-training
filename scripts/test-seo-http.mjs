import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {startSeoServer} from './seo-http-fixture.mjs'
const remote=process.argv.find(x=>x.startsWith('--base='))?.slice(7)
const fixture=remote?null:await startSeoServer(),base=remote||fixture.base
const manifest=JSON.parse(await readFile('dist/seo-manifest.json','utf8')),pages=manifest.filter(x=>x.indexable),results=[],failures=[]
const hash=s=>createHash('sha256').update(s).digest('hex')
const meta=(html,name)=>html.match(new RegExp('<meta name="'+name+'" content="([^"]*)"'))?.[1]||null
async function check(p,expected,expectedStatus=200){
 const res=await fetch(base+p,{signal:AbortSignal.timeout(15000)}),html=await res.text()
 const title=html.match(/<title>(.*?)<\/title>/s)?.[1]||null,canonical=html.match(/<link rel="canonical" href="([^"]*)"/)?.[1]||null
 const row={path:p,status:res.status,rule:res.headers.get('x-seo-rule'),artifact:res.headers.get('x-seo-artifact'),title,robots:meta(html,'robots'),headerRobots:res.headers.get('x-robots-tag'),canonical,h1:(html.match(/<h1\b/g)||[]).length,links:(html.match(/<a\b[^>]*href=/g)||[]).length,bytes:Buffer.byteLength(html),errors:[]}
 function gate(ok,message){if(!ok){row.errors.push(message);failures.push({path:p,message})}}
 gate(res.status===expectedStatus,'Expected HTTP '+expectedStatus)
 if(expected){
  gate(row.robots==='index,follow','Expected INDEX');gate(!row.headerRobots?.includes('noindex'),'Unexpected noindex header')
  const escapedTitle=expected.title.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
  gate(canonical===expected.canonical,'Wrong canonical');gate(title===escapedTitle,'Wrong title')
  gate(row.h1===1,'One initial H1');gate(row.links>=2,'Initial crawlable links')
  const localHtml=await readFile('dist/'+expected.file,'utf8')
  if(!remote)gate(hash(html)===hash(localHtml),'Intended generated shell differs')
  else gate(html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1]===localHtml.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1],'Intended initial public H1 differs')
  try{const json=JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'null');gate(Boolean(json?.['@graph']?.length),'Expected structured data')}catch{gate(false,'Invalid schema JSON')}
 }else{
  gate(row.robots==='noindex,follow','Fallback/private page must be NOINDEX')
  gate(canonical!=='https://weisschess.com/','Must not inherit home canonical')
  gate(!html.includes('"@type":"Organization"'),'No home structured data')
  gate(/<script[^>]+src=/.test(html),'SPA boot preserved')
 }
 results.push(row)
}
try{
 for(const p of pages)await check(p.path,p)
 for(const p of ['/endgames','/mates?ref=sample&chunk=3'])await check(p,pages.find(x=>x.path===(p==='/endgames'?'/endgame':'/mates')))
 for(const p of ['/account','/auth','/affiliate/dashboard','/admin/affiliates','/auto','/analyze/board?fen=example','/mates/m1/back-rank?chunk=3','/master-mates/1/smothered','/master-tactics/1/bishop-fork','/privacy','/privacy/he','/accessibility','/accessibility/he','/mates/m1','/tactics/m1'])await check(p,null)
 for(const p of ['/not-a-real-page','/checkmate-patterns/nonexistent','/bad%20url'])await check(p,null,404)
 const sitemap=await fetch(base+'/sitemap.xml').then(r=>r.text()),robots=await fetch(base+'/robots.txt').then(r=>r.text())
 assert.equal((sitemap.match(/<loc>/g)||[]).length,pages.length);assert(robots.includes('Sitemap: https://weisschess.com/sitemap.xml'))
 const assetHtml=remote?await fetch(base+'/').then(r=>r.text()):await readFile('dist/index.html','utf8')
 const asset=assetHtml.match(/<script[^>]+src="([^"]+)"/)[1]
 assert.equal((await fetch(base+asset)).status,200,'JS asset served')
 const report={base,environment:remote?'Remote HTTP crawl':'Local HTTP routing fixture; real HTTP and files, APIs reserved but NOT executed. Not proof of deployed Vercel routing.',sitemapCount:pages.length,results,failures,soft404:'Unknown public URLs return HTTP 404 with noindex; registered SPA routes remain HTTP 200.'}
 await writeFile(remote?'docs/seo-live-http-results.json':'docs/seo-http-results.json',JSON.stringify(report,null,2))
 const table=['# SEO HTTP route table','',''+report.environment,'','| Request | Matched rule | Artifact | Status | Robots | Canonical | Errors |','|---|---|---|---|---|---|---|',...results.map(r=>'| '+[r.path,r.rule||'remote',r.artifact||'remote',r.status,r.robots,r.canonical||'none',r.errors.join('; ')||'none'].join(' | ')+' |'),'','Static JS: HTTP 200. API handlers are not executed by the local fixture.','',report.soft404].join('\n')
 if(!remote)await writeFile('docs/seo-route-table.md',table)
 console.log(JSON.stringify({requests:results.length,sitemapCount:pages.length,failures},null,2))
 if(failures.length)process.exitCode=1
}finally{fixture?.server.close()}
