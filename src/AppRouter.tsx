import { BrowserRouter, Routes, Route } from "react-router-dom"

import LandingPage from "./LandingPage"
import MatesPage from "./MatesPage"
import EndgamePage from "./EndgamePage"
import PieceMatesPage from "./PieceMatesPage"
import BackRankPage from "./BackRankPage"
import AnastasiaMatePage from "./AnastasiaMatePage"
import BNMateTrainer from "./BNMateTrainer"
import TwoBishopsFinalTrainer from "./TwoBishopsFinalTrainer"
import K2RooksTrainer from "./K2RooksTrainer"
import KQKTrainer from "./KQKTrainer"
import AuthPage from "./AuthPage"
import MasterGamesPage from "./MasterGamesPage"
import MasterGamesLibraryPage from "./MasterGamesLibraryPage"
import BoardVisionPage from "./BoardVisionPage"
import PlayComputerPage from "./pages/PlayComputerPage"
import GlobalFloatingPlay from "./components/GlobalFloatingPlay"
import { BoardUiProvider } from "./context/BoardUiContext"

export default function AppRouter() {
  return (
    <BrowserRouter>
      <BoardUiProvider>
        <GlobalFloatingPlay />

        <Routes>
          {/* Home */}
          <Route path="/" element={<LandingPage onSelectCategory={() => {}} />} />

          {/* Auth */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Mate trainers */}
          <Route path="/mates" element={<MatesPage />} />
          <Route path="/backrank" element={<BackRankPage />} />
          <Route path="/anastasia" element={<AnastasiaMatePage />} />

          {/* Endgames */}
          <Route path="/endgame" element={<EndgamePage />} />
          <Route path="/endgame/piece-mates" element={<PieceMatesPage />} />
          <Route path="/endgame/piece-mates/bn" element={<BNMateTrainer />} />
          <Route
            path="/endgame/piece-mates/two-bishops"
            element={<TwoBishopsFinalTrainer />}
          />
          <Route path="/endgame/piece-mates/k2r" element={<K2RooksTrainer />} />
          <Route path="/endgame/piece-mates/kqk" element={<KQKTrainer />} />

          {/* Vision */}
          <Route path="/board-vision" element={<BoardVisionPage />} />

          {/* Master games */}
          <Route path="/master-games" element={<MasterGamesLibraryPage />} />
          <Route path="/master-games/:gameId" element={<MasterGamesPage />} />

          {/* Play computer */}
          <Route path="/play-vs-computer" element={<PlayComputerPage />} />
        </Routes>
      </BoardUiProvider>
    </BrowserRouter>
  )
}