import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer"
const filePath = path.join(
  ROOT,
  "src",
  "pages",
  "endgames",
  "KNNKPForcedMateTrainer.tsx"
)

let code = fs.readFileSync(filePath, "utf8")

// 1) Ensure mateCountdown state exists
if (!code.includes("const [mateCountdown, setMateCountdown]")) {
  code = code.replace(
    /const \[engineInfo, setEngineInfo\] = useState<EngineResult \| null>\(null\);/,
    `const [engineInfo, setEngineInfo] = useState<EngineResult | null>(null);
  const [mateCountdown, setMateCountdown] = useState<{ before: number; after: number } | null>(null);`
  )
}

// 2) Reset countdown when loading/restarting position
code = code.replace(
  /setJustMated\(false\);\n\s*moveStartedAtRef\.current = Date\.now\(\);/g,
  `setJustMated(false);
    setMateCountdown(null);
    moveStartedAtRef.current = Date.now();`
)

// 3) Improve starting message: do NOT say capture pawn
code = code.replace(
  /"Convert the win\. Capture the pawn or force mate\."/g,
  `"Convert the win. Keep the pawn as a tempo resource and force mate."`
)

// 4) Ensure countdown is set during mate validation
if (!code.includes("setMateCountdown({ before: beforeMate, after: afterMate });")) {
  code = code.replace(
    /const beforeMate = Math\.abs\(before\.mate\);\n\s*const afterMate = Math\.abs\(afterUser\.mate\);/,
    `const beforeMate = Math.abs(before.mate);
      const afterMate = Math.abs(afterUser.mate);

      setMateCountdown({ before: beforeMate, after: afterMate });`
  )
}

// 5) Improve hint: use engine best move and show source+target
code = code.replace(
  /setMessage\(\s*`Try \$\{parsed\.from\} → \$\{parsed\.to\}\$\{parsed\.promotion \? ` \(\$\{parsed\.promotion\}\)` : ""\}`,\s*\);/,
  `setMessage(
      \`Best move: \${parsed.from} → \${parsed.to}\${parsed.promotion ? \` (\${parsed.promotion})\` : ""}\`,
    );`
)

// 6) Add countdown UI before hint button area if not already rendered
if (!code.includes("Mate countdown")) {
  const uiBlock = `
          {mateCountdown && (
            <PanelCard>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                Mate countdown
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color:
                    mateCountdown.after <= mateCountdown.before
                      ? "#7ecf7a"
                      : "#ff7777",
                }}
              >
                Mate in {mateCountdown.before} → {mateCountdown.after}
              </div>
            </PanelCard>
          )}

`
  code = code.replace(/<HintButton/g, uiBlock + "          <HintButton")
}

// 7) Improve wrong-move retry message
code = code.replace(
  /setMessage\("Try again\. Convert the win\."\);/g,
  `setMessage("Try again. Keep the pawn alive and reduce the mate distance.");`
)

// 8) Clear countdown on whole reset
code = code.replace(
  /setEngineInfo\(null\);/g,
  `setEngineInfo(null);
    setMateCountdown(null);`
)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)