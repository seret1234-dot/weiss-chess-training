# Production snapshot — 12 September 2026

Production deployment: `dpl_2zaFtw8doxiFmPRViUoCtSEmAeCA` (https://weisschess.com).
The `prod-2026-09-12` annotated tag identifies the local Git snapshot of this release.
Creating the snapshot does not publish a deployment or push a branch/tag.

## Source provenance

The recovered Vercel source manifest contains 13,358 files. Each source file was
compared against `chess-trainer-clean-release` using Vercel's SHA-1 content ID;
all matched. The snapshot changes no deployed runtime or build configuration.
The only snapshot-time edits are two regression-test corrections and this document.
Reports and recovered manifests remain outside the repository.
The index also records the verified production line endings instead of retaining
older LF-only blobs for 4,736 otherwise-identical files. This changes no working
source or runtime behavior. The deployed Stockfish COPYING.txt is explicitly
included despite the broad local text-file ignore rule.

## Reproduction

- Use the committed package lock, Node 24.x and Git LFS (the existing Stockfish
  WASM asset is LFS-managed). Materialize LFS assets before building.
- Install with `npm ci`. Keep the existing postinstall scripts enabled: these
  install Stockfish assets and apply the version-checked chessboard patches.
- Supply the same secure environment configuration as the existing Vercel
  Production project; never commit environment files or backend credentials.
- Run `npm run build` (Vite, followed by route-metadata shell generation).
- The frontend configuration includes `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_PAYPAL_CLIENT_ID`,
  `VITE_MASTER_PUZZLES_BASE_URL`, `AFFILIATE_PROGRAM_ENABLED` and
  `VITE_GA4_MEASUREMENT_ID=G-RLHDSPZ8WH`. Vite exposes only the intended public
  values; payment/provider secrets remain server-side.
- The approved Master corpus is an external Supabase Storage dependency, not a
  local corpus snapshot. Retain the Production corpus URL/configuration. Some
  historical corpus regression scripts additionally require their local source
  datasets; those copies are deliberately not production runtime inputs.
- `scripts/build-seo-production-check.mjs` is a local convenience check that
  reads already-public configuration. It is not an export of all Vercel settings.
  Byte-identical bundles require the exact original environment values: the
  deployed Master-corpus URL includes a leading U+FEFF character, whereas this
  convenience check uses the clean public URL. No environment change was made.

Production main asset: `/assets/index-BzZUOQcU.js`, SHA-256
`18e7c350eda940e75ba79099bbc116710720703fbec74dd9a948ded767455657`.
Production CSS: `/assets/index-DnQH2d9d.css`, SHA-256
`5ab4f43834b279a2f9ff808eaf59870de11ec394144583fa6c61f27c172a0bd1`.

The Supabase migrations are retained as project source/history. Snapshotting does
not apply migrations or change any remote data. Reconcile migration history before
any future database rollout; do not bulk-reapply already-installed migrations.

## Bounded release verification

Run against a production build, using isolated test sessions, not real accounts:

```sh
node scripts/test-auto-entry-app-rendered.mjs
node scripts/test-weekly-hydration-production.mjs
node scripts/test-simplified-onboarding-rendered.mjs
node scripts/test-auto-chunk-allowance.mjs
node scripts/test-auto-continue-state-rendered.mjs
node scripts/test-auto-chunk-quota-db.mjs
node scripts/test-due-review-commit-rendered.mjs
node scripts/test-ga4-production.mjs
node scripts/test-ga4-production.mjs --real-tag
node scripts/test-seo-http.mjs --base=https://weisschess.com
```

The PostgreSQL quota test creates/stops a disposable local cluster. GA collection
is intercepted so fixture visits do not enter the production reporting property.
The real-tag test checks one active installation per document and exactly-once
route pageviews, not a lifetime count of requests to Google's entire tag hostname.
Consent revoke/re-enable must reuse the existing installation; a document reload
gets a new installation. The old quota source assertion incorrectly required a
due-review hydration write: hydration is read-only until qualifying learner evidence.

TypeScript verification uses `scripts/check-onboarding-types.mjs` with
`ONBOARDING_BASELINE` pointing to an independently hash-verified copy of the
deployed source. The release baseline has 68 pre-existing diagnostics; do not
interpret a Vite build as a clean full TypeScript check.

## Excluded local work

Do not stage reports, audit output, browser captures, recovery/preview copies,
`supabase/.temp`, caches, environment files, or unrelated corpus development.
Local Master corpus copies and generated verified-tactics reports are excluded
by the existing upload policy. The production snapshot preserves this policy.
Forty-four historical tracked backup/broken-source files, absent from the deployed
source and hidden by sparse checkout, are omitted from this release tree only.
Their history is retained; no working files are deleted.

Vercel is linked to `main`; a later Git push could trigger deployment. Decide the
push/deployment procedure separately. This snapshot does not alter that configuration.
