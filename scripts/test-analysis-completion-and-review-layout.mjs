import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" })

try {
 await Promise.all([
  vite.transformRequest("/src/pages/AutoStudyPage.tsx"),
  vite.transformRequest("/src/components/BackgroundAnalysisStatus.tsx"),
  vite.transformRequest("/src/pages/analyze/AnalyzeBoardPage.tsx"),
 ])

 const [engineAnalysis, autoStudy, status, board, responsiveCss, lifecycle] = await Promise.all([
  readFile(new URL("../src/training/engineAnalyzeImportedGames.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/AutoStudyPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/BackgroundAnalysisStatus.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/analyze/AnalyzeBoardPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/analyze/AnalyzeSubpages.css", import.meta.url), "utf8"),
  readFile(new URL("../src/context/BackgroundAnalysisContext.tsx", import.meta.url), "utf8"),
 ])

 // Completion action is driven by the canonical pending imported-game count.
 assert.match(engineAnalysis, /getRemainingImportedGamesToAnalyze/, "canonical remaining-game count is exported")
 assert.match(engineAnalysis, /count: "exact", head: true/, "remaining count is exact")
 assert.match(engineAnalysis, /\.or\(PENDING_ENGINE_ANALYSIS_FILTER\)/, "remaining count uses the canonical pending filter")
 assert.match(autoStudy, /remainingAnalysisGames !== null && remainingAnalysisGames > 0/, "analyze action is rendered only when games remain")
 assert.match(autoStudy, /Analyze \$\{remainingAnalysisGames\} remaining/, "remaining action states the actual count")
 assert.doesNotMatch(autoStudy, /Analyze all remaining games with Stockfish/, "zero-remaining UI has no unconditional no-op action")

 // A finished zero-remaining job offers the plan exactly until acknowledgement,
 // then leaves no permanent completion chrome on route navigation.
 assert.match(status, /job\.status === "completed" && job\.planReadyAcknowledged\) return null/, "acknowledged completion status disappears")
 assert.match(status, /View My Training Plan/, "unacknowledged completion has the plan CTA")
 assert.match(lifecycle, /if \(patch\.status && !canAdvanceAnalysisStatus/, "completed jobs reject backward phase updates")

// Desktop review uses three readable columns with Moves at the far right.
assert.match(board, /ANALYZE_REVIEW_SIDE_PANEL_WIDTH = 854/, "review workspace preserves its useful inner desktop width with less outer chrome")
assert.match(board, /maxWidth=\{1640\}/, "review shell uses the available large-desktop width")
assert.match(board, /grid-template-columns: minmax\(288px, 1fr\) minmax\(270px, 0\.95fr\) minmax\(248px, 0\.88fr\)/, "Game Analysis, Review Details, and Moves have useful desktop columns")
assert.match(board, /"review details moves"/, "Moves occupies the far-right review column")
assert.match(board, /ANALYZE_REVIEW_MAX_BOARD_SIZE = 720/, "review board grows on sufficiently large desktops")
assert.match(board, /ANALYZE_REVIEW_MEDIUM_BOARD_SIZE = 650/, "medium desktops retain a safe scaled-down board")
assert.match(board, /padding: 10px 8px 12px 20px !important/, "large-desktop review uses a sensible left gutter while reclaiming wasted space")
assert.match(board, /\.trainer-shell-layout \{\s*gap: 7px !important/, "board growth uses only outer board-divider spacing")
assert.match(board, /\.trainer-shell-side \{\s*padding: 4px !important/, "right-panel tracks retain their existing usable inner width")
assert.match(board, /\.trainer-shell-board-column \{\s*margin-top: 14px/, "board is positioned slightly lower than the review heading")
assert.match(board, /\.analyze-review-grid\.review-mode > :nth-child\(1\)[\s\S]*?overflow: visible/, "classification panel does not use its own narrow scrollbar")
assert.match(board, /className="analyze-classification-label"/, "classification labels have a dedicated desktop safety hook")
assert.match(board, /whiteSpace: "nowrap", wordBreak: "normal", overflowWrap: "normal"/, "classification labels cannot use break-all or anywhere wrapping")
 assert.match(board, /\.analyze-moves-list/, "move list remains independently scrollable")
 assert.match(responsiveCss, /@media \(min-width: 769px\) and \(max-width: 1100px\)/, "desktop layout is not collapsed at the 1650px target")

 console.log("PASS: completion actions use canonical remaining games and review layout keeps readable desktop panels")
} finally {
 await vite.close()
}
