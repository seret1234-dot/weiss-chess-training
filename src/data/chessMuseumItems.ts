export type MuseumItem = {
 id: string
 title: string
 category: string
 rarity: 1 | 2 | 3 | 4 | 5
 description: string
 youtube?: string
 link?: string
 year?: number
 players?: string[]
 tags: string[]
 funFact?: string
 fen?: string
 pgn?: string
}

export const chessMuseumItems: MuseumItem[] = [
 {
 id: "noah-passed-pawn-queen-trap",
 title: "Passed Pawn Queen Trap By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 4,
 description: "A strange composition with a dangerous passed pawn, queen pressure, and unusual piece placement.",
 link: "https://www.chess.com/analysis/game/pgn/3tDWUGfw5G/analysis",
 fen: "k7/pp6/4nnP1/8/8/5BK1/7R/2q5 w - 0 1",
 tags: ["Noah Weiss", "composition", "passed pawn", "queen trap", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-eighth-rank-rook-battle",
 title: "Eighth Rank Rook Battle By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 4,
 description: "A tactical composition built around doubled rooks on the eighth rank and a crowded king fight.",
 link: "https://www.chess.com/analysis/game/pgn/3mjoEo2wL2/analysis",
 fen: "rRR5/8/4kB2/4bp2/8/8/5PP1/7K b - 0 1",
 tags: ["Noah Weiss", "composition", "rooks", "eighth rank", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-eight-rook-wall",
 title: "Eight Rook Wall By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 description: "A wild board full of black rooks, where the position looks impossible before calculation starts.",
 link: "https://www.chess.com/analysis/game/pgn/MkJ7FbHf4/analysis",
 fen: "rrrrrrrr/1nnb3r/7p/7K/3R4/8/4R3/k7 w - 0 1",
 tags: ["Noah Weiss", "composition", "rooks", "weird", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-bishop-cathedral",
 title: "Bishop Cathedral By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 description: "A fantasy-style composition with a cathedral of bishops surrounding the board.",
 link: "https://www.chess.com/analysis/game/pgn/38xo8t7Yy4/analysis",
 fen: "q7/1k6/8/8/8/3NBRRQ/2PBBBBB/2K2BBB b - 0 1",
 tags: ["Noah Weiss", "composition", "bishops", "fantasy", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-queen-swarm-escape",
 title: "Queen Swarm Escape By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 description: "A chaotic composition where a swarm of black queens surrounds the white king.",
 link: "https://www.chess.com/analysis/game/pgn/2X971nGMmY/analysis",
 fen: "k1qqqqq1/1p1qqqq1/6P1/1RP4K/8/7R/7B/8 w - 0 1",
 tags: ["Noah Weiss", "composition", "queens", "swarm", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-back-rank-army",
 title: "Back Rank Army By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 description: "A huge black back-rank army creates a bizarre tactical challenge for White.",
 link: "https://www.chess.com/analysis/game/pgn/5LxsWcymnW/analysis",
 fen: "rrrrrrrr/1nnbbqqq/8/2P2P2/1K5k/8/R7/6R1 w - 0 1",
 tags: ["Noah Weiss", "composition", "army", "rooks", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-rook-tower",
 title: "Rook Tower By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 4,
 description: "A stacked-rook puzzle with a tower of heavy pieces and a hidden defensive idea.",
 link: "https://www.chess.com/analysis/game/pgn/4HuTmdv81C/analysis",
 fen: "k7/6RR/6RR/6RR/6PP/6PK/6pP/5b2 b - 0 1",
 tags: ["Noah Weiss", "composition", "rook tower", "puzzle"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-mystery-composition-link",
 title: "Mystery Chess Composition By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 3,
 description: "A Noah Weiss composition uploaded as a Chess.com analysis link without a FEN.",
 link: "https://www.chess.com/analysis/game/pgn/4Tmg54MFJn/analysis",
 tags: ["Noah Weiss", "composition", "mystery", "link"],
 funFact: "By Noah Weiss",
 },

 {
 id: "noah-sixth-rank-rook-wall",
 title: "Sixth Rank Rook Wall By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 link: "https://www.chess.com/analysis/game/pgn/3JTxhatL5t/analysis",
 fen: "rRRRRR2/8/7p/7p/7k/7B/6PP/7K b - 0 1",
 tags: ["Noah Weiss", "composition", "rooks", "wall", "puzzle"],
 description: "A bizarre Noah Weiss puzzle with a crowded wall of rooks on the eighth rank and an exposed king.",
 funFact: "The position looks like fantasy chess, but it is stored as a normal legal-analysis puzzle."
 },
 {
 id: "noah-five-queens-rook-mate",
 title: "Five Queens Rook Mate By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 link: "https://www.chess.com/analysis/game/pgn/468c6KQWiS/analysis",
 fen: "rQQQQQ2/4P3/8/8/7k/8/6PP/7K b - 0 1",
 tags: ["Noah Weiss", "composition", "queens", "rook", "mate"],
 description: "A strange puzzle where Black's rook cuts through a line of queens and finishes with checkmate.",
 funFact: "The forced line is 1...Ra1+ 2.Qb1 Rxb1+ 3.Qc1 Rxc1+ 4.Qd1 Rxd1+ 5.Qf1 Rxf1#."
 },
 {
 id: "noah-five-rooks-back-rank",
 title: "Five Rooks Back Rank Puzzle By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 link: "https://www.chess.com/analysis/game/pgn/2CLkGkcGWS/analysis",
 fen: "k7/pp6/8/8/8/8/K7/2rrrrrR w - 0 1",
 tags: ["Noah Weiss", "composition", "rooks", "back rank", "puzzle"],
 description: "A compact impossible-looking composition with five black rooks lined up on the back rank.",
 funFact: "The material looks absurd, but the position is perfect for the Fun Chess museum."
 },
 {
 id: "noah-knight-rook-corner-fight",
 title: "Knight and Rook Corner Fight By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 4,
 link: "https://www.chess.com/analysis/game/pgn/2BowTKboDp/analysis",
 fen: "k7/1p6/4n3/1N3K2/5P2/5b2/8/6rR w - 0 1",
 tags: ["Noah Weiss", "composition", "knight", "rook", "endgame"],
 description: "A sharp Noah Weiss puzzle with a strange corner rook fight and a tactical knight setup.",
 funFact: "Small material, but the piece geometry is very unusual."
 },
 {
 id: "noah-double-rook-seventh-rank",
 title: "Double Rook Seventh Rank By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 4,
 link: "https://www.chess.com/analysis/game/pgn/tmWeYzSbY/analysis",
 fen: "rk6/2RR4/8/8/8/8/5PPP/6K1 b - 0 1",
 tags: ["Noah Weiss", "composition", "rooks", "seventh rank", "puzzle"],
 description: "A clean rook puzzle with two white rooks dominating the seventh rank against a cornered black king.",
 funFact: "The simple material makes the position look normal at first, but the placement is very sharp."
 },

 {
 id: "noah-rook-ladder-mate",
 title: "Rook Ladder Mate By Noah Weiss",
 category: "Noah Weiss Puzzles",
 rarity: 5,
 link: "https://www.chess.com/analysis/game/pgn/cJfmuZwAn/analysis",
 fen: "k7/1p6/1B6/1p6/8/B7/K7/2rrrrrR w - 0 1",
 tags: ["Noah Weiss", "composition", "rooks", "ladder mate", "puzzle"],
 description: "A Noah Weiss composition where White climbs through a wall of black rooks with forcing checks.",
 funFact: "Solution: 1.Rh8+ Rg8 2.Rxg8+ Rf8 3.Rxf8+ Re8 4.Rxe8+ Rd8 5.Rxd8+ Rc8 6.Rxc8#."
 },

 {
 id: "reset-checkmate",
 title: "Reset Checkmate",
 category: "Bizarre Mates",
 rarity: 5,
 youtube: "https://youtu.be/C5JVFCouXIU",
 tags: ["promotion", "checkmate", "aman"],
 description: "Aman Hambleton rebuilt his army by promotion and delivered checkmate with pieces returned to their starting squares.",
 funFact: "It looks impossible, but promotions make it legal."
 },
 {
 id: "seventeen-pawn-moves",
 title: "17 Consecutive Pawn Moves",
 category: "Weird Games",
 rarity: 5,
 youtube: "https://youtu.be/vZ6llDaPm7c",
 tags: ["pawns", "opening", "weird"],
 description: "A strange game famous for an absurd sequence of pawn moves."
 },
 {
 id: "king-forced-mate",
 title: "Forced Mate by the King",
 category: "Strange Mates",
 rarity: 5,
 youtube: "https://youtu.be/r2STfNlyb6s",
 tags: ["king", "mate", "forced"],
 description: "A bizarre forced mate where the king becomes the attacking hero."
 },
 {
 id: "opera-game",
 title: "The Opera Game",
 category: "Immortal Attacks",
 rarity: 5,
 year: 1858,
 players: ["Paul Morphy", "Duke of Brunswick", "Count Isouard"],
 tags: ["morphy", "sacrifice", "classic"],
 description: "Morphy sacrifices material and finishes with a beautiful mate.",
 pgn: "[Event \"Opera Game\"]\n[Site \"Paris\"]\n[Date \"1858.??.??\"]\n[White \"Paul Morphy\"]\n[Black \"Duke of Brunswick / Count Isouard\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5\n6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5\n11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6\n15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0",
 fen: "1n1Rkb1r/p4ppp/4q3/6B1/4P3/8/PPP2PPP/2K5 b k - 1 17",
 funFact: "One of the most famous attacking games ever played."
 },
 {
 id: "rook-army-position",
 title: "Rook Army Puzzle By Noah Weiss",
 category: "Impossible Positions",
 rarity: 5,
 link: "https://www.chess.com/analysis/game/pgn/5jYhsybEvi/analysis",
 fen: "2k5/5R1K/8/5rr1/5rr1/5rr1/5rr1/4Rrr1 w - 0 1",
 tags: ["rooks", "promotion", "weird", "puzzle"],
 description: "A bizarre position where Black has a wall of promoted rooks, but the position is still a chess puzzle instead of normal material logic.",
 funFact: "This is exactly the kind of impossible-looking position that belongs in Fun Chess."
 },
 {
 id: "mikhail-tal-puzzle",
 title: "The Puzzle Only Mikhail Tal Cracked",
 category: "Famous Puzzles",
 rarity: 5,
 youtube: "https://youtu.be/QcqaHzM1XJU",
 tags: ["tal", "puzzle", "calculation", "legendary"],
 description: "A legendary puzzle associated with Mikhail Tal, famous for its strange and difficult solution.",
 funFact: "Tal was famous for finding impossible-looking tactical ideas."
 },
 {
 id: "brilliant-moves-record",
 title: "42 Brilliant Moves in a Row",
 category: "Engine Madness",
 rarity: 5,
 youtube: "https://youtu.be/s4aLIoNJhzs",
 tags: ["brilliant", "engine", "record", "weird"],
 description: "A ridiculous chess curiosity built around an absurd chain of brilliant moves.",
 funFact: "This belongs in Fun Chess because it pushes chess-engine annotations into comedy territory."
 },
 {
 id: "forced-mate-11-no-queen",
 title: "Forced Mate in 11 With No Queen",
 category: "Strange Mates",
 rarity: 5,
 youtube: "https://youtu.be/EhL216R1wJo",
 tags: ["mate", "forced", "no queen", "calculation"],
 description: "A spectacular forced checkmate sequence without a queen.",
 funFact: "A good example of how coordination can matter more than material."
 },
 {
 id: "super-gm-9-move-win",
 title: "Super GM Beaten in 9 Moves",
 category: "Miniatures",
 rarity: 5,
 youtube: "https://youtu.be/RLKnBihNE9U",
 tags: ["miniature", "super-gm", "brilliant", "opening"],
 description: "A shocking miniature where a super grandmaster loses in only nine moves.",
 funFact: "Short games between elite players are rare because one opening mistake can decide everything."
 },
 {
 id: "fun-chess-p0omnamnshu",
 title: "19 Brilliant Moves IN A ROW",
 category: "Engine Madness",
 rarity: 5,
 youtube: "https://youtu.be/P0oMNaMNshU",
 tags: ["brilliant", "engine", "record", "gotham"],
 description: "A ridiculous chess game or puzzle sequence featuring nineteen brilliant moves in a row.",
 funFact: "This is the kind of engine-annotation absurdity that fits perfectly in Fun Chess."
 },
 {
 id: "fun-chess-qgiai89bgs8",
 title: "He Checkmated with Castling",
 category: "Strange Mates",
 rarity: 5,
 youtube: "https://youtu.be/QgiAI89BGS8",
 tags: ["castling", "checkmate", "morphy", "weird"],
 description: "A strange and beautiful chess curiosity where castling is used as the checkmating move.",
 funFact: "Castling checkmate is one of the rarest and most memorable legal mates in chess."
 },
 {
 id: "promotion-maze-by-noah-weiss",
 title: "Promotion Maze Puzzle By Noah Weiss",
 category: "Impossible Positions",
 rarity: 5,
 link: "https://www.chess.com/analysis/game/pgn/dyddMq9Pt/analysis",
 fen: "8/b3P3/2B5/8/1PP1p1b1/rPKPp1k1/1PPp2N1/8 b - 0 1",
 tags: ["noah-weiss", "promotion", "impossible", "puzzle"],
 description: "A strange composed-looking position by Noah Weiss, full of advanced pawns, promoted material and unusual tactical possibilities.",
 funFact: "This position looks almost illegal at first glance, which makes it perfect for Fun Chess."
 },
 {
 id: "craziest-opening-ever-seen",
 title: "A Crazy Opening Experiment",
 category: "Funny Openings",
 rarity: 4,
 youtube: "https://youtu.be/fDPIHH9o1dM",
 tags: ["opening", "weird", "funny", "creative"],
 description: "A wild and unusual opening idea that belongs in the fun chess collection.",
 funFact: "Some opening experiments look ridiculous, but still create real practical problems."
 },








 {
 id: "all-8-pawns-sacrificed",
 title: "All 8 Pawns Sacrificed and Still Won",
 category: "Impossible Material",
 description:
 "A wild game where all eight pawns are sacrificed and the player still manages to win.",
 rarity: 5,
 youtube: "https://youtu.be/M_SyF84PpGo",
 tags: ["sacrifice", "weird", "impossible-material", "viral", "youtube"],
 funFact: "The fun idea is that one side gives up every pawn and still survives the chaos.",
 },

 {
 id: "two-knights-stronger-than-queen",
 title: "Two Knights Stronger Than a Queen",
 category: "Impossible Material",
 rarity: 5,
 youtube: "https://youtu.be/qqymN6xR6yI",
 tags: ["knights", "queen", "material", "weird", "youtube"],
 description: "A strange chess curiosity where two knights become more dangerous than a queen.",
 funFact: "Knights can look weak alone, but together they can create impossible forks and mating nets."
 },
]

export const museumCategories = Array.from(new Set(chessMuseumItems.map((item) => item.category)))




