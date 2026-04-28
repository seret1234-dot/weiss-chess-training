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
import AnastasiaMatePage from "./AnastasiaMatePage"
import AnastasiaMateIn2Page from "./AnastasiaMateIn2Page"
import BNMateTrainer from "./BNMateTrainer"
import TwoBishopsFinalTrainer from "./TwoBishopsFinalTrainer"
import K2RooksTrainer from "./K2RooksTrainer"
import KQKTrainer from "./KQKTrainer"
import KRKTrainer from "./KRKTrainer"
import KQKRTrainer from "./KQKRTrainer"

// ✅ NEW
import KQKRTrainerPage from "./pages/KQKRTrainerPage"

import AuthPage from "./AuthPage"
import MasterGamesPage from "./MasterGamesPage"
import MasterGamesLibraryPage from "./MasterGamesLibraryPage"

import OpeningTrainerPage from "./OpeningTrainerPage"
import OpeningsLibraryPage from "./OpeningsLibraryPage"
import OpeningFamilyPage from "./OpeningFamilyPage"

import BoardVisionPage from "./BoardVisionPage"
import PlayComputerPage from "./pages/PlayComputerPage"
import AutoStudyPage from "./pages/AutoStudyPage"
import OnboardingPage from "./pages/OnboardingPage"

import AccountPage from "./AccountPage"

import GlobalFloatingPlay from "./components/GlobalFloatingPlay"
import { BoardUiProvider } from "./context/BoardUiContext"

import AnastasiaMateIn1PatternPage from "./pages/pattern/AnastasiaMateIn1PatternPage"

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
          <Route path="/" element={<LandingPage onSelectCategory={() => {}} />} />

          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/auto" element={<AutoStudyPage user={user} />} />

          <Route path="/mates" element={<MatesPage />} />
          <Route path="/mates/:level" element={<MateDistancePage />} />
          <Route path="/mates/m1/back-rank" element={<BackRankPage />} />
          <Route path="/mates/m1/anastasia" element={<AnastasiaMatePage />} />
          <Route path="/mates/m2/anastasia" element={<AnastasiaMateIn2Page />} />

          <Route
            path="/pattern/anastasia/mate-in-1"
            element={<AnastasiaMateIn1PatternPage />}
          />

          <Route path="/tactics" element={<NavGridPage />} />
          <Route path="/board-vision" element={<BoardVisionPage />} />

          <Route path="/master-games" element={<MasterGamesLibraryPage />} />

          <Route path="/openings" element={<OpeningsLibraryPage />} />
          <Route path="/openings/family/:familySlug" element={<OpeningFamilyPage />} />
          <Route path="/openings/:openingId" element={<OpeningTrainerPage />} />

          <Route path="/book-trainer" element={<NavGridPage />} />
          <Route path="/play-computer" element={<PlayComputerPage />} />

          <Route path="/tactics/:theme" element={<NavGridPage />} />
          <Route path="/board-vision/:theme" element={<BoardVisionPage />} />
          <Route path="/book-trainer/:theme" element={<NavGridPage />} />
          <Route path="/play-computer/:theme" element={<PlayComputerPage />} />

          <Route path="/master-games/:gameId" element={<MasterGamesPage />} />

          <Route path="/backrank" element={<BackRankPage />} />
          <Route path="/anastasia" element={<AnastasiaMatePage />} />
          <Route path="/anastasia-m2" element={<AnastasiaMateIn2Page />} />

          <Route path="/endgame" element={<EndgamePage />} />
          <Route path="/endgame/piece-mates" element={<PieceMatesPage />} />
          <Route path="/endgame/piece-mates/bn" element={<BNMateTrainer />} />
          <Route path="/endgame/piece-mates/two-bishops" element={<TwoBishopsFinalTrainer />} />
          <Route path="/endgame/piece-mates/k2r" element={<K2RooksTrainer />} />
          <Route path="/endgame/piece-mates/kqk" element={<KQKTrainer />} />
          <Route path="/endgame/piece-mates/krk" element={<KRKTrainer />} />

          <Route path="/endgame-studies" element={<EndgameStudiesPage />} />

          {/* ✅ KQKR routes */}
          <Route path="/endgame-studies/kqkr" element={<KQKRTrainer />} />
          <Route path="/endgame-studies/kqkr/:group" element={<KQKRTrainerPage />} />

          <Route path="/endgame-studies/kqkp7" element={<div>KQ vs KP7 coming soon</div>} />
          <Route path="/endgame-studies/knnkp" element={<div>KNN vs KP coming soon</div>} />
          <Route path="/endgame-studies/kpk" element={<div>KPK coming soon</div>} />
          <Route path="/endgame-studies/zugzwang" element={<div>Zugzwang coming soon</div>} />
          <Route path="/endgame-studies/pawns" element={<div>Pawn Endgames coming soon</div>} />

          <Route path="/endgame/strategy" element={<NavGridPage />} />

          <Route path="/board-vision-old" element={<BoardVisionPage />} />
          <Route path="/master-games-old" element={<MasterGamesLibraryPage />} />
          <Route path="/play-vs-computer" element={<PlayComputerPage />} />
        </Routes>
      </BoardUiProvider>
    </BrowserRouter>
  )
}