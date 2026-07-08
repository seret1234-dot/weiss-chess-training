import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");
const original = s;

// Add boardOverlay constant before return(
if (!s.includes("const boardOverlay =")) {
  s = s.replace(
    /\n\s*return\s*\(\s*/,

`
  const boardOverlay =
    justMated || justStalemated ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.35)",
          zIndex: 40,
          pointerEvents: "none",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            padding: "16px 28px",
            borderRadius: 16,
            background: justMated
              ? "rgba(20,120,40,0.95)"
              : "rgba(160,20,20,0.95)",
            color: "white",
            fontWeight: 900,
            fontSize: 36,
            letterSpacing: 2,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
        >
          {justMated ? "CHECKMATE" : "STALEMATE"}
        </div>
      </div>
    ) : null;

  return (
`
  );
}

// Inject boardOverlay prop into TrainerShell
if (!s.includes("boardOverlay={boardOverlay}")) {
  s = s.replace(
    /<TrainerShell/,
    `<TrainerShell
      boardOverlay={boardOverlay}`
  );
}

fs.writeFileSync(file, s, "utf8");

console.log(
  s === original
    ? "No changes made."
    : "DONE: added KPK board overlay"
);