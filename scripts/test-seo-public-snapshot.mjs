import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {runInNewContext} from 'node:vm'

// Isolated document fixtures only: never inspect a real browser/account session.
const bundle=await build({entryPoints:['src/seo/publicShellSnapshot.ts'],bundle:true,write:false,platform:'node',format:'cjs'})
function load(path,pathname=path,catalog='{"publicCatalog":true}'){
 const root={innerHTML:'public shell',getAttribute:()=>path,querySelector:s=>({innerHTML:s==='[data-public-presentation]'?'public page':'public page + SEO'})}
 const context={module:{exports:{}},location:{pathname},document:{getElementById:id=>id==='root'?root:{textContent:catalog}}}
 runInNewContext(bundle.outputFiles[0].text,context)
 return {...context.module.exports,location:context.location}
}
const home=load('/')
assert.equal(home.publicShellMarkup(),'public shell')
assert.equal(home.publicShellMarkup(true),'public page')
assert.equal(home.publicShellMarkup(false,true),'public page + SEO')
home.location.pathname='/account'
assert.equal(home.publicShellMarkup(),null,'public snapshot cannot replace a private destination')
for(const path of ['/account','/auth','/admin/affiliates','/mates/m1/back-rank','/master-mates/1/smothered','/master-tactics/2/bishop-fork','/not-a-route']){
 assert.equal(load(path).publicShellMarkup(),null,path+' cannot be captured as public presentation')
 assert.equal(load('/master-mates',path).readPublicHubCatalog('/master-mates'),null,path+' cannot use hub initialization data')
}
const alias=load('/endgame','/endgames')
assert.equal(alias.publicShellMarkup(false,true),'public page + SEO')
alias.location.pathname='/endgame'
assert.equal(alias.publicShellMarkup(true),'public page')
for(const path of ['/master-mates','/master-tactics']){
 assert.equal(load(path).readPublicHubCatalog(path).publicCatalog,true)
 assert.equal(load(path,path,'invalid').readPublicHubCatalog(path),null)
 assert.equal(load('/').readPublicHubCatalog(path),null)
}
console.log('PASS public snapshot isolation: public-only capture, unchanged private/trainer fallback, canonical alias, root-only catalog, malformed catalog rejection.')
