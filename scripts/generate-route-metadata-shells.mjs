import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const dist=path.join(root,'dist')
// Bundle only public content and policy. Never load application/auth/financial state.
const bundle=await build({stdin:{contents:"export * from './src/seo/routePolicy'; export * from './src/seo/publicPages'; export * from './src/seo/renderPublicContent'",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'})
const {site,prerenderRoutes,seoDetails,structuredData,publicPages,renderPublicContent,escapeHtml:e}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const template=await readFile(path.join(dist,'index.html'),'utf8')
const start='<!-- route-metadata:start -->',end='<!-- route-metadata:end -->'
if(!template.includes(start)||!template.includes(end))throw Error('Missing metadata template markers')
const shellName=p=>p==='/'?'home.html':p.slice(1).replaceAll('/','--')+'.html'
const style=await readFile(path.join(root,'src/seo/publicContent.css'),'utf8')
// The server bundle is build-only, runs no React effects and cannot reach backend APIs.
// Use existing React/presentation dependencies; no browser install or service credentials.
const require=createRequire(path.join(root,'package.json'))
process.env.NODE_ENV='production'
const shellBundle=await build({entryPoints:[path.join(root,'src/seo/PublicShell.tsx')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.VITE_AFFILIATE_DISCOVERY_ENABLED':JSON.stringify(process.env.AFFILIATE_PROGRAM_ENABLED==='true'),'import.meta.env.VITE_PAYPAL_CLIENT_ID':'""','import.meta.env.VITE_MASTER_PUZZLES_BASE_URL':'undefined','import.meta.env.DEV':'false','import.meta.env.PROD':'true'},plugins:[{
 name:'public-shell-no-backend',setup(b){b.onLoad({filter:/[\\/]lib[\\/]supabase\.ts$/},()=>({contents:`const unavailable=()=>{throw Error('Backend access forbidden in public shell rendering')}; export const supabase=new Proxy({}, {get:unavailable}); export const fetchMasterGameById=unavailable; export const fetchMasterGamesSearch=unavailable;`,loader:'js'}))}
}]})
const shellModule={exports:{}}
new Function('require','module','exports',shellBundle.outputFiles[0].text)(require,shellModule,shellModule.exports)
const {renderPublicShell}=shellModule.exports
const catalogs={}
for(const [route,file] of [['/master-mates','indexes/mates-theme-catalog.json'],['/master-tactics','catalog.json']]){
 const base=process.env.VITE_MASTER_PUZZLES_BASE_URL?.trim().replace(/\/$/,'')
 let text
 if(base){
  const url=new URL(base+'/'+file)
  if(url.protocol!=='https:'||!url.pathname.includes('/object/public/'))throw Error('Public shell catalogs require a public HTTPS Storage base')
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw Error('Public catalog unavailable: '+response.status)
  text=await response.text()
 }else text=await readFile(path.join(root,'public/data/master-puzzles/v1',file),'utf8')
 if(Buffer.byteLength(text)>512000)throw Error('Public catalog exceeds bounded metadata size')
 const data=JSON.parse(text)
 if(!data.schemaVersion||!(route==='/master-mates'?data.distances&&data.primaryOrder:data.tactics&&data.mixed&&data.canonicalPuzzleCount))throw Error('Invalid public hub catalog')
 catalogs[route]=data
}
function head(p) {
 const d=seoDetails(p),schema=structuredData(p)
 const meta=(kind,key,value)=>'<meta '+kind+'="'+key+'" content="'+e(value)+'">'
 return '<title>'+e(d.title)+'</title>'+meta('name','description',d.description)+meta('name','robots',d.indexable?'index,follow':'noindex,follow')+
 '<link rel="canonical" href="'+e(d.canonical)+'">'+meta('property','og:type','website')+meta('property','og:site_name','Weiss Chess')+
 meta('property','og:title',d.title)+meta('property','og:description',d.description)+meta('property','og:url',d.canonical)+meta('property','og:image',site.socialImage)+
 meta('name','twitter:card','summary_large_image')+meta('name','twitter:title',d.title)+meta('name','twitter:description',d.description)+meta('name','twitter:image',site.socialImage)+
 (schema?'<script id="weiss-site-structured-data" type="application/ld+json">'+JSON.stringify(schema).replaceAll('<','\\u003c')+'</script>':'')
}
await mkdir(path.join(dist,'_route-metadata'),{recursive:true})
const manifest=[]
for(const p of prerenderRoutes) {
 const page=publicPages[p],staticPage=page?.standalone
 let html=template
 if(staticPage) html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*(?:rel="modulepreload"|rel="stylesheet")[^>]*>/g,'')
 html=html.slice(0,html.indexOf(start)+start.length)+head(p)+html.slice(html.indexOf(end))
 html=html.replace('</head>','<style>'+style+(staticPage?'body{margin:0;background:#191715}':'')+'</style></head>')
 const appShell=page&&!staticPage?renderPublicShell(p,catalogs[p]):null
 const content=appShell||(page?'<main id="seo-initial-content">'+renderPublicContent(p,true)+'</main>':'')
 const header=staticPage?'<header class="seo-static-header"><a href="/">Weiss Chess</a><a href="/mates">Train mates</a><a href="/tactics">Train tactics</a></header>':''
 const footer=staticPage?'<footer class="seo-static-footer"><a href="/privacy">Privacy</a><a href="/accessibility">Accessibility</a></footer>':''
 html=html.replace('<div id="root"></div>','<div id="root">'+header+content+footer+'</div>')
 if(appShell){
  // The live ThemeProvider always uses the Classic SITE PALETTE; pieces remain Merida.
  html=html.replace('<html','<html data-site-theme="classic"').replace('<div id="root">','<div id="root" data-public-shell-path="'+e(p)+'">')
  if(catalogs[p])html=html.replace('</body>','<script id="public-hub-catalog" type="application/json">'+JSON.stringify(catalogs[p]).replaceAll('<','\\u003c')+'</script></body>')
 }
 const output='_route-metadata/'+shellName(p)
 await writeFile(path.join(dist,output),html)
 if(staticPage){const target=path.join(dist,p.slice(1));await mkdir(target,{recursive:true});await writeFile(path.join(target,'index.html'),html)}
 manifest.push({path:p,...seoDetails(p),standalone:Boolean(staticPage),file:output,bytes:Buffer.byteLength(html)})
}
// The application fallback must not claim it is an indexable homepage.
// Unknown paths have no claimed canonical identity until the app resolves them.
const fallbackHead=head('/training-state').replace(/<link rel="canonical"[^>]*>/g,'').replace(/<meta property="og:url"[^>]*>/g,'')
const fallback=template.slice(0,template.indexOf(start)+start.length)+fallbackHead+template.slice(template.indexOf(end))
await writeFile(path.join(dist,'index.html'),fallback)
await writeFile(path.join(dist,'404.html'),fallback.replace('<div id="root"></div>','<div id="root"><main><h1>Page not found</h1><p>This page does not exist. <a href="/">Return to Weiss Chess</a>.</p></main></div>'))
await writeFile(path.join(dist,'seo-manifest.json'),JSON.stringify(manifest,null,2))
const urls=manifest.filter(x=>x.indexable)
await writeFile(path.join(dist,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(x=>'<url><loc>'+e(x.canonical)+'</loc></url>').join('')+'</urlset>')
await writeFile(path.join(dist,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /api/\n\n# Allow crawlers to read noindex; authentication protects private data.\nSitemap: https://weisschess.com/sitemap.xml\n')
console.log('Prerendered '+urls.length+' INDEX pages ('+urls.filter(x=>x.standalone).length+' zero-JS guides), '+(manifest.length-urls.length)+' NOINDEX shells.')
