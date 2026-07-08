import fs from "fs";

const kpkFile = "src/pages/endgames/KPKTrainer.tsx";
const shellFile = "src/components/trainer/TrainerShell.tsx";

/* ---------- KPKTrainer.tsx ---------- */

let k = fs.readFileSync(kpkFile, "utf8");

// Remove old broken boardOverlay prop lines
k = k.replace(/\s+boardOverlay=\{boardOverlay\}/g, "");
k = k.replace(/\s+kpkBoardOverlay=\{kpkBoardOverlay\}/g, "");

// Add clean overlay constant after phase state
if (!k.includes("const kpkBoardOverlay =")) {
  k = k.replace(
`  const [phase, setPhase] = useState<"classify" | "play">("play");`,
`  const [phase, setPhase] = useState<"classify" | "play">("play");

  const kpkBoardOverlay =
    justMated || justStalemated ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          background: "rgba(0,0,0,0.45)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            padding: "16px 30px",
            borderRadius: 16,
            background: justStalemated
              ? "rgba(170,20,20,0.96)"
              : "rgba(20,120,40,0.96)",
            color: "white",
            fontWeight: 900,
            fontSize: 38,
            letterSpacing: 2,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}
        >
          {justStalemated ? "STALEMATE" : "CHECKMATE"}
        </div>
      </div>
    ) : null;`
  );
}

// Add clean prop to TrainerShell
k = k.replace(
  /<TrainerShell\b/,
  `<TrainerShell
      kpkBoardOverlay={kpkBoardOverlay}`
);

// Fix encoding
k = k.replaceAll("STALEMATE � FAIL", "STALEMATE — FAIL");

fs.writeFileSync(kpkFile, k, "utf8");

/* ---------- TrainerShell.tsx ---------- */

let s = fs.readFileSync(shellFile, "utf8");

// Add prop type if missing
if (!s.includes("kpkBoardOverlay?: React.ReactNode")) {
  s = s.replace(
    /boardOverlay\?: React\.ReactNode;\s*/g,
    ""
  );

  s = s.replace(
    /boardLeft\?: React\.ReactNode;/,
    `boardLeft?: React.ReactNode;
  kpkBoardOverlay?: React.ReactNode;`
  );
}

// Destructure prop if missing
if (!s.includes("kpkBoardOverlay,")) {
  s = s.replace(
    /boardLeft,/,
    `boardLeft,
  kpkBoardOverlay,`
  );
}

// Render overlay after Chessboard if missing
if (!s.includes("{kpkBoardOverlay && (")) {
  s = s.replace(
    /(<Chessboard[\s\S]*?\/>)/,
    `$1

          {kpkBoardOverlay && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 9999,
                pointerEvents: "none",
              }}
            >
              {kpkBoardOverlay}
            </div>
          )}`
  );
}

// Ensure the board wrapper is relative in common shape
s = s.replace(
  /style=\{\{\s*width:\s*boardSize,\s*height:\s*boardSize,/,
  `style={{
          position: "relative",
          width: boardSize,
          height: boardSize,`
);

fs.writeFileSync(shellFile, s, "utf8");

console.log("DONE: clean KPK board overlay patched");