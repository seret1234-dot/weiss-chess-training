import { defineConfig, type Plugin } from "vite"
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

export default defineConfig({
  plugins: [react(), stockfishIsolationHeaders()],
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
})
