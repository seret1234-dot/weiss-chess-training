import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "public", "data", "endgames", "kpk");
const CHUNKS_DIR = path.join(OUT_DIR, "chunks");

const CHUNK_SIZE = 30;

const SUBJECTS = [
  { id: "basic-win", name: "Basic Win", chunks: 10, goal: "win" },
  { id: "opposition", name: "Opposition", chunks: 10, goal: "win" },
  { id: "key-squares", name: "Key Squares", chunks: 10, goal: "win" },
{ id: "rook-pawn-draw", name: "Rook Pawn Draw", chunks: 7, goal: "draw" },
  { id: "wrong-turn-draw", name: "Wrong Turn Draw", chunks: 8, goal: "draw" },
  { id: "mixed", name: "Mixed KPK", chunks: 12, goal: "mixed" },
];

const files = [];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function square(file, rank) {
  return `${"abcdefgh"[file]}${rank}`;
}

function kingsTouch(wkFile, wkRank, bkFile, bkRank) {
  return Math.abs(wkFile - bkFile) <= 1 && Math.abs(wkRank - bkRank) <= 1;
}

function sameSquare(a, b) {
  return a === b;
}

function makeFen({ wk, wp, bk, turn }) {
  const board = Array.from({ length: 8 }, () => Array(8).fill("1"));

  function put(sq, piece) {
    const file = "abcdefgh".indexOf(sq[0]);
    const rank = Number(sq[1]);
    board[8 - rank][file] = piece;
  }

  put(wk, "K");
  put(wp, "P");
  put(bk, "k");

  const rows = board.map((row) => {
    let out = "";
    let empty = 0;

    for (const cell of row) {
      if (cell === "1") {
        empty++;
      } else {
        if (empty) out += String(empty);
        empty = 0;
        out += cell;
      }
    }

    if (empty) out += String(empty);
    return out;
  });

  return `${rows.join("/")} ${turn} - - 0 1`;
}

function isLegalBasic({ wk, wp, bk }) {
  if (sameSquare(wk, wp) || sameSquare(wk, bk) || sameSquare(wp, bk)) return false;

  const wkFile = "abcdefgh".indexOf(wk[0]);
  const wkRank = Number(wk[1]);
  const bkFile = "abcdefgh".indexOf(bk[0]);
  const bkRank = Number(bk[1]);
  const wpRank = Number(wp[1]);

  if (wpRank <= 1 || wpRank >= 8) return false;
  if (kingsTouch(wkFile, wkRank, bkFile, bkRank)) return false;

  return true;
}

function addPosition(list, pos) {
  if (!isLegalBasic(pos)) return;

  const fen = makeFen(pos);
  if (list.some((p) => p.fen === fen)) return;

  list.push({
    id: `${pos.subjectId}_${String(list.length + 1).padStart(4, "0")}`,
    subjectId: pos.subjectId,
    subjectName: pos.subjectName,
    goal: pos.goal,
    fen,
    sideToMove: pos.turn,
    explanation: pos.explanation,
  });
}

function buildSubject(subject) {
  const positions = [];

  const pawns =
    subject.id === "rook-pawn-draw"
      ? [
          ["a", 2],
          ["a", 3],
          ["a", 4],
          ["a", 5],
          ["a", 6],
          ["h", 2],
          ["h", 3],
          ["h", 4],
          ["h", 5],
          ["h", 6],
        ]
      : [
          ["b", 2],
          ["b", 3],
          ["b", 4],
          ["b", 5],
          ["b", 6],
          ["c", 2],
          ["c", 3],
          ["c", 4],
          ["c", 5],
          ["c", 6],
          ["d", 2],
          ["d", 3],
          ["d", 4],
          ["d", 5],
          ["d", 6],
          ["e", 2],
          ["e", 3],
          ["e", 4],
          ["e", 5],
          ["e", 6],
          ["f", 2],
          ["f", 3],
          ["f", 4],
          ["f", 5],
          ["f", 6],
          ["g", 2],
          ["g", 3],
          ["g", 4],
          ["g", 5],
          ["g", 6],
        ];

  for (const [fileLetter, rank] of pawns) {
    const pf = "abcdefgh".indexOf(fileLetter);
    const wp = square(pf, rank);

    for (let wkDf = -2; wkDf <= 2; wkDf++) {
      for (let wkDr = -2; wkDr <= 2; wkDr++) {
        const wkFile = pf + wkDf;
        const wkRank = rank + wkDr;

        if (wkFile < 0 || wkFile > 7 || wkRank < 1 || wkRank > 8) continue;

        for (let bkDf = -2; bkDf <= 2; bkDf++) {
          for (let bkDr = 1; bkDr <= 4; bkDr++) {
            const bkFile = pf + bkDf;
            const bkRank = rank + bkDr;

            if (bkFile < 0 || bkFile > 7 || bkRank < 1 || bkRank > 8) continue;

            const wk = square(wkFile, wkRank);
            const bk = square(bkFile, bkRank);

            let accept = false;
            let explanation = "";

            if (subject.id === "basic-win") {
              accept = wkRank > rank && Math.abs(wkFile - pf) <= 1 && bkRank >= rank + 2;
              explanation = "Use the king to escort the pawn and keep the enemy king cut off.";
            }

            if (subject.id === "opposition") {
              accept =
                Math.abs(wkFile - bkFile) <= 1 &&
                Math.abs(wkRank - bkRank) === 2 &&
                rank <= 5;
              explanation = "Train direct and distant opposition to force the king forward.";
            }

            if (subject.id === "key-squares") {
              accept =
                rank <= 5 &&
                wkRank >= rank + 1 &&
                wkRank <= rank + 3 &&
                Math.abs(wkFile - pf) <= 1;
              explanation = "Reach or control the key squares in front of the pawn.";
            }

            if (subject.id === "rook-pawn-draw") {
              const cornerFile = pf === 0 ? 0 : 7;
              accept =
                pf === cornerFile &&
                bkFile === cornerFile &&
                bkRank >= rank + 2 &&
                wkRank <= rank + 1;
              explanation = "Rook-pawn positions often draw when the defender reaches the corner.";
            }

            if (subject.id === "wrong-turn-draw") {
              accept =
                rank <= 5 &&
                Math.abs(wkFile - bkFile) <= 1 &&
                Math.abs(wkRank - bkRank) === 2;
              explanation = "The same shape can win or draw depending on whose turn it is.";
            }

            if (subject.id === "mixed") {
              accept =
                (wkRank > rank && Math.abs(wkFile - pf) <= 1) ||
                Math.abs(wkRank - bkRank) === 2 ||
                bkRank >= rank + 2;
              explanation = "Mixed KPK test: decide whether to win, draw, use opposition, or race.";
            }

            if (!accept) continue;

            const turns =
              subject.id === "wrong-turn-draw" || subject.id === "mixed"
                ? ["w", "b"]
                : ["w"];

            for (const turn of turns) {
              addPosition(positions, {
                wk,
                wp,
                bk,
                turn,
                subjectId: subject.id,
                subjectName: subject.name,
                goal: subject.goal,
                explanation,
              });
            }
          }
        }
      }
    }
  }

  const needed = subject.chunks * CHUNK_SIZE;
  return positions.slice(0, needed);
}

function writeChunks() {
  ensureDir(CHUNKS_DIR);

  fs.rmSync(CHUNKS_DIR, { recursive: true, force: true });
  ensureDir(CHUNKS_DIR);

  let globalChunk = 1;

  for (const subject of SUBJECTS) {
    const positions = buildSubject(subject);
    const needed = subject.chunks * CHUNK_SIZE;

    if (positions.length < needed) {
      throw new Error(
        `${subject.id} only generated ${positions.length}, needed ${needed}`
      );
    }

    for (let i = 0; i < subject.chunks; i++) {
      const chunkPositions = positions.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const fileName = `chunk_${String(globalChunk).padStart(3, "0")}.json`;
      const relPath = `chunks/${fileName}`;

      const chunk = {
        id: `kpk_${subject.id}_${String(i + 1).padStart(2, "0")}`,
        course: "endgame",
        theme: "kpk",
        subjectId: subject.id,
        subjectName: subject.name,
        subjectChunkNumber: i + 1,
        subjectTotalChunks: subject.chunks,
        globalChunkNumber: globalChunk,
        goal: subject.goal,
        positions: chunkPositions,
      };

      fs.writeFileSync(
        path.join(CHUNKS_DIR, fileName),
        JSON.stringify(chunk, null, 2)
      );

      files.push({
        id: chunk.id,
        path: relPath,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectChunkNumber: i + 1,
        subjectTotalChunks: subject.chunks,
        globalChunkNumber: globalChunk,
        positionCount: chunkPositions.length,
        goal: subject.goal,
      });

      globalChunk++;
    }
  }

  const progression = {
    course: "endgame",
    theme: "kpk",
    title: "KPK — King and Pawn vs King",
    description: "King and pawn versus king training by subject.",
    chunkSize: CHUNK_SIZE,
    totalChunks: files.length,
    totalPositions: files.length * CHUNK_SIZE,
    subjects: SUBJECTS.map((s) => ({
      id: s.id,
      name: s.name,
      chunks: s.chunks,
      goal: s.goal,
    })),
    files,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "progression.json"),
    JSON.stringify(progression, null, 2)
  );

  console.log("DONE");
  console.log(`Output: ${OUT_DIR}`);

  for (const subject of SUBJECTS) {
    console.log(`${subject.id}: ${subject.chunks} chunks`);
  }

  console.log(`Total chunks: ${files.length}`);
  console.log(`Total positions: ${files.length * CHUNK_SIZE}`);
}

writeChunks();