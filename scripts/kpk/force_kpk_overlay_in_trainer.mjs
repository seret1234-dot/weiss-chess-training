import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// Remove any old boardOverlay constant attempts
s = s.replace(
  /\n\s*const boardOverlay\s*=\s*[\s\S]*?\n\s*\) : null;\s*/g,
  "\n"
);

// Insert fresh boardOverlay before the LAST return in the component
const marker = "\n  return (";
const idx = s.lastIndexOf(marker);

if (idx === -1) {
  throw new Error("Could not find component return.");
}

const overlay = `
  const boardOverlay =
    justMated || justStalemated ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.42)",
          zIndex: 9999,
          pointerEvents: "none",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            padding: "16px 30px",
            borderRadius: 16,
            background: justMated
              ? "rgba(20,120,40,0.96)"
              : "rgba(170,20,20,0.96)",
            color: "white",
            fontWeight: 900,
            fontSize: 38,
            letterSpacing: 2,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}
        >
          {justMated ? "CHECKMATE" : "STALEMATE"}
        </div>
      </div>
    ) : null;

`;

s = s.slice(0, idx) + overlay + s.slice(idx);

// Remove duplicate boardOverlay props if any
s = s.replace(/\s+boardOverlay=\{boardOverlay\}/g, "");

// Add boardOverlay prop to the first TrainerShell tag
s = s.replace(
  /<TrainerShell\b/,
  `<TrainerShell
      boardOverlay={boardOverlay}`
);

fs.writeFileSync(file, s, "utf8");
console.log("DONE: forced KPK boardOverlay into TrainerShell");