import { RouteObject } from "react-router-dom"
import createPatternMatePage from "./createPatternMatePage"
import type { PatternMatePageConfig } from "./createPatternMatePage"

export type PatternMateRouteConfig = PatternMatePageConfig & {
  path: string
}

export function createPatternMateRoute(
  config: PatternMateRouteConfig
): RouteObject {
  const Page = createPatternMatePage(config)

  return {
    path: config.path,
    element: <Page />,
  }
}

export function createPatternMateRoutes(
  configs: PatternMateRouteConfig[]
): RouteObject[] {
  return configs.map((config) => createPatternMateRoute(config))
}

export default createPatternMateRoute