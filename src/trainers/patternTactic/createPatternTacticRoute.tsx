import { RouteObject } from "react-router-dom"
import createPatternTacticPage from "./createPatternTacticPage"
import type { PatternTacticPageConfig } from "./createPatternTacticPage"

export type PatternTacticRouteConfig = PatternTacticPageConfig & {
 path: string
}

export function createPatternTacticRoute(
 config: PatternTacticRouteConfig
): RouteObject {
 const Page = createPatternTacticPage(config)

 return {
 path: config.path,
 element: <Page />,
 }
}

export function createPatternTacticRoutes(
 configs: PatternTacticRouteConfig[]
): RouteObject[] {
 return configs.map((config) => createPatternTacticRoute(config))
}

export default createPatternTacticRoute