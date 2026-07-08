import PatternTacticTrainer from "./PatternTacticTrainer"
import type { SiteExplanationKey } from "../../content/siteExplanations"

export type PatternTacticPageConfig = {
 title: string
 manifestPath: string
 progressKey?: string
 explanationKey?: SiteExplanationKey
 allowChunkNavigation?: boolean
}

function manifestPathToDataBasePath(manifestPath: string) {
 return manifestPath.replace(/\/manifest\.json$/, "")
}

function titleToKey(title: string) {
 return title
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "")
}

export function createPatternTacticPage(config: PatternTacticPageConfig) {
 function PatternTacticPage() {
 return (
 <PatternTacticTrainer
 config={{
 trainerKey: config.progressKey ?? titleToKey(config.title),
 trainerTitle: config.title,
 dataBasePath: manifestPathToDataBasePath(config.manifestPath),
 explanationKey: config.explanationKey,
 }}
 />
 )
 }

 PatternTacticPage.displayName = `${config.title.replace(/\s+/g, "")}PatternTacticPage`

 return PatternTacticPage
}

export default createPatternTacticPage