import fs from "fs";

const file = "src/components/trainer/TrainerShell.tsx";

if (!fs.existsSync(file)) {
  throw new Error("Could not find " + file);
}

let s = fs.readFileSync(file, "utf8");
const original = s;

// 1) Make sure props include boardOverlay
s = s.replace(
  /boardOverlay\?:\s*React\.ReactNode;/,
  "boardOverlay?: React.ReactNode;"
);

if (!s.includes("boardOverlay?: React.ReactNode;")) {
  s = s.replace(
    /boardLeft\?:\s*React\.ReactNode;/,
    `boardLeft?: React.ReactNode;
  boardOverlay?: React.ReactNode;`
  );
}

// 2) Make sure function destructures boardOverlay
if (!/boardOverlay[,}\s]/.test(s.split("function TrainerShell")[1] ?? "")) {
  s = s.replace(
    /boardLeft,/,
    `boardLeft,
  boardOverlay,`
  );
}

// 3) Inject overlay after the Chessboard component if not already rendered
if (!s.includes("{boardOverlay && (")) {
  s = s.replace(
    /(<Chessboard[\s\S]*?\/>)/,
    `$1

          {boardOverlay && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 999,
                pointerEvents: "none",
              }}
            >
              {boardOverlay}
            </div>
          )}`
  );
}

// 4) Ensure the board wrapper is relative
s = s.replace(
  /(<div\s+style=\{\{\s*width:\s*boardSize,\s*height:\s*boardSize,)/,
  `<div style={{
          position: "relative",
          width: boardSize,
          height: boardSize,`
);

fs.writeFileSync(file, s, "utf8");

console.log(s === original ? "No changes made." : "DONE: TrainerShell now renders boardOverlay above the board");
