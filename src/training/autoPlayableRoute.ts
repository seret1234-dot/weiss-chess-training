import { CURRICULUM_CATALOG } from './curriculum/curriculumCatalog'

const curriculumPaths = new Set(CURRICULUM_CATALOG.filter(item => item.available).map(item => item.route.split('?')[0]))

/** Libraries are valid manual destinations, never Auto activities. */
export function isPlayableAutoRoute(route: string): boolean {
  if (!route.startsWith('/') || route.startsWith('//')) return false
  const path = route.split(/[?#]/)[0]
  if (curriculumPaths.has(path)) return true // Board Vision itself is a trainer.
  const master = path.match(/^\/master-(mates|tactics)\/([1-4])\/([a-z][a-z-]*)$/)
  if (master) return master[3] === 'mixed' || curriculumPaths.has(`/${master[1]}/m${master[2]}/${master[3]}`)
  const content = path.match(/^\/(openings|master-games)\/([^/]+)$/)
  return Boolean(content && !['family', 'my-openings', 'my-library', 'practice'].includes(content[2]))
}
