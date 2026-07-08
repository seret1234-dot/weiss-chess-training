import fs from "fs";
import path from "path";

const root = process.cwd();

const srcDir = path.join(root, "src");
const trainerFile = path.join(srcDir, "trainers", "OppositionTrainer.tsx");

const code = `import KPKTrainer from "./KPKTrainer";

export default function OppositionTrainer() {
  return <KPKTrainer />;
}
`;

fs.mkdirSync(path.dirname(trainerFile), { recursive: true });
fs.writeFileSync(trainerFile, code);

console.log("Created:", trainerFile);
console.log("");
console.log("Now add a route manually:");
console.log("import OppositionTrainer from './trainers/OppositionTrainer';");
console.log("<Route path='/endgames/opposition' element={<OppositionTrainer />} />");