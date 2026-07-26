import { Link } from "react-router-dom"

export default function NotFoundPage() {
 return (
  <main
   style={{
    width: "100%",
    maxWidth: "100%",
    minHeight: "100dvh",
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    padding:
     "calc(var(--site-global-back-clearance, 0px) + 24px) 16px calc(var(--site-fixed-bottom-clearance, 0px) + 24px)",
   }}
  >
   <section
    style={{
     width: "100%",
     maxWidth: 560,
     boxSizing: "border-box",
     padding: 24,
     border: "1px solid var(--theme-border)",
     borderRadius: 16,
     background: "var(--theme-panel)",
     color: "var(--theme-text)",
     boxShadow: "0 12px 30px rgba(0, 0, 0, 0.24)",
     textAlign: "center",
    }}
   >
    <h1 style={{ margin: "0 0 12px", fontSize: "clamp(1.8rem, 8vw, 2.5rem)" }}>
     Page not found
    </h1>
    <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
     The page you requested does not exist or may have moved.
    </p>
    <Link
     to="/"
     style={{
      display: "inline-flex",
      minHeight: 44,
      boxSizing: "border-box",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 16px",
      border: "1px solid var(--theme-border)",
      borderRadius: 10,
      background: "var(--theme-button-bg)",
      color: "var(--theme-text)",
      fontWeight: 800,
     }}
    >
     Back to Home
    </Link>
   </section>
  </main>
 )
}
