import OpeningExplanationOverlay from "./pages/openings/OpeningExplanationOverlay"
import EndgameExplanationOverlay from "./pages/endgames/EndgameExplanationOverlay"
import CoachMistakeOverlay from "./components/coach/CoachMistakeOverlay"
import React from "react"
import ReactDOM from "react-dom/client"
import AppRouter from "./AppRouter"

ReactDOM.createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
 <>
 <AppRouter />
 <EndgameExplanationOverlay />
 <OpeningExplanationOverlay />
 <CoachMistakeOverlay />
 </>
 </React.StrictMode>
)