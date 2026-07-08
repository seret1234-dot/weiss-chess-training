import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");
const original = s;

// Keep wrong/stalemate visible longer
s = s.replace(
  "const WRONG_DELAY_MS = 1200;",
  "const WRONG_DELAY_MS = 2500;"
);

// Replace existing checkmate-only overlay, if found
s = s.replace(
  /\{justMated && \([\s\S]*?\)\}/,
`{(justMated || justStalemated) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.68)",
                      zIndex: 50,
                      pointerEvents: "none",
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        padding: "18px 30px",
                        borderRadius: 16,
                        background: justMated
                          ? "linear-gradient(180deg,#1f7a1f,#145214)"
                          : "linear-gradient(180deg,#b32020,#5a0000)",
                        color: "white",
                        fontSize: 38,
                        fontWeight: 900,
                        letterSpacing: 2,
                        boxShadow: "0 0 30px rgba(0,0,0,0.55)",
                      }}
                    >
                      {justMated ? "CHECKMATE" : "STALEMATE"}
                    </div>
                  </div>
                )}`
);

// If no overlay existed, inject one directly before the Chessboard component
if (!s.includes('{justMated ? "CHECKMATE" : "STALEMATE"}')) {
  s = s.replace(
    /(<Chessboard[\s\S]*?)/,
`{(justMated || justStalemated) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.68)",
                      zIndex: 50,
                      pointerEvents: "none",
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        padding: "18px 30px",
                        borderRadius: 16,
                        background: justMated
                          ? "linear-gradient(180deg,#1f7a1f,#145214)"
                          : "linear-gradient(180deg,#b32020,#5a0000)",
                        color: "white",
                        fontSize: 38,
                        fontWeight: 900,
                        letterSpacing: 2,
                        boxShadow: "0 0 30px rgba(0,0,0,0.55)",
                      }}
                    >
                      {justMated ? "CHECKMATE" : "STALEMATE"}
                    </div>
                  </div>
                )}

                $1`
  );
}

// Make common board wrapper relative if it is not already
s = s.replace(
  /style=\{\{\s*width: boardWidth,\s*height: boardWidth,/,
  `style={{
                  position: "relative",
                  width: boardWidth,
                  height: boardWidth,`
);

if (s !== original) {
  fs.writeFileSync(file, s, "utf8");
  console.log("DONE: added stalemate/checkmate board overlay");
} else {
  console.log("No changes made.");
}