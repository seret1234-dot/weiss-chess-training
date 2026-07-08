import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
  /const boardOverlay = justMated \? \([\s\S]*?\n  \) : null;/,
`const boardOverlay = (justMated || justStalemated) ? (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
        background: "rgba(0,0,0,0.35)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          padding: "14px 24px",
          borderRadius: "14px",
          background: justMated
            ? "rgba(36,110,42,0.94)"
            : "rgba(150,20,20,0.95)",
          border: justMated
            ? "1px solid #7CFF8A"
            : "1px solid #ff8a8a",
          color: "#fff",
          fontWeight: 900,
          fontSize: "30px",
          letterSpacing: 1,
          boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        }}
      >
        {justMated ? "CHECKMATE" : "STALEMATE"}
      </div>
    </div>
  ) : null;`
);

fs.writeFileSync(file, s, "utf8");
console.log("DONE: board overlay now supports stalemate");