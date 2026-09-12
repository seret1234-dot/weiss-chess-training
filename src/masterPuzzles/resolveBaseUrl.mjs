export const LOCAL_MASTER_PUZZLES_BASE_URL = '/data/master-puzzles/v1'

export function resolveMasterPuzzlesBaseUrl(configuredUrl) {
 return (configuredUrl?.trim() || LOCAL_MASTER_PUZZLES_BASE_URL).replace(/\/+$/, '')
}
