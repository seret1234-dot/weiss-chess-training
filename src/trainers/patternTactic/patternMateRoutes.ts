import { createPatternTacticRoutes, PatternTacticRouteConfig } from "./createPatternTacticRoute"
import { patternTacticPageConfigs } from "./pageConfigs"

const patternTacticRoutesConfig: PatternTacticRouteConfig[] = [
 {
 path: "/pattern/anastasia/mate-in-1",
 ...patternTacticPageConfigs.anastasiaMate1,
 },
 {
 path: "/pattern/anastasia/mate-in-2",
 ...patternTacticPageConfigs.anastasiaMate2,
 },
 {
 path: "/pattern/back-rank/mate-in-1",
 ...patternTacticPageConfigs.backRankMate1,
 },
 {
 path: "/pattern/back-rank/mate-in-2",
 ...patternTacticPageConfigs.backRankMate2,
 },
 {
 path: "/pattern/bishop-knight",
 ...patternTacticPageConfigs.bishopKnightMate,
 },
 {
 path: "/pattern/two-bishops",
 ...patternTacticPageConfigs.twoBishopsMate,
 },
]

export const patternTacticRoutes = createPatternTacticRoutes(patternTacticRoutesConfig)

export default patternTacticRoutes