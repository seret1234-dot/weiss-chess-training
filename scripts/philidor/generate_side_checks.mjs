import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();

const STOCKFISH =
"C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";

const OUT =
path.join(
  ROOT,
  "public",
  "data",
  "endgames",
  "philidor",
  "chunks"
);

fs.mkdirSync(OUT,{recursive:true});

class Engine {
  constructor() {
    this.proc = spawn(STOCKFISH);
    this.queue = [];
    this.buffer = "";

    this.proc.stdout.on("data",d=>{
      this.buffer += d.toString();
      this.flush();
    });

    this.send("uci");
    this.send("isready");
  }

  send(x){
    this.proc.stdin.write(x+"\n");
  }

  wait(until){
    return new Promise(resolve=>{
      this.queue.push({until,resolve});
      this.flush();
    });
  }

  flush(){
    const q = this.queue[0];
    if(!q) return;

    if(this.buffer.includes(q.until)){
      const txt = this.buffer;
      this.buffer = "";
      this.queue.shift();
      q.resolve(txt);
    }
  }

  async analyse(fen,depth=10){

    this.buffer="";

    this.send("ucinewgame");
    this.send("position fen "+fen);
    this.send("go depth "+depth);

    const out = await Promise.race([
      this.wait("bestmove"),
      new Promise(r=>setTimeout(()=>r("TIMEOUT"),2000))
    ]);

    if(out==="TIMEOUT"){
      this.send("stop");
      return null;
    }

    const best =
      out.match(/bestmove\s+(\S+)/)?.[1] ?? null;

    const scores =
      [...out.matchAll(/score\s+(cp|mate)\s+(-?\d+)/g)];

    const last = scores.at(-1);

    let cp = null;
    let mate = null;

    if(last){
      if(last[1]==="cp") cp = Number(last[2]);
      if(last[1]==="mate") mate = Number(last[2]);
    }

    return {best,cp,mate};
  }

  quit(){
    this.send("quit");
  }
}

function sq(f,r){
  return "abcdefgh"[f]+String(r);
}

function kingDist(a,b){
  return Math.max(
    Math.abs(a.charCodeAt(0)-b.charCodeAt(0)),
    Math.abs(Number(a[1])-Number(b[1]))
  );
}

function fenFromPieces(pieces,side="b"){

  const board =
    Array.from({length:8},()=>Array(8).fill(""));

  for(const [square,piece] of Object.entries(pieces)){

    const file = square.charCodeAt(0)-97;
    const rank = 8-Number(square[1]);

    board[rank][file]=piece;
  }

  const rows = board.map(row=>{

    let out="";
    let empty=0;

    for(const p of row){

      if(!p) empty++;
      else{
        if(empty) out+=empty;
        empty=0;
        out+=p;
      }
    }

    if(empty) out+=empty;

    return out;
  });

  return `${rows.join("/")} ${side} - - 0 1`;
}

function drawish(info){
  return (
    info &&
    info.mate===null &&
    info.cp!==null &&
    Math.abs(info.cp)<=120
  );
}

const engine = new Engine();

const positions = [];

console.log("Generating side checks...");

for(let file=1;file<=6;file++){

  const pawnFile = "abcdefgh"[file];

  for(const pawnRank of [4,5,6]){

    const wp = `${pawnFile}${pawnRank}`;
    const wk = `${pawnFile}${pawnRank+1}`;

    for(const bkFile of [file-1,file,file+1]
      .filter(x=>x>=0 && x<=7)){

      const bk = sq(bkFile,8);

      if(kingDist(wk,bk)<=1) continue;

      for(const sideFile of [0,7]){

        for(const sideRank of [2,3,4]){

          const br = sq(sideFile,sideRank);

          if([wk,wp,bk].includes(br)) continue;

          const wr =
            sideFile===0 ? "h7" : "a7";

          const fen =
            fenFromPieces({
              [wk]:"K",
              [wr]:"R",
              [wp]:"P",
              [bk]:"k",
              [br]:"r",
            },"b");

          const info =
            await engine.analyse(fen,10);

          if(!drawish(info)) continue;
          if(!info.best) continue;

          const rookMove =
            info.best.slice(0,2);

          if(rookMove !== br) continue;

          positions.push({
            id:
              `side_checks_${String(
                positions.length+1
              ).padStart(3,"0")}`,

            fen,
            allowedMoves:[info.best],
            bestmove_uci:info.best,
            result:"draw",
            theme:"side_checks",
            label:"Side Checks",
            explanation:
              "Hold the draw using side-check defense.",
            evalCp:info.cp,
          });

          if(positions.length % 10 === 0){
            console.log(
              "kept:",
              positions.length
            );
          }

          if(positions.length>=90) break;
        }

        if(positions.length>=90) break;
      }

      if(positions.length>=90) break;
    }

    if(positions.length>=90) break;
  }

  if(positions.length>=90) break;
}

engine.quit();

console.log("FINAL:",positions.length);

for(let i=0;i<Math.ceil(positions.length/30);i++){

  const chunk =
    positions.slice(i*30,(i+1)*30);

  fs.writeFileSync(
    path.join(
      OUT,
      `side_checks_chunk_${String(i+1)
        .padStart(3,"0")}.json`
    ),

    JSON.stringify({
      chunkName:`Side Checks ${i+1}`,
      description:"Philidor side checks",
      positions:chunk,
    },null,2)
  );
}

console.log("DONE");
