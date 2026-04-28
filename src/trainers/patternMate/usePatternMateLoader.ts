import { useEffect, useMemo, useState } from "react"
import { normalizePuzzleList } from "./normalizePuzzle"
import type {
  LoaderState,
  NormalizedPatternMatePuzzle,
  PatternMateChunkFile,
  PatternMateManifest,
  PatternMatePuzzle,
} from "./types"

const INITIAL_STATE: LoaderState = {
  manifest: null,
  chunkPuzzles: [],
  isManifestLoading: true,
  isChunkLoading: false,
  error: null,
  chunkFileName: null,
  totalChunks: 0,
  totalPuzzles: 0,
}

function extractRawPuzzles(chunkData: unknown): PatternMatePuzzle[] {
  if (Array.isArray(chunkData)) {
    return chunkData as PatternMatePuzzle[]
  }

  if (
    chunkData &&
    typeof chunkData === "object" &&
    Array.isArray((chunkData as PatternMateChunkFile).puzzles)
  ) {
    return (chunkData as PatternMateChunkFile).puzzles
  }

  return []
}

export function usePatternMateLoader(
  manifestPath: string,
  currentChunkIndex: number,
) {
  const [state, setState] = useState<LoaderState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function loadManifest() {
      setState({
        ...INITIAL_STATE,
        isManifestLoading: true,
      })

      try {
        const response = await fetch(manifestPath)
        if (!response.ok) {
          throw new Error(`Failed to load manifest: ${response.status}`)
        }

        const manifest = (await response.json()) as PatternMateManifest
        const safeChunkIndex = Math.max(
          0,
          Math.min(
            Math.max(0, manifest.files.length - 1),
            currentChunkIndex,
          ),
        )

        const chunkFileName = manifest.files[safeChunkIndex] ?? null

        if (cancelled) return

        setState({
          manifest,
          chunkPuzzles: [],
          isManifestLoading: false,
          isChunkLoading: !!chunkFileName,
          error: null,
          chunkFileName,
          totalChunks:
            typeof manifest.totalChunks === "number"
              ? manifest.totalChunks
              : manifest.files.length,
          totalPuzzles:
            typeof manifest.totalPuzzles === "number" ? manifest.totalPuzzles : 0,
        })

        if (!chunkFileName) {
          return
        }

        const basePath = manifestPath.includes("/")
          ? manifestPath.slice(0, manifestPath.lastIndexOf("/"))
          : "."

        const chunkPath = `${basePath}/${chunkFileName}`
        const chunkResponse = await fetch(chunkPath)

        if (!chunkResponse.ok) {
          throw new Error(`Failed to load chunk: ${chunkResponse.status}`)
        }

        const chunkData = (await chunkResponse.json()) as
          | PatternMateChunkFile
          | PatternMatePuzzle[]

        const rawPuzzles = extractRawPuzzles(chunkData)
        const fallbackTheme = manifest.theme ?? manifest.category ?? "Pattern Mate"
        const normalized = normalizePuzzleList(rawPuzzles, fallbackTheme)

        if (cancelled) return

        setState((prev) => ({
          ...prev,
          chunkPuzzles: normalized,
          isChunkLoading: false,
          error: null,
        }))
      } catch (error) {
        if (cancelled) return

        setState((prev) => ({
          ...prev,
          isManifestLoading: false,
          isChunkLoading: false,
          error: error instanceof Error ? error.message : "Failed to load puzzles",
        }))
      }
    }

    void loadManifest()

    return () => {
      cancelled = true
    }
  }, [manifestPath, currentChunkIndex])

  const puzzlesById = useMemo(() => {
    const map = new Map<string, NormalizedPatternMatePuzzle>()
    for (const puzzle of state.chunkPuzzles) {
      map.set(puzzle.id, puzzle)
    }
    return map
  }, [state.chunkPuzzles])

  return {
    ...state,
    puzzlesById,
  }
}