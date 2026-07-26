const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const packageRoot = path.join(root, "node_modules", "stockfish")
const binDir = path.join(packageRoot, "bin")
const outputDir = path.join(root, "public", "stockfish")

if (!fs.existsSync(binDir)) {
  throw new Error("Stockfish package is missing. Run npm install first.")
}

const jsName = fs
  .readdirSync(binDir)
  .filter((name) => /^stockfish-\d+(?:\.\d+)*-lite-single\.js$/.test(name))
  .sort()
  .at(-1)

if (!jsName) {
  throw new Error("No lite single-threaded Stockfish browser build was found.")
}

const wasmName = jsName.replace(/\.js$/, ".wasm")
const jsSource = path.join(binDir, jsName)
const wasmSource = path.join(binDir, wasmName)

if (!fs.existsSync(wasmSource)) {
  throw new Error(`Missing matching Stockfish WASM file: ${wasmName}`)
}

fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(jsSource, path.join(outputDir, "stockfish.js"))
fs.copyFileSync(wasmSource, path.join(outputDir, "stockfish.wasm"))

const licenseSource = path.join(packageRoot, "Copying.txt")
if (fs.existsSync(licenseSource)) {
  fs.copyFileSync(licenseSource, path.join(outputDir, "COPYING.txt"))
}

console.log(`Installed browser Stockfish assets from ${jsName}`)
