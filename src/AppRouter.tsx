import StalemateUnderpromotionPage from './pages/StalemateUnderpromotionPage';
import { useEffect, useState } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { supabase } from "./lib/supabase"

import LandingPage from "./LandingPage"
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
import BNMateTrainer from "./BNMateTrainer"
import TwoBishopsFinalTrainer from "./TwoBishopsFinalTrainer"
import K2RooksTrainer from "./K2RooksTrainer"
import KQKTrainer from "./KQKTrainer"
import KRKTrainer from "./KRKTrainer"
import KQKRTrainer from "./KQKRTrainer"

import KQKRTrainerPage from "./pages/KQKRTrainerPage"
import KQKP7Trainer from "./KQKP7Trainer"
import KRKPTrainer from "./pages/endgames/KRKPTrainer"
import KNNKPForcedMateTrainer from "./pages/endgames/KNNKPForcedMateTrainer"
import KPKTrainer from "./pages/endgames/KPKTrainer"
import StalemateTrainer from "./pages/endgames/StalemateTrainer"
import LucenaTrainer from "./pages/endgames/LucenaTrainer"
import PhilidorTrainer from "./pages/endgames/PhilidorTrainer"
import PawnRacesTrainer from "./pages/endgames/PawnRacesTrainer"
import ZugzwangTrainer from "./pages/endgames/ZugzwangTrainer"
import ShoulderingTrainer from "./pages/endgames/ShoulderingTrainer"
import FortressTrainer from "./pages/endgames/FortressTrainer"

import AuthPage from "./AuthPage"
import MasterGamesPage from "./MasterGamesPage"
import MasterGamesLibraryPage from "./MasterGamesLibraryPage"

import OpeningTrainerPage from "./OpeningTrainerPage"
import OpeningsLibraryPage from "./OpeningsLibraryPage"
import OpeningFamilyPage from "./OpeningFamilyPage"

import BoardVisionPage from "./BoardVisionPage"
import PlayComputerPage from "./pages/PlayComputerPage"
import AnalyzePage from "./pages/analyze/AnalyzePage"
import MuseumPage from "./pages/MuseumPage"
import AutoStudyPage from "./pages/AutoStudyPage"
import OnboardingPage from "./pages/OnboardingPage"

import AccountPage from "./AccountPage"

import GlobalFloatingPlay from "./components/GlobalFloatingPlay"
import { BoardUiProvider } from "./context/BoardUiContext"

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
import KillBoxMateIn1Page from "./KillBoxMateIn1Page"
import KillBoxMateIn2Page from "./KillBoxMateIn2Page"
import KillBoxMateIn3Page from "./KillBoxMateIn3Page"
import KillBoxMateIn4Page from "./KillBoxMateIn4Page"
import KillBoxMateIn5Page from "./KillBoxMateIn5Page"
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
import AnalyzeBoardPage from "./pages/analyze/AnalyzeBoardPage";
import SetupPositionPage from "./pages/analyze/SetupPositionPage";
import AnalyzeReviewPage from "./pages/analyze/AnalyzeReviewPage";
import ImageToPositionPage from "./pages/analyze/ImageToPositionPage";

export default function AppRouter() {
 const [user, setUser] = useState<any>(null)
 const [authReady, setAuthReady] = useState(false)

 useEffect(() => {
 let cancelled = false

 const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
 if (cancelled) return
 setUser(session?.user ?? null)
 setAuthReady(true)
 })

 supabase.auth.getSession().then(({ data }) => {
 if (cancelled) return
 setUser(data.session?.user ?? null)
 setAuthReady(true)
 })

 return () => {
 cancelled = true
 listener.subscription.unsubscribe()
 }
 }, [])

 if (!authReady) {
 return <div style={{ color: "#fff", padding: 20 }}>Loading...</div>
 }

 return (
 <BrowserRouter>
 <BoardUiProvider>
 <GlobalFloatingPlay />

 <Routes>
 <Route path="/stalemate/underpromotion" element={<StalemateUnderpromotionPage />} />
 <Route path="/" element={<LandingPage onSelectCategory={() => {}} />} />

 <Route path="/auth" element={<AuthPage />} />
 <Route path="/account" element={<AccountPage />} />
 <Route path="/onboarding" element={<OnboardingPage />} />
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
 <Route path="/master-games/:gameId" element={<MasterGamesPage />} />

 <Route path="/openings" element={<OpeningsLibraryPage />} />
 <Route path="/openings/family/:familySlug" element={<OpeningFamilyPage />} />
 <Route path="/openings/:openingId" element={<OpeningTrainerPage />} />

 <Route path="/book-trainer" element={<NavGridPage />} />
 <Route path="/play-computer" element={<PlayComputerPage />} />
 <Route path="/analyze" element={<AnalyzePage />} />
 <Route path="/analyze/board" element={<AnalyzeBoardPage />} />
 <Route path="/analyze/setup" element={<SetupPositionPage />} />
 <Route path="/analyze/review" element={<AnalyzeReviewPage />} />
 <Route path="/analyze/image" element={<ImageToPositionPage />} />
 <Route path="/museum" element={<MuseumPage />} />
 <Route path="/board-vision/:theme" element={<BoardVisionPage />} />
 <Route path="/book-trainer/:theme" element={<NavGridPage />} />
 <Route path="/play-computer/:theme" element={<PlayComputerPage />} />

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
 element={<KNNKPForcedMateTrainer />}
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
 <Route path="/endgame-studies/shouldering" element={<div>Shouldering coming soon</div>} />

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
 <Route path="/mates/m1/kill-box" element={<KillBoxMateIn1Page />} />
 <Route path="/mates/m2/kill-box" element={<KillBoxMateIn2Page />} />
 <Route path="/mates/m3/kill-box" element={<KillBoxMateIn3Page />} />
 <Route path="/mates/m4/kill-box" element={<KillBoxMateIn4Page />} />
 <Route path="/mates/m5/kill-box" element={<KillBoxMateIn5Page />} />
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
 </Routes>
 </BoardUiProvider>
 </BrowserRouter>
 )
}




















