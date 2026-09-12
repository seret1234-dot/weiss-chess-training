import { useLocation, useNavigate } from 'react-router-dom'
import {
  createHierarchyNavigationState,
  getHierarchyBackAction,
} from './hierarchicalBack.mjs'

export function useHierarchicalNavigation() {
  const location = useLocation()
  const navigate = useNavigate()

  function navigateToChild(path: string) {
    navigate(path, { state: createHierarchyNavigationState(location.pathname) })
  }

  function backToParent(expectedParentPath: string) {
    const action = getHierarchyBackAction({
      expectedParentPath,
      locationState: location.state,
    })

    if (action.type === 'POP') {
      navigate(-1)
      return
    }

    navigate(action.target, { replace: true })
  }

  return { navigateToChild, backToParent }
}
