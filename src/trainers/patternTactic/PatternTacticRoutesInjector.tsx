import { useRoutes, RouteObject } from "react-router-dom"
import patternTacticRoutes from "./patternTacticRoutes"

type PatternTacticRoutesInjectorProps = {
 baseRoutes: RouteObject[]
}

export default function PatternTacticRoutesInjector({
 baseRoutes,
}: PatternTacticRoutesInjectorProps) {
 const routes: RouteObject[] = [
 ...baseRoutes,
 ...patternTacticRoutes,
 ]

 return useRoutes(routes)
}