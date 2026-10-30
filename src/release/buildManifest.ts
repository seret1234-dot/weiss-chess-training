declare const __WEISS_RELEASE_ID__: string
declare const __WEISS_SOURCE_REVISION__: string
declare const __WEISS_BUILD_TIMESTAMP__: string

export const BUILD_MANIFEST = Object.freeze({
  product: 'Weiss Chess',
  releaseId: __WEISS_RELEASE_ID__,
  sourceRevision: __WEISS_SOURCE_REVISION__,
  builtAt: __WEISS_BUILD_TIMESTAMP__,
})
