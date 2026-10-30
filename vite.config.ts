import { rm } from "node:fs/promises"
import { resolve } from "node:path"
import { defineConfig, loadEnv, type Plugin } from "vite"
import react from "@vitejs/plugin-react"

function stockfishIsolationHeaders(): Plugin {
  function applyHeaders(
    url: string | undefined,
    setHeader: (name: string, value: string) => void,
  ) {
    const pathname = (url ?? "/").split("?")[0]
    const isPricingPage =
      pathname === "/pricing" ||
      pathname.startsWith("/pricing/")

    if (!isPricingPage) {
      setHeader(
        "Cross-Origin-Opener-Policy",
        "same-origin",
      )
      setHeader(
        "Cross-Origin-Embedder-Policy",
        "require-corp",
      )
    }
  }

  return {
    name: "stockfish-isolation-headers",

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(req.url, (name, value) => {
          res.setHeader(name, value)
        })
        next()
      })
    },

    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(req.url, (name, value) => {
          res.setHeader(name, value)
        })
        next()
      })
    },
  }
}

function excludeExternalMasterCorpus(): Plugin {
  let outputDirectory = ""

  return {
    name: "exclude-external-master-corpus",
    apply: "build",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await rm(resolve(outputDirectory, "data/master-puzzles"), {
        recursive: true,
        force: true,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const usesExternalMasterCorpus = Boolean(env.VITE_MASTER_PUZZLES_BASE_URL?.trim())
  const releaseId = env.VITE_RELEASE_VERSION || env.VERCEL_GIT_COMMIT_SHA || 'local'
  const sourceRevision = env.VERCEL_GIT_COMMIT_SHA || env.VITE_SOURCE_REVISION || 'untracked-local'
  const builtAt = env.VITE_BUILD_TIMESTAMP || new Date().toISOString()

  return {
    // Public discovery only: expose this boolean, never the server environment.
    // The server continues to authorize every affiliate/payment operation.
    define: {
      'import.meta.env.VITE_AFFILIATE_DISCOVERY_ENABLED': JSON.stringify(env.AFFILIATE_PROGRAM_ENABLED === 'true'),
      __WEISS_RELEASE_ID__: JSON.stringify(releaseId),
      __WEISS_SOURCE_REVISION__: JSON.stringify(sourceRevision),
      __WEISS_BUILD_TIMESTAMP__: JSON.stringify(builtAt),
    },
    plugins: [
      react(),
      stockfishIsolationHeaders(),
      ...(usesExternalMasterCorpus ? [excludeExternalMasterCorpus()] : []),
    ],
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
      },
    },
    preview: {
    },
  }
})
