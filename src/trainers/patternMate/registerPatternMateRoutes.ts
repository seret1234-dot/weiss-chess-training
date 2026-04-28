import { RouteObject } from "react-router-dom"
import patternMateRoutes from "./patternMateRoutes"

export function registerPatternMateRoutes(
  routes: RouteObject[]
): RouteObject[] {
  if (!Array.isArray(routes)) return routes

  return [
    ...routes,
    ...patternMateRoutes,
  ]
}

export default registerPatternMateRoutes