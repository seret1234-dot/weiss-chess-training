import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
const cli='C:/Users/Ariel/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js'
// Vercel's own documented dry-run scanner: no upload/deployment is created.
const raw=execFileSync(process.execPath,[cli,'deploy','--dry','--json'],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']})
const audit=JSON.parse(raw),files=audit.files.filter(f=>f.path&&f.size>0)
const paths=new Set(files.map(f=>f.path.replaceAll('\\','/')))
const forbidden=[...paths].filter(p=>/^(?:docs|reports|generated|supabase|audit-reports|\.vercel[^/]*|\.local-verified-lichess-tactics-v1)\//.test(p)||/^public\/data\/master-puzzles\//.test(p)||/(^|\/)\.env(?:\.|$)|\.(?:db|sqlite|sqlite3|sql|dump|log)$|(?:^|\/)(?:credentials|secrets)\./i.test(p))
assert.deepEqual(forbidden,[],'No local reports/databases/credentials/raw Master corpus in source payload')
for(const p of ['package.json','package-lock.json','vercel.json','vite.config.ts','index.html','scripts/generate-route-metadata-shells.mjs','scripts/patch-react-chessboard-position.cjs','src/seo/PublicShell.tsx','src/seo/publicPages.ts','src/seo/routePolicy.ts','src/seo/publicShellSnapshot.ts','public/favicon.svg'])assert(paths.has(p),'Required deployment source missing: '+p)
const sourceIndex=await readFile('dist/seo-manifest.json','utf8'),manifest=JSON.parse(sourceIndex)
for(const item of manifest)assert((await readFile('dist/'+item.file)).length>0,item.path+' generated HTML')
for(const p of ['sitemap.xml','robots.txt'])assert((await readFile('dist/'+p)).length>0,p)
const social=JSON.parse(await readFile('src/seo/routeMetadata.json','utf8')).site.socialImage
assert(paths.has('public'+new URL(social).pathname),'Social image source included')
const extensions={}
for(const f of files){const root=f.path.split(/[\\/]/)[0];extensions[root]=(extensions[root]||0)+1}
const report={cli:'59.11.7',mode:'source deployment dry-run; build generates dist remotely',fileCount:audit.fileCount,totalSize:audit.totalSize,nonemptyFiles:files.length,forbiddenCount:0,sourceGroups:extensions,seoArtifacts:manifest.length,indexPages:manifest.filter(r=>r.indexable).length,sourcePaths:[...paths].sort()}
await writeFile('docs/seo-upload-audit.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,sourcePaths:undefined},null,2))
