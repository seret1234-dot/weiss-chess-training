const StalemateUnderpromotionPage = lazy(() => import('./pages/StalemateUnderpromotionPage'))
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom"
import { supabase } from "./lib/supabase"
import AccountSessionBoundary from './auth/AccountSessionBoundary'
import { TimedMasteryProvider } from './accessibility/TimedMasteryContext'
import { AccountIdentityContext } from './auth/AccountIdentityContext'

import LandingPage from "./LandingPage"
const IntroductionPage = lazy(() => import('./pages/IntroductionPage'))
import { DemoAutoEntry, DemoAutoLocationTracker, DemoManualPractice } from './demo/AutoEntryDemo'
import { autoEntryEnabled } from './training/autoEntryEnabled'
import PublicMountFallback from './seo/PublicMountFallback'
import {publicShellMarkup} from './seo/publicShellSnapshot'
const SampleTrainingPage = lazy(() => import("./SampleTrainingPage"))
import MatesPage from "./MatesPage"
import MateDistancePage from "./MateDistancePage"
import NavGridPage from "./NavGridPage"

import EndgamePage from "./EndgamePage"
import EndgameStudiesPage from "./EndgameStudiesPage"
import PieceMatesPage from "./PieceMatesPage"
import BackRankPage from "./BackRankPage"
import BackRankMateIn2Page from "./BackRankMateIn2Page"
import BackRankMateIn3Page from "./BackRankMateIn3Page"
import BackRankMateIn4Page from "./BackRankMateIn4Page"
import BackRankMateIn5Page from "./BackRankMateIn5Page"
import ArabianMateIn1Page from "./ArabianMateIn1Page"
import ArabianMateIn2Page from "./ArabianMateIn2Page"
import ArabianMateIn3Page from "./ArabianMateIn3Page"
import ArabianMateIn4Page from "./ArabianMateIn4Page"
import ArabianMateIn5Page from "./ArabianMateIn5Page"
import BodenMateIn1Page from "./BodenMateIn1Page"
import BodenMateIn2Page from "./BodenMateIn2Page"
import BodenMateIn3Page from "./BodenMateIn3Page"
import AnastasiaMatePage from "./AnastasiaMatePage"
import AnastasiaMateIn2Page from "./AnastasiaMateIn2Page"
import AnastasiaMateIn3Page from "./AnastasiaMateIn3Page"
import AnastasiaMateIn4Page from "./AnastasiaMateIn4Page"
import AnastasiaMateIn5Page from "./AnastasiaMateIn5Page"
const BNMateTrainer = lazy(() => import("./BNMateTrainer"))
const TwoBishopsFinalTrainer = lazy(() => import("./TwoBishopsFinalTrainer"))
const K2RooksTrainer = lazy(() => import("./K2RooksTrainer"))
const KQKTrainer = lazy(() => import("./KQKTrainer"))
const KRKTrainer = lazy(() => import("./KRKTrainer"))
const KQKRTrainer = lazy(() => import("./KQKRTrainer"))

const KQKRTrainerPage = lazy(() => import("./pages/KQKRTrainerPage"))
const KQKP7Trainer = lazy(() => import("./KQKP7Trainer"))
const KRKPTrainer = lazy(() => import("./pages/endgames/KRKPTrainer"))
const KNNKPTrainer = lazy(() => import("./pages/endgames/KNNKPTrainer"))
const KNNKPForcedMateTrainer = lazy(() => import("./pages/endgames/KNNKPForcedMateTrainer"))
const KPKTrainer = lazy(() => import("./pages/endgames/KPKTrainer"))
const StalemateTrainer = lazy(() => import("./pages/endgames/StalemateTrainer"))
const LucenaTrainer = lazy(() => import("./pages/endgames/LucenaTrainer"))
const PhilidorTrainer = lazy(() => import("./pages/endgames/PhilidorTrainer"))
const PawnRacesTrainer = lazy(() => import("./pages/endgames/PawnRacesTrainer"))
const ZugzwangTrainer = lazy(() => import("./pages/endgames/ZugzwangTrainer"))
const ShoulderingTrainer = lazy(() => import("./pages/endgames/ShoulderingTrainer"))
const FortressTrainer = lazy(() => import("./pages/endgames/FortressTrainer"))

import AuthPage from "./AuthPage"
import AffiliateTracking from './affiliate/AffiliateTracking'
import { AffiliatePage, AffiliateTerms, AffiliateDashboard, AffiliateAdmin } from './affiliate/AffiliatePages'
import ReleaseManifestPage from './release/ReleaseManifestPage'
import ResetPasswordPage from "./ResetPasswordPage"
const MasterGamesPage = lazy(() => import("./MasterGamesPage"))
import MasterGamesLibraryPage from "./MasterGamesLibraryPage"
import MyMasterGamesLibraryPage from "./masterGames/MyMasterGamesLibraryPage"
import MasterGamesLibraryPracticePage from "./masterGames/MasterGamesLibraryPracticePage"

const OpeningTrainerPage = lazy(() => import("./OpeningTrainerPage"))
const FreeLinePlayPage = lazy(() => import("./FreeLinePlayPage"))
import OpeningsLibraryPage from "./OpeningsLibraryPage"
import OpeningFamilyPage from "./OpeningFamilyPage"
import MyOpeningsPage from "./openings/MyOpeningsPage"
import MyOpeningsPracticePage from "./openings/MyOpeningsPracticePage"

import BoardVisionPage from "./BoardVisionPage"
const PlayComputerPage = lazy(() => import("./pages/PlayComputerPage"))
import AnalyzePage from "./pages/analyze/AnalyzePage"
import MuseumPage from "./pages/MuseumPage"
const AutoStudyPage = lazy(() => import("./pages/AutoStudyPage"))
import OnboardingPage from "./pages/OnboardingPage"

const AccountPage = lazy(() => import("./AccountPage"))
import PricingPage from "./PricingPage"

import GlobalBackButton from "./components/GlobalBackButton"
import GlobalFloatingPlay from "./components/GlobalFloatingPlay"
import AutoTrainingController from "./components/AutoTrainingController"
import { BoardUiProvider } from "./context/BoardUiContext"
import { SubscriptionProvider } from "./context/SubscriptionContext"
import { HintActionProvider } from "./context/HintActionContext"
import { AutoAllowanceBoundary } from "./training/AutoAllowanceBoundary"
import { BackgroundAnalysisProvider } from "./context/BackgroundAnalysisContext"
import BackgroundAnalysisStatus from "./components/BackgroundAnalysisStatus"
import { AccessibilityPage, PrivacyPage } from "./compliance/LegalPages"
import { ComplianceFooter, SkipToContent } from "./compliance/ComplianceChrome"

import AnastasiaMateIn1PatternPage from "./pages/pattern/AnastasiaMateIn1PatternPage"
import SmotheredMateIn1Page from "./SmotheredMateIn1Page"
import SmotheredMateIn2Page from "./SmotheredMateIn2Page"
import SmotheredMateIn3Page from "./SmotheredMateIn3Page"
import SmotheredMateIn4Page from "./SmotheredMateIn4Page"
import HookMateIn1Page from "./HookMateIn1Page"
import HookMateIn2Page from "./HookMateIn2Page"
import HookMateIn3Page from "./HookMateIn3Page"
import HookMateIn4Page from "./HookMateIn4Page"
import HookMateIn5Page from "./HookMateIn5Page"
import KillBoxSubtypePage from "./KillBoxSubtypePage"
import DovetailMateIn1Page from "./DovetailMateIn1Page"
import DovetailMateIn2Page from "./DovetailMateIn2Page"
import DovetailMateIn3Page from "./DovetailMateIn3Page"
import DovetailMateIn4Page from "./DovetailMateIn4Page"
import DovetailMateIn5Page from "./DovetailMateIn5Page"
import DoubleBishopMateIn1Page from "./DoubleBishopMateIn1Page"
import DoubleBishopMateIn2Page from "./DoubleBishopMateIn2Page"
import DoubleBishopMateIn3Page from "./DoubleBishopMateIn3Page"
import MixedMateIn1Page from "./MixedMateIn1Page"
import MixedMateIn2Page from "./MixedMateIn2Page"
import MixedMateIn3Page from "./MixedMateIn3Page"
import MixedMateIn4Page from "./MixedMateIn4Page"
import MixedMateIn5Page from "./MixedMateIn5Page"
import TacticsPage from "./TacticsPage"
import TacticDistancePage from "./TacticDistancePage"
import TacticTrainerRoutePage from "./TacticTrainerRoutePage"
const MasterTacticsPage = lazy(() => import('./masterTactics/MasterTacticsPage'))
const MasterMatesPage = lazy(() => import('./masterMates/MasterMatesPage'))
const AnalyzeBoardPage = lazy(() => import("./pages/analyze/AnalyzeBoardPage"))
const SetupPositionPage = lazy(() => import("./pages/analyze/SetupPositionPage"))
const AnalyzeReviewPage = lazy(() => import("./pages/analyze/AnalyzeReviewPage"))
const ImageToPositionPage = lazy(() => import("./pages/analyze/ImageToPositionPage"))
import EndgameExplanationOverlay from "./pages/endgames/EndgameExplanationOverlay"
import NotFoundPage from "./NotFoundPage"
import PublicContent from './seo/PublicContent'

function EndgameTrainerHelpOverlay() {
 const { pathname } = useLocation()
 const isEndgameTrainer =
  /^\/endgame\/piece-mates\/[^/]+$/.test(pathname) ||
  /^\/endgame-studies\/[^/]+(?:\/[^/]+)?$/.test(pathname)

 return isEndgameTrainer ? (
  <EndgameExplanationOverlay key={pathname} routePath={pathname} />
 ) : null
}

function LegacyThemeRedirect({ to }: { to: string }) {
 const location = useLocation()

 return <>
  {location.pathname === '/endgames' && to === '/endgame' && publicShellMarkup(false,true) ? <PublicMountFallback contentOnly /> : null}
  <Navigate replace to={`${to}${location.search}${location.hash}`} />
 </>
}

function SiteMainContent({ children }: { children: React.ReactNode }) {
 const { pathname } = useLocation()
 const isFullScreenWorkspace = pathname.startsWith("/analyze/") || pathname === "/play-computer" || pathname === "/play-vs-computer"

 return (
  <div
   id="site-main-content"
   role="main"
   tabIndex={-1}
   style={isFullScreenWorkspace ? { height: "100dvh", overflow: "hidden", display: "flow-root" } : { display: "flow-root" }}
  >
   {children}
  </div>
 )
}

export default function AppRouter() {
 const [user, setUser] = useState<any>(null)
 const [authReady, setAuthReady] = useState(false)
 const authStateRevisionRef = useRef(0)
 const handleSignedOut = useCallback(() => {
  authStateRevisionRef.current += 1
  setUser(null)
  setAuthReady(true)
 }, [])

 useEffect(() => {
    const authQueryParams = new URLSearchParams(window.location.search)
    const authHashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    )

    const hasAuthRedirectError = Boolean(
      authQueryParams.get("error") ||
      authQueryParams.get("error_code") ||
      authHashParams.get("error") ||
      authHashParams.get("error_code")
    )

    if (hasAuthRedirectError && window.location.pathname !== "/auth") {
      window.location.replace(
        `/auth${window.location.search}${window.location.hash}`
      )
      return
    }

    let cancelled = false

 const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
 if (cancelled) return
 authStateRevisionRef.current += 1
 setUser(session?.user ?? null)
 setAuthReady(true)
 })

 const initialRevision = authStateRevisionRef.current
 supabase.auth.getSession().then(({ data }) => {
 if (cancelled || authStateRevisionRef.current !== initialRevision) return
 setUser(data.session?.user ?? null)
 setAuthReady(true)
 })

 return () => {
 cancelled = true
 listener.subscription.unsubscribe()
 }
 }, [])

 if (!authReady) {
 return <PublicMountFallback />
 }

 return (
 <BrowserRouter>
 <AccountSessionBoundary userId={user?.id ?? null}>
 <AffiliateTracking />
 <SkipToContent />
 <HintActionProvider>
 <BoardUiProvider>
  <SubscriptionProvider key={user?.id ?? "guest"} user={user}>
  <AccountIdentityContext.Provider value={user?.id ?? null}>
  <TimedMasteryProvider>
  <BackgroundAnalysisProvider user={user}>
 <BackgroundAnalysisStatus />
 <GlobalBackButton />
 <GlobalFloatingPlay
  isLoggedIn={!!user}
  accountUser={user}
  onSignedOut={handleSignedOut}
 />
 <EndgameTrainerHelpOverlay />
 <AutoTrainingController user={user} />
 {autoEntryEnabled && <DemoAutoLocationTracker userId={user?.id} />}

 <SiteMainContent>
 <AutoAllowanceBoundary key={user?.id ?? "guest"}>
 <Suspense fallback={<PublicMountFallback pageOnly />}>
 <Routes>
 <Route path="/checkmate-patterns/*" element={<PublicContent educational />} />
 <Route path="/chess-tactics/*" element={<PublicContent educational />} />
 <Route path="/chess-guides/*" element={<PublicContent educational />} />
 <Route path="/endgame-guides/*" element={<PublicContent educational />} />
 <Route path="/endgames" element={<LegacyThemeRedirect to="/endgame" />} />
 <Route path="/stalemate/underpromotion" element={<StalemateUnderpromotionPage />} />
 <Route path="/" element={autoEntryEnabled && user ? <DemoAutoEntry userId={user.id} /> : <LandingPage onSelectCategory={() => {}} />} />
 {autoEntryEnabled && <>
  <Route path="/home" element={<LandingPage demoHome />} />
  <Route path="/manual" element={<DemoManualPractice signedIn={!!user} />} />
  <Route path="/demo-auto" element={<DemoAutoEntry userId={user?.id} />} />
 </>}
 <Route path="/sample-training" element={<SampleTrainingPage />} />

 <Route path="/auth" element={<AuthPage />} />
  <Route path="/reset-password" element={<ResetPasswordPage />} />
 <Route path="/account" element={<AccountPage />} />
 <Route path="/affiliate" element={<AffiliatePage />} />
 <Route path="/affiliate/terms" element={<AffiliateTerms />} />
 <Route path="/affiliate/dashboard" element={<AffiliateDashboard />} />
 <Route path="/admin/affiliates" element={<AffiliateAdmin />} />
 <Route path="/admin/release" element={user ? <ReleaseManifestPage /> : <Navigate to="/auth" replace />} />
 <Route path="/r/:code" element={<p>Opening Weiss Chess…</p>} />
  <Route path="/pricing" element={<PricingPage />} />
 <Route path="/onboarding" element={<OnboardingPage />} />
 <Route path="/onboarding/introduction" element={<IntroductionPage />} />
 <Route path="/auto" element={<AutoStudyPage user={user} />} />

 <Route path="/mates" element={<MatesPage />} />
 <Route path="/mates/m6" element={<MatesPage />} />
 <Route path="/mates/m7" element={<MatesPage />} />
 <Route path="/mates/m8" element={<MatesPage />} />
 <Route path="/mates/:level" element={<MateDistancePage />} />
 <Route path="/mates/m1/back-rank" element={<BackRankPage />} />
 <Route path="/mates/m1/arabian" element={<ArabianMateIn1Page />} />
 <Route path="/mates/m1/boden" element={<BodenMateIn1Page />} />
 <Route path="/mates/m2/arabian" element={<ArabianMateIn2Page />} />
 <Route path="/mates/m2/boden" element={<BodenMateIn2Page />} />
 <Route path="/mates/m3/boden" element={<BodenMateIn3Page />} />
 <Route path="/mates/m3/arabian" element={<ArabianMateIn3Page />} />
 <Route path="/mates/m4/arabian" element={<ArabianMateIn4Page />} />
 <Route path="/mates/m5/arabian" element={<ArabianMateIn5Page />} />
 <Route path="/mates/m2/back-rank" element={<BackRankMateIn2Page />} />
 <Route path="/mates/m3/back-rank" element={<BackRankMateIn3Page />} />
 <Route path="/mates/m4/back-rank" element={<BackRankMateIn4Page />} />
 <Route path="/mates/m5/back-rank" element={<BackRankMateIn5Page />} />
 <Route path="/mates/m1/anastasia" element={<AnastasiaMatePage />} />
 <Route path="/mates/m2/anastasia" element={<AnastasiaMateIn2Page />} />
 <Route path="/mates/m3/anastasia" element={<AnastasiaMateIn3Page />} />
 <Route path="/mates/m4/anastasia" element={<AnastasiaMateIn4Page />} />
 <Route path="/mates/m5/anastasia" element={<AnastasiaMateIn5Page />} />

 <Route
 path="/pattern/anastasia/mate-in-1"
 element={<AnastasiaMateIn1PatternPage />}

 />

 <Route path="/pattern/anastasia/mate-in-3" element={<AnastasiaMateIn3Page />} />
 <Route path="/pattern/anastasia/mate-in-4" element={<AnastasiaMateIn4Page />} />
 <Route path="/pattern/anastasia/mate-in-5" element={<AnastasiaMateIn5Page />} />
 <Route path="/board-vision" element={<BoardVisionPage />} />

 <Route path="/master-games" element={<MasterGamesLibraryPage />} />
 <Route path="/master-games/my-library" element={<MyMasterGamesLibraryPage />} />
 <Route path="/master-games/my-library/practice" element={<MasterGamesLibraryPracticePage />} />
 <Route path="/master-games/:gameId" element={<MasterGamesPage />} />

 <Route path="/openings" element={<OpeningsLibraryPage />} />
 <Route path="/openings/family/:familySlug" element={<OpeningFamilyPage />} />
 <Route path="/openings/my-openings" element={<MyOpeningsPage />} />
 <Route path="/openings/my-openings/practice" element={<MyOpeningsPracticePage />} />
 <Route path="/free-play/:kind/:itemId" element={<FreeLinePlayPage />} />
 <Route path="/openings/:openingId" element={<OpeningTrainerPage />} />

 <Route path="/book-trainer" element={<NavGridPage />} />
 <Route path="/play-computer" element={<PlayComputerPage />} />
 <Route path="/analyze" element={<AnalyzePage />} />
 <Route path="/analyze/board" element={<AnalyzeBoardPage />} />
 <Route path="/analyze/setup" element={<SetupPositionPage />} />
 <Route path="/analyze/review" element={<AnalyzeReviewPage />} />
 <Route path="/analyze/image" element={<ImageToPositionPage />} />
 <Route path="/museum" element={<MuseumPage />} />
 <Route path="/board-vision/:theme" element={<LegacyThemeRedirect to="/board-vision" />} />
 <Route path="/book-trainer/:theme" element={<LegacyThemeRedirect to="/book-trainer" />} />
 <Route path="/play-computer/:theme" element={<LegacyThemeRedirect to="/play-computer" />} />

 <Route path="/backrank" element={<BackRankPage />} />
 <Route path="/anastasia" element={<AnastasiaMatePage />} />
 <Route path="/anastasia-m2" element={<AnastasiaMateIn2Page />} />
 <Route path="/anastasia-m3" element={<AnastasiaMateIn3Page />} />
 <Route path="/anastasia-m4" element={<AnastasiaMateIn4Page />} />
 <Route path="/anastasia-m5" element={<AnastasiaMateIn5Page />} />

 <Route path="/endgame" element={<EndgamePage />} />
 <Route path="/endgame/piece-mates" element={<PieceMatesPage />} />
 <Route path="/endgame/piece-mates/bn" element={<BNMateTrainer />} />
 <Route path="/endgame/piece-mates/two-bishops" element={<TwoBishopsFinalTrainer />} />
 <Route path="/endgame/piece-mates/k2r" element={<K2RooksTrainer />} />
 <Route path="/endgame/piece-mates/kqk" element={<KQKTrainer />} />
 <Route path="/endgame/piece-mates/krk" element={<KRKTrainer />} />

 <Route path="/endgame-studies" element={<EndgameStudiesPage />} />

 <Route path="/endgame-studies/kqkr" element={<KQKRTrainer />} />
 <Route path="/endgame-studies/kqkr/:group" element={<KQKRTrainerPage />} />
 <Route path="/endgame-studies/kqkp7" element={<KQKP7Trainer />} />
 <Route path="/endgame-studies/krkp" element={<KRKPTrainer />} />

 <Route
 path="/endgame-studies/knnkp"
 element={<KNNKPTrainer />}
 />

 <Route
 path="/endgame-studies/knnkp-forced"
 element={<KNNKPForcedMateTrainer />}
 />

 <Route
 path="/endgame-studies/kpk"
 element={<KPKTrainer />}
 />

 <Route
 path="/endgame-studies/stalemate"
 element={<StalemateTrainer />}
 />

 <Route path="/endgame-studies/lucena" element={<LucenaTrainer />} />
 <Route path="/endgame-studies/philidor" element={<PhilidorTrainer />} />
 <Route path="/endgame-studies/pawns" element={<PawnRacesTrainer />} />
 <Route path="/endgame-studies/zugzwang" element={<ZugzwangTrainer />} />
 <Route path="/endgame-studies/shouldering" element={<ShoulderingTrainer />} />
 <Route path="/endgame-studies/fortress" element={<FortressTrainer />} />
<Route path="/endgame/strategy" element={<NavGridPage />} />

 <Route path="/board-vision-old" element={<BoardVisionPage />} />
 <Route path="/master-games-old" element={<MasterGamesLibraryPage />} />
 <Route path="/play-vs-computer" element={<PlayComputerPage />} />
 <Route path="/mates/m1/smothered" element={<SmotheredMateIn1Page />} />
 <Route path="/mates/m2/smothered" element={<SmotheredMateIn2Page />} />
 <Route path="/mates/m3/smothered" element={<SmotheredMateIn3Page />} />
 <Route path="/mates/m4/smothered" element={<SmotheredMateIn4Page />} />
 <Route path="/mates/m1/hook" element={<HookMateIn1Page />} />
 <Route path="/mates/m2/hook" element={<HookMateIn2Page />} />
 <Route path="/mates/m3/hook" element={<HookMateIn3Page />} />
 <Route path="/mates/m4/hook" element={<HookMateIn4Page />} />
 <Route path="/mates/m5/hook" element={<HookMateIn5Page />} />
 <Route path="/mates/:level/kill-box" element={<KillBoxSubtypePage />} />
 <Route path="/mates/:level/:subpattern" element={<KillBoxSubtypePage />} />
 <Route path="/mates/m1/dovetail" element={<DovetailMateIn1Page />} />
 <Route path="/mates/m2/dovetail" element={<DovetailMateIn2Page />} />
 <Route path="/mates/m3/dovetail" element={<DovetailMateIn3Page />} />
 <Route path="/mates/m4/dovetail" element={<DovetailMateIn4Page />} />
 <Route path="/mates/m5/dovetail" element={<DovetailMateIn5Page />} />
 <Route path="/mates/m1/double-bishop" element={<DoubleBishopMateIn1Page />} />
 <Route path="/mates/m2/double-bishop" element={<DoubleBishopMateIn2Page />} />
 <Route path="/mates/m3/double-bishop" element={<DoubleBishopMateIn3Page />} />
 <Route path="/mates/m1/mixed" element={<MixedMateIn1Page />} />
 <Route path="/mates/m2/mixed" element={<MixedMateIn2Page />} />
 <Route path="/mates/m3/mixed" element={<MixedMateIn3Page />} />
 <Route path="/mates/m4/mixed" element={<MixedMateIn4Page />} />
 <Route path="/mates/m5/mixed" element={<MixedMateIn5Page />} />
 <Route path="/tactics" element={<TacticsPage />} />
 <Route path="/tactics/:level" element={<TacticDistancePage />} />
 <Route path="/tactics/:level/:theme" element={<TacticTrainerRoutePage />} />
 <Route path="/master-tactics" element={<MasterTacticsPage />} />
 <Route path="/master-tactics/:distance" element={<MasterTacticsPage />} />
 <Route path="/master-tactics/:distance/:theme" element={<MasterTacticsPage />} />
 <Route path="/master-mates" element={<MasterMatesPage />} />
 <Route path="/master-mates/:distance" element={<MasterMatesPage />} />
 <Route path="/master-mates/:distance/:theme" element={<MasterMatesPage />} />
 <Route path="/privacy" element={<PrivacyPage />} />
 <Route path="/privacy/he" element={<PrivacyPage hebrew />} />
 <Route path="/accessibility" element={<AccessibilityPage />} />
 <Route path="/accessibility/he" element={<AccessibilityPage hebrew />} />
 <Route path="*" element={<NotFoundPage />} />
 </Routes>
 </Suspense>
 <PublicContent />
 </AutoAllowanceBoundary>
 </SiteMainContent>
 <ComplianceFooter />
 </BackgroundAnalysisProvider>
  </TimedMasteryProvider>
  </AccountIdentityContext.Provider>
   </SubscriptionProvider>
 </BoardUiProvider>
 </HintActionProvider>
 </AccountSessionBoundary>
 </BrowserRouter>
 )
}
