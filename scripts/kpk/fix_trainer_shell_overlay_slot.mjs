import fs from "fs";

const file = "src/components/trainer/TrainerShell.tsx";
let s = fs.readFileSync(file, "utf8");

// Add prop type
if (!s.includes("boardOverlay?: React.ReactNode")) {
  s = s.replace(
    /boardLeft\?: React\.ReactNode;/,
    `boardLeft?: React.ReactNode;
  boardOverlay?: React.ReactNode;`
  );
}

// Destructure
if (!s.includes("boardOverlay,")) {
  s = s.replace(
    /boardLeft,/,
    `boardLeft,
  boardOverlay,`
  );
}

// Render overlay inside the board area, after Chessboard
if (!s.includes("{boardOverlay}")) {
  s = s.replace(
    /(<Chessboard[\s\S]*?\/>)/,
    `$1
          {boardOverlay && (
            <div style={{
              position: "absolute",
              inset: 0,
              zIndex: 9999,
              pointerEvents: "none",
            }}>
              {boardOverlay}
            </div>
          )}`
  );
}

// Make board wrapper relative
s = s.replace(
  /position:\s*"relative",/g,
  `position: "relative",`
);

if (!s.includes("position: \"relative\"")) {
  s = s.replace(
    /style=\{\{/,
    `style={{
          position: "relative",`
  );
}

fs.writeFileSync(file, s, "utf8");
console.log("DONE: TrainerShell renders boardOverlay");
