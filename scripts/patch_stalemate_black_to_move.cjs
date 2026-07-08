const fs = require("fs");
const path = "src/pages/endgames/StalemateTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

// Force defensive stalemate trainer positions to Black to move.
// The current d1_losing chunks are defensive saves for Black, but many FENs load with "w".
s = s.replace(
`function normalizeFen(fen: string) {
 const trimmed = fen.trim();
 const parts = trimmed.split(/\\s+/);
 if (parts.length === 4) return \`\${trimmed} 0 1\`;
 return trimmed;
}`,
`function normalizeFen(fen: string) {
 const trimmed = fen.trim();
 const parts = trimmed.split(/\\s+/);
 if (parts.length === 4) return \`\${trimmed} 0 1\`;
 return trimmed;
}

function forceBlackToMoveFen(fen: string) {
 const parts = normalizeFen(fen).split(/\\s+/);
 if (parts.length < 6) return fen;
 parts[1] = "b";
 return parts.join(" ");
}`
);

s = s.replace(
` const startFen = normalizeFen(raw.startFen || raw.fen || "");`,
` const startFen = forceBlackToMoveFen(raw.startFen || raw.fen || "");`
);

// Remove any remaining lock that blocks non-black/black incorrectly
s = s.replace(
/\s*\/\/ In Stalemate trainer the user plays White\. Black must auto-reply\.\s*\n\s*if \(game\.turn\(\) !== "b"\) return false;/g,
`\n // Black to move is forced when loading the position.`
);

s = s.replace(
/\s*\/\/ User plays the side to move from the FEN\.\s*\n/g,
`\n // Black to move is forced when loading the position.\n`
);

// Make hint prefer listed solution, not white engine move
s = s.replace(
/function chooseHintMove\(game: Chess, engineInfo: EngineResult \| null\) \{[\s\S]*?return null;\s*\}/,
`function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
 const legalMoves = new Set(getLegalUciMoves(game));

 const listedMoves = currentPosition?.allowedMoves?.length
 ? currentPosition.allowedMoves
 : currentPosition?.solution ?? [];

 const listed = listedMoves.find((uci) => legalMoves.has(uci));
 if (listed) return listed;

 const engineBestMove = engineInfo?.bestMove ?? null;
 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;

 return null;
}`
);

fs.writeFileSync(path, s);
console.log("DONE: forced StalemateTrainer positions to black-to-move");
