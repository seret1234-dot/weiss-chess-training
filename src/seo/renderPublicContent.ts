import { publicPages, publicBreadcrumbs } from './publicPages'

export const escapeHtml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
export function renderPublicContent(path: string, standalone = false) {
 const p=publicPages[path]; if(!p) return ''
 const a=(href:string,label:string)=>`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
 const level=standalone?'h1':'h2'
 return `<section class="seo-public-content" aria-label="${escapeHtml(p.title)}">
 ${path==='/'?'':`<nav aria-label="Breadcrumb">${publicBreadcrumbs(path).map(c=>c.href===path?`<span aria-current="page">${escapeHtml(c.label)}</span>`:a(c.href,c.label)).join(' › ')}</nav>`}
 <${level}>${escapeHtml(p.title)}</${level}><p>${escapeHtml(p.intro)}</p>
 ${p.sections.map(s=>`<section><${standalone?'h2':'h3'}>${escapeHtml(s.title)}</${standalone?'h2':'h3'}><p>${escapeHtml(s.text)}</p></section>`).join('')}
 <nav aria-label="${p.trainer?'Practice and related learning':'Explore this section'}"><ul>${p.links.map(l=>`<li>${a(l.href,l.label)}</li>`).join('')}</ul></nav>
 </section>`
}
