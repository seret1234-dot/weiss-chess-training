import OpeningExplanationOverlay from "./pages/openings/OpeningExplanationOverlay"
import CoachMistakeOverlay from "./components/coach/CoachMistakeOverlay"
import React from "react"
import ReactDOM from "react-dom/client"
import AppRouter from "./AppRouter"
import SeoHead from "./components/SeoHead"
import SiteAnalytics from "./components/SiteAnalytics"
import { initializeGa4 } from "./analytics/ga4"
import { ThemeProvider } from "./theme/ThemeContext"
import { TimedMasteryProvider } from "./accessibility/TimedMasteryContext"
import "./theme/theme.css"

initializeGa4()
ReactDOM.createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
 <ThemeProvider>
 <TimedMasteryProvider>
 <>
 <SeoHead />
 <SiteAnalytics />
 <AppRouter />
 <OpeningExplanationOverlay />
 <CoachMistakeOverlay />
 </>
 </TimedMasteryProvider>
 </ThemeProvider>
 </React.StrictMode>
)
