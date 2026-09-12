import metadata from '../seo/routeMetadata.json'
import { publicPages } from '../seo/publicPages'

const staticRoutes = new Set([...Object.keys(metadata.routes), ...Object.keys(publicPages), '/home', '/manual'])
const areas = new Set(['mates','tactics','master-mates','master-tactics','endgame','endgames','endgame-studies','board-vision','openings','master-games','play-computer','play-vs-computer','free-play','analyze','account','auth','onboarding','introduction','auto','demo-auto','affiliate','admin','privacy','accessibility'])
export function analyticsPage(input: string) {
 let pathname = '/other'
 try { pathname = new URL(input, 'https://weisschess.com').pathname.replace(/\/+$/, '') || '/' } catch { /* generic page */ }
 // Only checked-in, static route names are sent verbatim. Dynamic slugs can
 // contain connected usernames, personal openings, game IDs or affiliate codes.
 const area = pathname.split('/')[1]
 const path = staticRoutes.has(pathname) ? pathname : areas.has(area) ? `/${area}/activity` : '/other'
 const title = path === '/' ? 'Weiss Chess' : `${path.split('/').filter(Boolean).map(x => x.replaceAll('-', ' ')).join(' / ')} | Weiss Chess`
 return {page_path:path, page_location:`https://weisschess.com${path}`, page_title:title}
}

export function analyticsProperties(properties: Record<string, unknown>) {
 const safe: Record<string, string | boolean> = {}
 if (typeof properties.confirmation_required === 'boolean') safe.confirmation_required = properties.confirmation_required
 if (['monthly','yearly'].includes(String(properties.billing_period))) safe.billing_period = String(properties.billing_period)
 if (areas.has(String(properties.training_area))) safe.training_area = String(properties.training_area)
 // Never forward arbitrary detail.kind or free-form text from completion events.
 if (['chunk','puzzle','opening','master-game','board-vision','endgame','training','unknown'].includes(String(properties.training_kind))) safe.training_kind = String(properties.training_kind)
 return safe
}
