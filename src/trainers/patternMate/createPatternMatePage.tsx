import PatternMateTrainer from "./PatternMateTrainer"

export type PatternMatePageConfig = {
  title: string
  manifestPath: string
  progressKey?: string
  allowChunkNavigation?: boolean
}

export function createPatternMatePage(config: PatternMatePageConfig) {
  function PatternMatePage() {
    return (
      <PatternMateTrainer
        title={config.title}
        manifestPath={config.manifestPath}
        progressKey={config.progressKey}
        allowChunkNavigation={config.allowChunkNavigation}
      />
    )
  }

  PatternMatePage.displayName = `${config.title.replace(/\s+/g, "")}PatternMatePage`

  return PatternMatePage
}

export default createPatternMatePage