import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {build} from 'esbuild'
const result=await build({stdin:{contents:"export * from './src/seo/routePolicy'; export * from './src/seo/publicPages'; export * from './src/seo/renderPublicContent'; export {siteExplanations} from './src/content/siteExplanations'",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'})
let m
try {m=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))}catch(e){throw new Error(e.message)}
const manifest=JSON.parse(await readFile('dist/seo-manifest.json','utf8'))
const index=manifest.filter(r=>r.indexable),titles=new Set(),descriptions=new Set(),pages=new Map(),links=new Map()
const sitemap=await readFile('dist/sitemap.xml','utf8')
for(const row of index){
 const s=await readFile('dist/'+row.file,'utf8'),p=m.publicPages[row.path]
 assert.equal((s.match(/<title>/g)||[]).length,1,row.path)
 assert(!titles.has(row.title),'Duplicate title '+row.title);titles.add(row.title)
 assert(!descriptions.has(row.description),'Duplicate description '+row.path);descriptions.add(row.description)
 assert(row.title.length<115 && row.description.length>50,row.path)
 assert.equal((s.match(/<h1\b/g)||[]).length,1,row.path+' initial H1')
 assert(s.includes('content="index,follow"'),row.path)
 assert(s.includes('href="'+row.canonical+'"'),row.path)
 assert(s.includes('property="og:url" content="'+row.canonical+'"'),row.path)
 assert(sitemap.includes('<loc>'+row.canonical+'</loc>'),row.path)
 assert(!/[?#]/.test(row.canonical),row.path)
 const schemas=[...s.matchAll(/type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(x=>JSON.parse(x[1]))
 assert.equal(schemas.length,1,row.path)
 assert(schemas[0]['@graph'].some(x=>x['@type']==='WebSite'),row.path)
 if(row.path!=='/')assert(schemas[0]['@graph'].some(x=>x['@type']==='BreadcrumbList' && x.itemListElement.at(-1).item===row.canonical),row.path)
 assert(!/AggregateRating|reviewCount|priceCurrency/.test(JSON.stringify(schemas)),'No invented ratings/offers')
 assert(s.includes(m.escapeHtml(p.intro)),row.path+' visible source copy')
 if(p.explanationKey)assert.equal(p.intro,m.siteExplanations[p.explanationKey].concept,row.path+' authoritative definition')
 if(p.standalone){assert(!/<script\b[^>]*\bsrc=/.test(s),row.path+' no app JS');assert(!/<script(?![^>]*application\/ld\+json)[^>]*>/.test(s),row.path+' no executable inline JS')}
 if(p.trainer){assert(p.links.some(x=>x.href===p.trainer),row.path+' practice CTA');assert(p.sections.length>=3,row.path+' meaningful sections')}
 assert(!/TODO|lorem ipsum|coming soon|P-[A-Z0-9]{12}|access_token|service_role/i.test(s),row.path+' no placeholder/private/provider data')
 const hrefs=[...s.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(x=>x[1]);assert(hrefs.length>=2,row.path+' anchors')
 links.set(row.path,hrefs);pages.set(row.path,s)
}
assert.equal((sitemap.match(/<loc>/g)||[]).length,index.length)
for(const p of ['/account','/auth','/affiliate/dashboard','/admin/affiliates','/auto','/analyze/board?fen=private','/master-games/my-library','/openings/my-openings','/mates/m1/back-rank?chunk=2','/master-mates/1/smothered','/master-tactics/1/bishop-fork','/does-not-exist'])assert.equal(m.seoDetails(p).indexable,false,p)
for(const p of ['/','/mates','/tactics','/master-mates','/master-tactics','/pricing'])for(const q of ['?ref=coach','?chunk=2&learnerCurriculum=full-precut-v1','?debug=1#move'])assert.equal(m.seoDetails(p+q).canonical,'https://weisschess.com'+p)
assert.equal(m.seoDetails('/mates/m1/back-rank?chunk=25').canonical,'https://weisschess.com/mates/m1/back-rank')
const queue=['/'],seen=new Set();while(queue.length){const p=queue.shift();if(seen.has(p))continue;seen.add(p);for(const l of links.get(p)||[])if(pages.has(l))queue.push(l)}
const orphans=index.filter(x=>!seen.has(x.path));assert.deepEqual(orphans,[],'Every INDEX page reachable through public anchors')
const unknown=[];const router=await readFile('src/AppRouter.tsx','utf8')
let externalLinks=0
for(const [p,hrefs] of links)for(const href of hrefs){
 const url=new URL(href,'https://weisschess.com'+p)
 assert(['https:','mailto:'].includes(url.protocol),p+' unsafe link protocol: '+href)
 if(url.origin!=='https://weisschess.com'){externalLinks++;continue}
 const route=m.cleanPath(url.pathname);if(!m.publicPages[route]&&!manifest.some(x=>x.path===route)&&!router.includes('path="'+route+'"')&&!/^\/(tactics\/m[1-4]|master-(mates|tactics)\/[1-4])(?:\/[^/]+)?$/.test(route)&&!/^\/mates\/m1\/kill-box$/.test(route))unknown.push({p,href})
}
assert.deepEqual(unknown,[],'Public links have known destinations')
const report=`# SEO source-link crawl — ${new Date().toISOString()}\n\nLocal generated HTML, starting at home and following same-origin anchors. This is not evidence of deployed Vercel routing.\n\n- INDEX pages: ${index.length}\n- Reachable INDEX pages: ${seen.size}\n- Orphan INDEX pages: ${orphans.length}\n- Unknown link destinations: ${unknown.length}\n- Duplicate titles/descriptions: 0\n- Missing initial H1/canonical/schema: 0\n- Zero-JavaScript guide pages: ${index.filter(x=>x.standalone).length}\n- Private routes in sitemap: 0\n\nPrivate account/auth links are intentional navigation, not indexed pages.\n\n## Deployment gate\n\nProduction rewrites remain unchanged: safety review rejected route/catch-all changes. New public guide URL routing and full HTTP404 verification require that approval. **Do not deploy this local state yet.**\n\n## INDEX inventory\n\n${index.map(x=>'- '+x.path).join('\n')}\n`
await writeFile('docs/seo-crawl-report.md',report.replace('Production rewrites remain unchanged: safety review rejected route/catch-all changes. New public guide URL routing and full HTTP404 verification require that approval. **Do not deploy this local state yet.**','Exact public rewrites are now owner-authorized and registry-verified. See the separate HTTP/precedence reports for routing evidence; this source graph alone is not a deployment gate. Unknown URLs remain conservative NOINDEX soft-404 SPA responses.').replace('## INDEX inventory','External HTTPS/mailto anchors checked for safe protocols: '+externalLinks+'.\n\n## INDEX inventory'))
console.log('PASS SEO source suite:',index.length,'INDEX pages; metadata, authoritative definitions, canonical variants, noindex, schema, zero-JS guides and anchor graph.')
