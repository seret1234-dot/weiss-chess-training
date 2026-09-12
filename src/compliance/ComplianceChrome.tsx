import { Link, useLocation } from "react-router-dom"
import "./compliance.css"

export function SkipToContent() {
  return <a className="skip-to-content" href="#site-main-content">Skip to main content</a>
}

export function ComplianceFooter() {
  const { pathname } = useLocation()
  const isFullScreenWorkspace = pathname.startsWith("/analyze/") || pathname === "/play-computer" || pathname === "/play-vs-computer"
  if (isFullScreenWorkspace) return null

  return (
    <footer className="compliance-footer" aria-label="Legal and accessibility information">
      <nav aria-label="Legal">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/accessibility">Accessibility</Link>
      </nav>
      <span>© {new Date().getFullYear()} Weiss Chess</span>
    </footer>
  )
}
