const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

const projectRoot = path.resolve(__dirname, "..")
const apiEntry = path.join(
  projectRoot,
  "server",
  "image-to-position-server.cjs",
)
const viteEntry = path.join(
  projectRoot,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
)

for (const entry of [apiEntry, viteEntry]) {
  if (!fs.existsSync(entry)) {
    console.error(`Required development entry is missing: ${entry}`)
    process.exit(1)
  }
}

const children = []
let stopping = false
const developmentEnvironment = {
  ...process.env,
  IMAGE_TO_POSITION_TIMING:
    process.env.IMAGE_TO_POSITION_TIMING || "1",
}

function stopAll(code = 0) {
  if (stopping) return
  stopping = true

  for (const child of children) {
    if (!child.killed && child.exitCode === null) {
      child.kill("SIGTERM")
    }
  }

  setTimeout(() => process.exit(code), 250)
}

function startNodeProcess(name, entry, args = []) {
  const child = spawn(
    process.execPath,
    [entry, ...args],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: developmentEnvironment,
      windowsHide: false,
    },
  )

  children.push(child)

  child.on("error", (error) => {
    console.error(`${name} failed to start:`, error)
    stopAll(1)
  })

  child.on("exit", (code, signal) => {
    if (stopping) return

    if (signal) {
      console.error(`${name} exited from signal ${signal}.`)
      stopAll(1)
      return
    }

    if (code !== 0) {
      console.error(`${name} exited with code ${code}.`)
      stopAll(code || 1)
      return
    }

    stopAll(0)
  })

  return child
}

startNodeProcess("Local API", apiEntry)
startNodeProcess("Vite", viteEntry)

process.on("SIGINT", () => stopAll(0))
process.on("SIGTERM", () => stopAll(0))
process.on("exit", () => {
  for (const child of children) {
    if (!child.killed && child.exitCode === null) {
      child.kill("SIGTERM")
    }
  }
})
