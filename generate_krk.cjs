const fs = require("fs")

const files = "abcdefgh"

function sq(file, rank) {
  return files[file] + (rank + 1)
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomSquare(area) {
  if (area === "edge") {
    const side = rand(0,3)
    if (side === 0) return sq(rand(0,7), 0)
    if (side === 1) return sq(rand(0,7), 7)
    if (side === 2) return sq(0, rand(0,7))
    return sq(7, rand(0,7))
  }

  if (area === "rank7") return sq(rand(0,7), 6)
  if (area === "rank6") return sq(rand(0,7), 5)

  // center
  return sq(rand(2,5), rand(2,5))
}

function farFrom(square) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1

  const options = []
  for (let f=0; f<8; f++) {
    for (let r=0; r<8; r++) {
      const dist = Math.max(Math.abs(f-file), Math.abs(r-rank))
      if (dist >= 2) options.push(sq(f,r))
    }
  }

  return options[rand(0, options.length-1)]
}

function generate(area, label) {
  const positions = []

  for (let i=0;i<10;i++) {
    const bk = randomSquare(area)
    const wk = farFrom(bk)
    const wr = farFrom(wk)

    const fen = `8/8/8/8/8/8/8/8 w - - 0 1`
      .replace("8/8/8/8/8/8/8/8",
        placePieces(wk, wr, bk)
      )

    positions.push({
      fen,
      tag: label
    })
  }

  return positions
}

function placePieces(wk, wr, bk) {
  const board = Array.from({length:8}, ()=>Array(8).fill(""))

  function put(sq,piece){
    const f = sq.charCodeAt(0)-97
    const r = Number(sq[1])-1
    board[7-r][f] = piece
  }

  put(wk,"K")
  put(wr,"R")
  put(bk,"k")

  return board.map(rank=>{
    let row=""
    let empty=0
    for(const sq of rank){
      if(!sq) empty++
      else{
        if(empty){ row+=empty; empty=0 }
        row+=sq
      }
    }
    if(empty) row+=empty
    return row
  }).join("/")
}

const data = {
  groups: []
}

for (let mate=1; mate<=10; mate++) {
  data.groups.push({
    mateIn: mate,
    positions: generate("edge", "mate")
  })
}

data.groups.push({
  label: "rank7",
  positions: generate("rank7", "rank7")
})

data.groups.push({
  label: "rank6",
  positions: generate("rank6", "rank6")
})

data.groups.push({
  label: "center",
  positions: generate("center", "center")
})

fs.writeFileSync("krk_generated.json", JSON.stringify(data,null,2))
console.log("KRK positions generated.")