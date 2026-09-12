// Build-time public presentation only. renderToStaticMarkup never runs effects.
// These are the live page components, not copied SEO versions of their markup.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../LandingPage'
import MatesPage from '../MatesPage'
import TacticsPage from '../TacticsPage'
import EndgamePage from '../EndgamePage'
import PieceMatesPage from '../PieceMatesPage'
import EndgameStudiesPage from '../EndgameStudiesPage'
import OpeningsLibraryPage from '../OpeningsLibraryPage'
import MasterGamesLibraryPage from '../MasterGamesLibraryPage'
import BoardVisionPage from '../BoardVisionPage'
import PricingPage from '../PricingPage'
import MuseumPage from '../pages/MuseumPage'
import {AffiliatePage} from '../affiliate/AffiliatePages'
import {SubscriptionProvider} from '../context/SubscriptionContext'
import MasterMatesLanding from '../masterMates/MasterMatesLanding'
import MasterTacticsLanding from '../masterTactics/MasterTacticsLanding'
import { ThemeProvider } from '../theme/ThemeContext'
import {ComplianceFooter, SkipToContent} from '../compliance/ComplianceChrome'
import { renderPublicContent } from './renderPublicContent'

const views: Record<string, React.ComponentType> = {
 '/':LandingPage, '/mates':MatesPage, '/tactics':TacticsPage,
 '/endgame':EndgamePage, '/endgame/piece-mates':PieceMatesPage, '/endgame-studies':EndgameStudiesPage,
 '/openings':OpeningsLibraryPage, '/master-games':MasterGamesLibraryPage, '/board-vision':BoardVisionPage,
 '/pricing':PricingPage, '/affiliate':AffiliatePage, '/museum':MuseumPage,
}
export function renderPublicShell(path:string,catalog?:any){
 const Page=path==='/master-mates'?()=> <MasterMatesLanding catalog={catalog}/>:path==='/master-tactics'?()=> <MasterTacticsLanding catalog={catalog}/>:views[path]
 if(!Page)return null
 return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><ThemeProvider>
  <SkipToContent />
  <div id="site-main-content" role="main" tabIndex={-1} style={{display:'flow-root'}}>
   <div data-public-presentation=""><SubscriptionProvider user={null}><Page /></SubscriptionProvider></div>
   <div dangerouslySetInnerHTML={{__html:renderPublicContent(path,false)}} />
  </div>
  <ComplianceFooter />
 </ThemeProvider></MemoryRouter>)
}
