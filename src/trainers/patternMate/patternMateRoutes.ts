import { createPatternMateRoutes, PatternMateRouteConfig } from "./createPatternMateRoute"
import { patternMatePageConfigs } from "./pageConfigs"

const patternMateRoutesConfig: PatternMateRouteConfig[] = [
  {
    path: "/pattern/anastasia/mate-in-1",
    ...patternMatePageConfigs.anastasiaMate1,
  },
  {
    path: "/pattern/anastasia/mate-in-2",
    ...patternMatePageConfigs.anastasiaMate2,
  },
  {
    path: "/pattern/back-rank/mate-in-1",
    ...patternMatePageConfigs.backRankMate1,
  },
  {
    path: "/pattern/back-rank/mate-in-2",
    ...patternMatePageConfigs.backRankMate2,
  },
  {
    path: "/pattern/bishop-knight",
    ...patternMatePageConfigs.bishopKnightMate,
  },
  {
    path: "/pattern/two-bishops",
    ...patternMatePageConfigs.twoBishopsMate,
  },
]

export const patternMateRoutes = createPatternMateRoutes(patternMateRoutesConfig)

export default patternMateRoutes