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

// 1. ADD STATE (after engineInfo state)
if (!code.includes("mateCountdown")) {
  code = code.replace(
    /const \[engineInfo, setEngineInfo\][^;]*;/,
    (match) =>
      match +
      `\n  const [mateCountdown, setMateCountdown] = useState<{ before: number; after: number } | null>(null);`
  )
}

// 2. ADD UI BLOCK (safe insertion near right panel)
if (!code.includes("Mate countdown")) {
  code = code.replace(
    /<SectionTitle>.*?<\/SectionTitle>/,
    (match) =>
      match +
      `
      
      {mateCountdown && (
        <PanelCard>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Mate countdown</div>
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
  )
}

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)