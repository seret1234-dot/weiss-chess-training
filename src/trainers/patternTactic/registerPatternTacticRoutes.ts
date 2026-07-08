import { RouteObject } from "react-router-dom"
import patternTacticRoutes from "./patternTacticRoutes"

export function registerPatternTacticRoutes(
 routes: RouteObject[]
): RouteObject[] {
 if (!Array.isArray(routes)) return routes

 return [
 ...routes,
 ...patternTacticRoutes,
 ]
}

export default registerPatternTacticRoutes