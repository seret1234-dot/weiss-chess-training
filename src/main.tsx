import OpeningExplanationOverlay from "./pages/openings/OpeningExplanationOverlay"
import CoachMistakeOverlay from "./components/coach/CoachMistakeOverlay"
import React from "react"
import ReactDOM from "react-dom/client"
import AppRouter from "./AppRouter"
import SeoHead from "./components/SeoHead"
import SiteAnalytics from "./components/SiteAnalytics"
import { ThemeProvider } from "./theme/ThemeContext"
import "./theme/theme.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
 <ThemeProvider>
 <>
 <SeoHead />
 <SiteAnalytics />
 <AppRouter />
 <OpeningExplanationOverlay />
 <CoachMistakeOverlay />
 </>
 </ThemeProvider>
 </React.StrictMode>
)
