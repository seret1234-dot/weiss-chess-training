export const HIERARCHY_PARENT_STATE_KEY = "weissHierarchyParentPath"

export function createHierarchyNavigationState(parentPath) {
  return { [HIERARCHY_PARENT_STATE_KEY]: parentPath }
}

export function getHierarchyBackAction({ expectedParentPath, locationState }) {
  return locationState?.[HIERARCHY_PARENT_STATE_KEY] === expectedParentPath
    ? { type: "POP" }
    : { type: "REPLACE", target: expectedParentPath }
}
