import legacy from './routeMetadata.json'
import { publicPages, publicBreadcrumbs } from './publicPages'

export const site = legacy.site
export const cleanPath = (value: string) => {
 const pathname = value.split(/[?#]/,1)[0] || '/'
 return pathname.replace(/\/+$/,'').toLowerCase() || '/'
}
export function seoDetails(value: string) {
 const path = cleanPath(value)
 const page = publicPages[path]
 const old = (legacy.routes as Record<string,{title:string;description:string;indexable:boolean;canonicalPath?:string}>)[path]
 const canonicalPath = path === '/endgames' ? '/endgame' : old?.canonicalPath ?? path
 return {
  title: page ? `${page.title} | Weiss Chess` : old?.title ?? 'Chess Training | Weiss Chess',
  description: page?.description ?? old?.description ?? site.defaultDescription,
  indexable: Boolean(page),
  policy: page ? (value!==path?'CANONICALIZED VARIANT':'INDEX') : 'NOINDEX',
  canonicalPath, canonical: `${site.url}${canonicalPath}`,
 }
}
export const prerenderRoutes = [...new Set([...Object.keys(legacy.routes),...Object.keys(publicPages),'/affiliate/dashboard','/affiliate/terms','/admin/affiliates','/openings/my-openings','/openings/my-openings/practice'])].sort()
export function structuredData(path: string) {
 const page=publicPages[path]
 if(!page) return null
 const graph: object[]=[{'@type':'WebSite','@id':`${site.url}/#website`,url:`${site.url}/`,name:'Weiss Chess',description:site.defaultDescription}]
 if(path==='/') graph.push({'@type':'Organization',name:'Weiss Chess',url:site.url,logo:`${site.url}/favicon.svg`},{'@type':'SoftwareApplication',name:'Weiss Chess',applicationCategory:'EducationalApplication',operatingSystem:'Web',url:site.url,description:page.intro})
 if(path!=='/') {
  const crumbs=publicBreadcrumbs(path)
  graph.push({'@type':'BreadcrumbList',itemListElement:crumbs.map((c,i)=>({'@type':'ListItem',position:i+1,name:c.label,item:site.url+c.href}))})
 }
 return {'@context':'https://schema.org','@graph':graph}
}
