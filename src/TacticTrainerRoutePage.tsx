import { Link, useParams } from "react-router-dom"
import PatternTacticTrainer from "./trainers/patternTactic/PatternTacticTrainer"
import { patternTacticConfigByRoute } from "./trainers/patternTactic/pageConfigs"

export default function TacticTrainerRoutePage() {
 const params = useParams()
 const routeKey = `${params.level ?? ""}/${params.theme ?? ""}`
 const config = (patternTacticConfigByRoute as Record<string, any>)[routeKey]

 if (!config) {
 return (
 <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
 <h1>Tactic trainer not found</h1>
 <p>This tactic page does not exist or has too few puzzles.</p>
 <Link to="/tactics">Back to Tactics</Link>
 </main>
 )
 }

 return <PatternTacticTrainer config={config} />
}
