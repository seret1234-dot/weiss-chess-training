const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const backup = p + ".bak_win_timeout";
fs.writeFileSync(backup, s);

s = s.replaceAll("winTimeout", "WIN_TIMEOUT_MS");

if (!s.includes("const WIN_TIMEOUT_MS")) {
 s = s.replace(
 /const ENGINE_REPLY_DELAY_MS = .*?;/,
 `$&
const WIN_TIMEOUT_MS = 1200;`
 );
}

fs.writeFileSync(p, s);
console.log("DONE patched winTimeout");
console.log("Backup:", backup);
