/**
 * Resolves a public asset exactly as the browser will request it. Manifests
 * deliberately store chunk names relative to their course directory.
 */
export function resolvePatternTacticPublicAssetUrl(
  basePath: string,
  assetPath: string,
) {
  const asset = String(assetPath || '').trim()
  if (asset.startsWith('/')) return asset

  const base = String(basePath || '').trim().replace(/\/+$/, '')
  if (!base || !asset) {
    throw new Error('A Pattern Tactics asset requires both a base path and filename.')
  }

  return `${base}/${asset.replace(/^\/+/, '')}`
}

/**
 * Static deployments may return an HTML fallback with HTTP 200 when a public
 * asset is missing. Validate the response before parsing so tactics fail
 * closed with an actionable asset error instead of a JSON syntax exception.
 */
export async function readPatternTacticJson<T>(
  response: Response,
  assetUrl: string,
  assetKind = 'verified tactic asset',
): Promise<T> {
  if (!response.ok) {
    throw new Error(`Could not load ${assetKind} ${assetUrl}: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('json')) {
    const bodyStart = (await response.text()).slice(0, 80).replace(/\s+/g, ' ').trim()
    const received = contentType || 'missing Content-Type'
    throw new Error(
      `Expected ${assetKind} JSON but received ${received} from ${assetUrl}${bodyStart ? `: ${bodyStart}` : ''}`,
    )
  }

  try {
    return await response.json() as T
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not parse ${assetKind} JSON from ${assetUrl}: ${detail}`)
  }
}

export async function fetchPatternTacticJson<T>(assetUrl: string, assetKind?: string): Promise<T> {
  return readPatternTacticJson<T>(await fetch(assetUrl), assetUrl, assetKind)
}
