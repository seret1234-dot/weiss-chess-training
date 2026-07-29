export type AutoTrainingItem = {
 route: string
 trainerKey: string
 chunkIndex?: number | null
 curriculumArea?: string
 curriculumStage?: string
 curriculumTheme?: string | null
 curriculumEventKind?: string
 curriculumDecisionId?: string
}

function splitRoute(route: string) {
 const hashIndex = route.indexOf("#")
 const withoutHash = hashIndex >= 0 ? route.slice(0, hashIndex) : route
 const hash = hashIndex >= 0 ? route.slice(hashIndex) : ""
 const queryIndex = withoutHash.indexOf("?")

 return {
  pathname: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
  query: queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "",
  hash,
 }
}

export function addAutoTrainingParams(
 route: string,
 extra: Record<string, string | number | null | undefined> = {},
) {
 const { pathname, query, hash } = splitRoute(route)
 const params = new URLSearchParams(query)

 params.set("auto", "1")

 for (const [key, value] of Object.entries(extra)) {
  if (value === null || value === undefined || value === "") {
   params.delete(key)
  } else {
   params.set(key, String(value))
  }
 }

 const nextQuery = params.toString()
 return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash}`
}

export function buildAutoTrainingRoute(item: AutoTrainingItem) {
 const safeChunk =
  item.chunkIndex === null || item.chunkIndex === undefined
   ? null
   : Math.max(0, item.chunkIndex)

 return addAutoTrainingParams(item.route, {
  chunk: safeChunk,
  autoKey: item.trainerKey,
  autoChunk: safeChunk,
  autoRoute: item.route,
  curriculumArea: item.curriculumArea,
  curriculumStage: item.curriculumStage,
  curriculumTheme: item.curriculumTheme,
  curriculumEventKind: item.curriculumEventKind,
  curriculumDecision: item.curriculumDecisionId,
 })
}

export const AUTO_TRAINING_COMPLETE_EVENT = "weissChess:auto-training-complete"

export function announceAutoTrainingComplete() {
 window.dispatchEvent(new Event(AUTO_TRAINING_COMPLETE_EVENT))
}
