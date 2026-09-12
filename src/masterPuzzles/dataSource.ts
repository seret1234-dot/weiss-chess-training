import {
 LOCAL_MASTER_PUZZLES_BASE_URL,
 resolveMasterPuzzlesBaseUrl as resolveConfiguredMasterPuzzlesBaseUrl,
} from './resolveBaseUrl.mjs'

export { LOCAL_MASTER_PUZZLES_BASE_URL }

export function resolveMasterPuzzlesBaseUrl(configuredUrl?: string) {
 return resolveConfiguredMasterPuzzlesBaseUrl(configuredUrl ?? import.meta.env.VITE_MASTER_PUZZLES_BASE_URL)
}

export function getMasterPuzzlesBaseUrl() {
 return resolveMasterPuzzlesBaseUrl()
}

export async function requestMasterPuzzleData<T>(path: string): Promise<T> {
 const normalizedPath = path.replace(/^\/+/, '')
 const response = await fetch(`${getMasterPuzzlesBaseUrl()}/${normalizedPath}`)
 if (!response.ok) throw new Error(`Could not load Master data ${normalizedPath} (HTTP ${response.status})`)
 return response.json() as Promise<T>
}
