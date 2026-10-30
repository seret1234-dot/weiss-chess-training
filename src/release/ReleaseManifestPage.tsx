import { BUILD_MANIFEST } from './buildManifest'

export default function ReleaseManifestPage() {
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <h1>Release manifest</h1>
      <dl>
        <dt>Product</dt><dd>{BUILD_MANIFEST.product}</dd>
        <dt>Release</dt><dd>{BUILD_MANIFEST.releaseId}</dd>
        <dt>Source revision</dt><dd>{BUILD_MANIFEST.sourceRevision}</dd>
        <dt>Built at</dt><dd>{BUILD_MANIFEST.builtAt}</dd>
      </dl>
    </main>
  )
}
