import { useRoutes, RouteObject } from "react-router-dom"
import patternMateRoutes from "./patternMateRoutes"

type PatternMateRoutesInjectorProps = {
  baseRoutes: RouteObject[]
}

export default function PatternMateRoutesInjector({
  baseRoutes,
}: PatternMateRoutesInjectorProps) {
  const routes: RouteObject[] = [
    ...baseRoutes,
    ...patternMateRoutes,
  ]

  return useRoutes(routes)
}