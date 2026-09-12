import {publicPages} from './publicPages'

// Capture only build-generated PUBLIC markup before createRoot replaces it.
// Never capture a mounted/authenticated page or any trainer/private URL.
const root=typeof document==='undefined'?null:document.getElementById('root')
const path=root?.getAttribute('data-public-shell-path')||''
const valid=Boolean(publicPages[path]&&!publicPages[path].standalone)
const snapshot=valid?{
 path,html:root!.innerHTML,
 page:root!.querySelector('[data-public-presentation]')?.innerHTML||'',
 content:root!.querySelector('#site-main-content')?.innerHTML||'',
 catalog:document.getElementById('public-hub-catalog')?.textContent||'',
}:null

export function publicShellMarkup(pageOnly=false,contentOnly=false){
 if(!snapshot||typeof location==='undefined'||(location.pathname!==snapshot.path&&!(location.pathname==='/endgames'&&snapshot.path==='/endgame')))return null
 return contentOnly?snapshot.content:pageOnly?snapshot.page:snapshot.html
}
export function readPublicHubCatalog<T>(path:'/master-mates'|'/master-tactics'):T|null{
 if(!snapshot||snapshot.path!==path||typeof location==='undefined'||location.pathname!==path)return null
 try{return JSON.parse(snapshot.catalog) as T}catch{return null}
}
