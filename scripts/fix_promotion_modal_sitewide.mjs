import fs from "fs";
import path from "path";

const root = path.join(process.cwd(), "src");

function walk(dir) {
  const files = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(tsx|jsx)$/.test(full)) {
      files.push(full);
    }
  }

  return files;
}

const files = walk(root);
let changed = 0;

for (const file of files) {
  let code = fs.readFileSync(file, "utf8");

  if (!code.includes("<Chessboard")) continue;

  const before = code;

  // Remove any auto-queen promotion we added before
  code = code.replace(/\s*autoPromoteToQueen=\{true\}/g, "");

  // Add modal promotion dialog to every Chessboard that does not already have it
  code = code.replace(/<Chessboard([\s\S]*?)\/>/g, (match) => {
    if (match.includes("promotionDialogVariant")) return match;

    return match.replace(
      /\/>$/,
      `  promotionDialogVariant="modal"\n/>`
    );
  });

  if (code !== before) {
    const backup = file.replace(/\.(tsx|jsx)$/, `.before_promotion_modal_${Date.now()}$&`);
    fs.copyFileSync(file, backup);
    fs.writeFileSync(file, code, "utf8");
    changed++;
    console.log("Updated:", path.relative(process.cwd(), file));
  }
}

console.log("DONE");
console.log(`Files changed: ${changed}`);