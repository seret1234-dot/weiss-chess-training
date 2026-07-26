const fs = require("fs");
const path = require("path");

const distDir = path.join(
  process.cwd(),
  "node_modules",
  "react-chessboard",
  "dist"
);

if (!fs.existsSync(distDir)) {
  throw new Error(`react-chessboard dist directory not found: ${distDir}`);
}

const files = fs
  .readdirSync(distDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(distDir, name));

let changedFiles = 0;

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let updated = original;

  updated = updated.replace(
    /fill:\s*["'](?:#ffffff|#F0E5D2|#E3D7C3)["']/gi,
    'fill: "#F0E5D2"'
  );

  updated = updated.replace(
    /fill:\s*["'](?:#000000|#303234|#4A4C4E|black)["']/gi,
    'fill: "#303234"'
  );

  updated = updated.replace(
    /stroke:\s*["'](?:#000000|#202224|#343638|black)["']/gi,
    'stroke: "#202224"'
  );

  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    changedFiles++;
    console.log(`Restored middle-soft pieces in: ${path.relative(process.cwd(), file)}`);
  }
}

if (changedFiles === 0) {
  console.log("The middle-soft colors were already active.");
}
