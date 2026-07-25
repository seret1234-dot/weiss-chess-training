import OpeningExplanationOverlay from "./pages/openings/OpeningExplanationOverlay"
import EndgameExplanationOverlay from "./pages/endgames/EndgameExplanationOverlay"
import CoachMistakeOverlay from "./components/coach/CoachMistakeOverlay"
import React from "react"
import ReactDOM from "react-dom/client"
import SeoHead from "./components/SeoHead"
import SiteAnalytics from "./components/SiteAnalytics"
import AppRouter from "./AppRouter"

ReactDOM.createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
 <>
 <AppRouter />
 <EndgameExplanationOverlay />
 <SeoHead />
 <SiteAnalytics />
 <OpeningExplanationOverlay />
 <CoachMistakeOverlay />
 </>
 </React.StrictMode>
)