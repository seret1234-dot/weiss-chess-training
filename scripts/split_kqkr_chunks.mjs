import fs from "fs"
import path from "path"

const INPUT = path.join(process.cwd(), "src", "kqkr_positions.json")
const OUTPUT_ROOT = path.join(process.cwd(), "public", "data", "kqkr")

const CHUNK_SIZE = 30

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function splitIntoChunks(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("Input file not found:", INPUT)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"))

  ensureDir(OUTPUT_ROOT)

  for (const group of raw.groups) {
    const groupDir = path.join(OUTPUT_ROOT, group.key)
    ensureDir(groupDir)

    const chunks = splitIntoChunks(group.positions, CHUNK_SIZE)

    // write chunks
    chunks.forEach((chunk, i) => {
      const file = path.join(groupDir, `chunk_${i + 1}.json`)

      fs.writeFileSync(
        file,
        JSON.stringify({ positions: chunk }, null, 2), // ✅ correct key
        "utf8"
      )
    })

    // write manifest
    const manifest = {
      key: group.key,
      label: group.label,
      totalChunks: chunks.length,
      chunkSize: CHUNK_SIZE,
    }

    fs.writeFileSync(
      path.join(groupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    )

    console.log(`${group.key}: ${chunks.length} chunks created`)
  }

  console.log("DONE splitting KQKR")
}

main()