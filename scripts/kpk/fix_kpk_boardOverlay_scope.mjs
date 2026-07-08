import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// Remove old boardOverlay constants
s = s.replace(
  /\n\s*const boardOverlay\s*=\s*justMated[\s\S]*?\n\s*\) : null;\s*/g,
  "\n"
);

// Insert boardOverlay immediately after phase state, before any returns
s = s.replace(
`  const [phase, setPhase] = useState<"classify" | "play">("play");`,
`  const [phase, setPhase] = useState<"classify" | "play">("play");

  const boardOverlay =
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
          background: "rgba(0,0,0,0.42)",
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

// Remove duplicate props, then add one to TrainerShell
s = s.replace(/\\s+boardOverlay=\\{boardOverlay\\}/g, "");
s = s.replace(
  /<TrainerShell\\b/,
  `<TrainerShell
      boardOverlay={boardOverlay}`
);

// Fix bad encoding
s = s.replaceAll("STALEMATE ? FAIL", "STALEMATE — FAIL");

fs.writeFileSync(file, s, "utf8");
console.log("DONE: boardOverlay defined before render and passed to TrainerShell");
