import fs from "fs";

const file = "src/AppRouter.tsx";
let s = fs.readFileSync(file, "utf8");

if (!s.includes('import PhilidorTrainer from "./pages/endgames/PhilidorTrainer"')) {
  s = s.replace(
    'import LucenaTrainer from "./pages/endgames/LucenaTrainer"',
    'import LucenaTrainer from "./pages/endgames/LucenaTrainer"\nimport PhilidorTrainer from "./pages/endgames/PhilidorTrainer"'
  );
}

s = s.replace(
  '<Route path="/endgame-studies/philidor" element={<div>Philidor coming soon</div>} />',
  '<Route path="/endgame-studies/philidor" element={<PhilidorTrainer />} />'
);

fs.writeFileSync(file, s);
console.log("DONE: Philidor route connected.");
