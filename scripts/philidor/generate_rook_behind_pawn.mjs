import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const STOCKFISH = "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";
const OUT = path.join(ROOT, "public", "data", "endgames", "philidor", "chunks");
fs.mkdirSync(OUT,{recursive:true});

class Engine {
  constructor(){ this.proc=spawn(STOCKFISH); this.q=[]; this.b=""; this.proc.stdout.on("data",d=>{this.b+=d.toString();this.flush();}); this.send("uci"); this.send("isready"); }
  send(x){ this.proc.stdin.write(x+"\n"); }
  wait(u){ return new Promise(r=>{this.q.push({u,r});this.flush();}); }
  flush(){ const w=this.q[0]; if(w&&this.b.includes(w.u)){ const t=this.b; this.b=""; this.q.shift(); w.r(t); } }
  async analyse(fen,depth=10){ this.b=""; this.send("ucinewgame"); this.send("position fen "+fen); this.send("go depth "+depth); const out=await Promise.race([this.wait("bestmove"),new Promise(r=>setTimeout(()=>r("TIMEOUT"),2000))]); if(out==="TIMEOUT"){this.send("stop");return null;} const best=out.match(/bestmove\s+(\S+)/)?.[1]??null; const scores=[...out.matchAll(/score\s+(cp|mate)\s+(-?\d+)/g)]; const last=scores.at(-1); let cp=null,mate=null; if(last){ if(last[1]==="cp") cp=Number(last[2]); if(last[1]==="mate") mate=Number(last[2]); } return {best,cp,mate}; }
  quit(){ this.send("quit"); }
}

function sq(f,r){return "abcdefgh"[f]+String(r);}
function kingDist(a,b){return Math.max(Math.abs(a.charCodeAt(0)-b.charCodeAt(0)),Math.abs(Number(a[1])-Number(b[1])));}
function fenFromPieces(pieces,side="b"){const board=Array.from({length:8},()=>Array(8).fill("")); for(const [s,p] of Object.entries(pieces)){const f=s.charCodeAt(0)-97; const r=8-Number(s[1]); board[r][f]=p;} return board.map(row=>{let o="",e=0; for(const p of row){if(!p)e++;else{if(e)o+=e;e=0;o+=p;}} if(e)o+=e; return o;}).join("/")+` ${side} - - 0 1`;}
function drawish(i){return i&&i.mate===null&&i.cp!==null&&Math.abs(i.cp)<=140;}

const engine = new Engine();
const positions = [];

console.log("Generating rook behind pawn...");

for(let file=1;file<=6;file++){
  const pf="abcdefgh"[file];

  for(const pawnRank of [4,5,6]){
    const wp=`${pf}${pawnRank}`;
    const wk=`${pf}${Math.min(7,pawnRank+1)}`;

    for(const bkFile of [file-1,file,file+1].filter(x=>x>=0&&x<=7)){
      const bk=sq(bkFile,8);
      if(kingDist(wk,bk)<=1) continue;

      for(const brRank of [1,2,3]){
        const br=`${pf}${brRank}`;
        if([wk,wp,bk].includes(br)) continue;

        for(const wrFile of [0,7]){
          for(const wrRank of [5,6,7,8]){
            const wr=sq(wrFile,wrRank);
            if([wk,wp,bk,br].includes(wr)) continue;

            const fen=fenFromPieces({[wk]:"K",[wr]:"R",[wp]:"P",[bk]:"k",[br]:"r"},"b");
            const info=await engine.analyse(fen,10);

            if(!drawish(info)) continue;
            if(!info.best) continue;

            positions.push({
              id:`rook_behind_pawn_${String(positions.length+1).padStart(3,"0")}`,
              fen,
              allowedMoves:[info.best],
              bestmove_uci:info.best,
              result:"draw",
              theme:"rook_behind_pawn",
              label:"Rook Behind Pawn",
              explanation:"Hold the draw with the rook behind the passed pawn.",
              evalCp:info.cp
            });

            if(positions.length%10===0) console.log("kept:",positions.length);
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
  if(positions.length>=90) break;
}

engine.quit();
console.log("FINAL:",positions.length);

for(let i=0;i<Math.ceil(positions.length/30);i++){
  const chunk=positions.slice(i*30,(i+1)*30);
  fs.writeFileSync(path.join(OUT,`rook_behind_pawn_chunk_${String(i+1).padStart(3,"0")}.json`),JSON.stringify({chunkName:`Rook Behind Pawn ${i+1}`,description:"Philidor rook behind pawn defense",positions:chunk},null,2));
}

console.log("DONE");
