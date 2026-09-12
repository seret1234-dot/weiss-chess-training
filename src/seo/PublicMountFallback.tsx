import {publicShellMarkup} from './publicShellSnapshot'

/** Keep the public presentation visible during existing auth/lazy initialization.
 * No auth gates, navigation timing or private-route fallbacks are changed. */
export default function PublicMountFallback({pageOnly=false,contentOnly=false}:{pageOnly?:boolean;contentOnly?:boolean}){
 const html=publicShellMarkup(pageOnly,contentOnly)
 return html?<div style={{display:'contents'}} dangerouslySetInnerHTML={{__html:html}} />:
 pageOnly?<p role="status">Loading training…</p>:<div style={{color:'#fff',padding:20}}>Loading...</div>
}
