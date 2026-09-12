import PatternMateTrainer from "./PatternMateTrainer"
import type { SiteExplanationKey } from "../../content/siteExplanations"

export type PatternMatePageConfig = {
 title: string
 manifestPath: string
 progressKey?: string
 explanationKey?: SiteExplanationKey
 allowChunkNavigation?: boolean
 backHref?: string
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

export function createPatternMatePage(config: PatternMatePageConfig) {
 function PatternMatePage() {
 return (
 <PatternMateTrainer
 config={{
 trainerKey: config.progressKey ?? titleToKey(config.title),
 trainerTitle: config.title,
 dataBasePath: manifestPathToDataBasePath(config.manifestPath),
 explanationKey: config.explanationKey,
 backHref: config.backHref,
 }}
 />
 )
 }

 PatternMatePage.displayName = `${config.title.replace(/\s+/g, "")}PatternMatePage`

 return PatternMatePage
}

export default createPatternMatePage
