const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const backup = p + ".bak_with_timeout";
fs.writeFileSync(backup, s);

if (!s.includes("function withTimeout(")) {
 s = s.replace(
`function sleep(ms: number) {
 return new Promise((resolve) => window.setTimeout(resolve, ms));
}`,
`function sleep(ms: number) {
 return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
 return new Promise((resolve) => {
 const timer = window.setTimeout(() => resolve(fallback), ms);

 promise
 .then((value) => {
 window.clearTimeout(timer);
 resolve(value);
 })
 .catch(() => {
 window.clearTimeout(timer);
 resolve(fallback);
 });
 });
}`
 );
}

fs.writeFileSync(p, s);
console.log("DONE added withTimeout helper");
console.log("Backup:", backup);
