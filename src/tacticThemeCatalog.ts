import { VERIFIED_FINAL_TACTIC_COURSES } from "./trainers/patternTactic/generatedFinalVerifiedTaxonomy"

export type TacticDistanceId = "m1" | "m2" | "m3" | "m4"

export const tacticDistanceLabels: Record<TacticDistanceId, string> = {
 m1: "Tactic in 1",
 m2: "Tactic in 2",
 m3: "Tactic in 3",
 m4: "Tactic in 4+",
}

export type LearnerVisibleTacticCourse = {
 key: string
 title: string
 slug: string
 distance: TacticDistanceId
 exerciseCount: number
 route: string
 trainerKey: string
 manifestPath: string
}

/**
 * The final reviewed taxonomy is the only source for learner-selectable
 * course routes.  Historical theme lists deliberately do not participate in
 * navigation, recommendation, or route registration.
 */
export const learnerVisibleTacticCourses: readonly LearnerVisibleTacticCourse[] =
 VERIFIED_FINAL_TACTIC_COURSES.map((course) => ({
  key: course.trainerKey,
  title: course.label,
  slug: course.theme,
  distance: `m${course.stage}` as TacticDistanceId,
  exerciseCount: course.exerciseCount,
  route: `/tactics/m${course.stage}/${course.theme}`,
  trainerKey: course.trainerKey,
  manifestPath: `${course.learnerDataBasePath}/manifest.json`,
 }))

export type LearnerVisibleTacticTheme = {
 key: string
 title: string
 slug: string
 distances: readonly TacticDistanceId[]
 countByDistance: Partial<Record<TacticDistanceId, number>>
}

const themesByKey = new Map<string, LearnerVisibleTacticTheme>()

for (const course of learnerVisibleTacticCourses) {
 const existing = themesByKey.get(course.slug)
 if (existing) {
  themesByKey.set(course.slug, {
   ...existing,
   distances: [...existing.distances, course.distance],
   countByDistance: {
    ...existing.countByDistance,
    [course.distance]: course.exerciseCount,
   },
  })
 } else {
  themesByKey.set(course.slug, {
   key: course.slug,
   title: course.title,
   slug: course.slug,
   distances: [course.distance],
   countByDistance: { [course.distance]: course.exerciseCount },
  })
 }
}

export const tacticThemeCatalog: readonly LearnerVisibleTacticTheme[] = [
 ...themesByKey.values(),
]
