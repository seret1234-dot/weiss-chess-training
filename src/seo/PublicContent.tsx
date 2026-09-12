import { useLocation } from 'react-router-dom'
import { publicPages } from './publicPages'
import { renderPublicContent } from './renderPublicContent'
import './publicContent.css'
import NotFoundPage from '../NotFoundPage'

/** The same public text is rendered at build time and after the app mounts.
 * No account state, API calls or trainer configuration enter this component. */
export default function PublicContent({ educational = false }: { educational?: boolean }) {
 const { pathname } = useLocation()
 const page=publicPages[pathname]
 if (!page) return educational ? <NotFoundPage /> : null
 if (Boolean(page.standalone)!==educational) return null
 return <div dangerouslySetInnerHTML={{__html:renderPublicContent(pathname,educational)}} />
}
