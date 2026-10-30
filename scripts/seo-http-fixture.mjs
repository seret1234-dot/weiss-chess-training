// Loopback-only routing fixture. Never executes API handlers or uses credentials.
import {createServer} from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import path from 'node:path'
export async function startSeoServer({publicShells=false,legacyShell=false}={}){
 const root=path.resolve('dist'), config=JSON.parse(await readFile('vercel.json','utf8'))
 // Mount tests explicitly map generated public artifacts, not production rewrites.
 const manifest=publicShells?JSON.parse(await readFile(path.join(root,'seo-manifest.json'),'utf8')):[]
 let legacyRender
 if(legacyShell){const {build}=await import('esbuild');const b=await build({stdin:{contents:"export {renderPublicContent} from './src/seo/renderPublicContent'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});legacyRender=(await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))).renderPublicContent}
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.xml':'application/xml','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'}
 const server=createServer(async(req,res)=>{
  try{
   const requestUrl=new URL(req.url,'http://localhost'),p=decodeURIComponent(requestUrl.pathname)
   const redirect=config.redirects?.find(r=>new RegExp('^'+r.source+'$').test(p))
   if(redirect){res.writeHead(redirect.permanent?308:307,{Location:redirect.destination+requestUrl.search});return res.end()}
   if(p.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json','X-SEO-Rule':'API reserved; disabled locally'});return res.end('{"error":"Local SEO fixture does not execute APIs"}')}
   const target=path.resolve(root,'.'+p)
   if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(400);return res.end()}
   let file,rule,status=200
   const publicRow=manifest.find(r=>r.indexable&&r.path===(p==='/endgames'?'/endgame':p))
   if(publicRow){file=path.join(root,publicRow.file);rule='local public-shell mount fixture'}
   // Low-level exact routes run before filesystem dispatch on Vercel.
   const early=config.routes?.find(r=>r.dest&&!r.continue&&new RegExp(r.src).test(p))
   if(!file&&early){file=path.join(root,early.dest);rule=early.src}
   if(!file)try{if((await stat(target)).isFile()){file=target;rule='static file'}else if((await stat(path.join(target,'index.html'))).isFile()){file=path.join(target,'index.html');rule='static directory'}}catch{}
   if(!file){const r=config.rewrites.find(r=>r.source===p||new RegExp('^'+r.source+'$').test(p))
    if(r){file=path.join(root,r.destination==='/'?'_route-metadata/home.html':r.destination);rule=r.source}
    else{file=path.join(root,'404.html');rule='filesystem miss: custom 404';status=404}
   }
   let body=await readFile(file)
   if(legacyRender&&publicRow&&!publicRow.standalone)body=Buffer.from(body.toString().replace(/ data-site-theme="[^"]*"/,'').replace(/<div id="root"[^>]*>[\s\S]*<\/body>/,'<div id="root"><main id="seo-initial-content">'+legacyRender(publicRow.path,true)+'</main></div></body>'))
   for(const r of config.routes||[])if(r.headers&&new RegExp('^'+r.src+'$').test(p))for(const[k,v]of Object.entries(r.headers))res.setHeader(k,v)
   res.writeHead(status,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-SEO-Rule':rule,'X-SEO-Artifact':path.relative(root,file).replaceAll('\\','/')});res.end(body)
  }catch{res.writeHead(404);res.end('Not found')}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 return {server,base:'http://127.0.0.1:'+server.address().port}
}
