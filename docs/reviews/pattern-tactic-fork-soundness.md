# Pattern Tactic fork soundness-v3 review

Generated locally with Stockfish 18 at fixed depth 12. The 14 MB detailed JSON remains untracked; regenerate it with `npm run audit:pattern-tactic-fork-soundness`.

| Course | Geometric | Sound | Checking | Non-checking | Capturable sound | Chunks | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| pawn-fork M1 | 133 | 32 | 73 | 60 | 0 | 2 | Source-limited |
| pawn-fork M2 | 296 | 89 | 130 | 166 | 3 | 5 | Source-limited |
| pawn-fork M3 | 135 | 15 | 44 | 91 | 1 | 1 | Source-limited |
| pawn-fork M4 | 83 | 8 | 44 | 39 | 0 | 1 | Source-limited |
| bishop-fork M1 | 147 | 42 | 118 | 29 | 1 | 3 | Source-limited |
| bishop-fork M2 | 300 | 187 | 255 | 45 | 0 | 8 | Active |
| bishop-fork M3 | 104 | 20 | 70 | 34 | 1 | 1 | Source-limited |
| bishop-fork M4 | 67 | 13 | 54 | 13 | 2 | 1 | Source-limited |
| knight-fork M1 | 182 | 107 | 148 | 34 | 3 | 5 | Active |
| knight-fork M2 | 300 | 270 | 268 | 32 | 0 | 8 | Active |
| knight-fork M3 | 163 | 93 | 120 | 43 | 0 | 5 | Source-limited |
| knight-fork M4 | 138 | 67 | 109 | 29 | 3 | 4 | Source-limited |
| rook-fork M1 | 102 | 37 | 87 | 15 | 1 | 2 | Source-limited |
| rook-fork M2 | 300 | 172 | 286 | 14 | 4 | 8 | Active |
| rook-fork M3 | 55 | 12 | 44 | 11 | 0 | 1 | Source-limited |
| rook-fork M4 | 73 | 11 | 64 | 9 | 1 | 1 | Source-limited |
| queen-fork M1 | 189 | 77 | 166 | 23 | 0 | 4 | Source-limited |
| queen-fork M2 | 300 | 268 | 282 | 18 | 0 | 8 | Active |
| queen-fork M3 | 167 | 54 | 143 | 24 | 0 | 3 | Source-limited |
| queen-fork M4 | 154 | 46 | 138 | 16 | 0 | 3 | Source-limited |
| king-fork M1 | 88 | 34 | 2 | 86 | 0 | 2 | Source-limited |
| king-fork M3 | 8 | 2 | 0 | 8 | 0 | 0 | Unavailable |
| king-fork M4 | 5 | 0 | 0 | 5 | 0 | 0 | Unavailable |

## UNSOUND_FORK_PIECE_CAPTURED_SAFELY

| Theme/stage | FEN | Stored line | Best defense | Material result | PV | Learner explanation |
|---|---|---|---|---|---|---|
| pawn-fork M1 | 8/5qk1/6p1/Q7/4pp2/8/PPPr1KP1/7R w - - 2 30 | e4e3 | d2e3 | -2 | d2e3 f4e3 f2e3 g6g5 h1e1 f7f4 e3d3 f4g3 e1e3 g3g2 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | r6r/p2k4/2pb1p2/1p1p4/3P4/P1P2Npp/1P3PN1/4RR1K w - - 0 27 | g3g2 | h1g1 | -1 | h1g1 g2f1q e1f1 a8g8 g1h1 h8h5 h4f5 h5f5 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | 8/5p2/4p1k1/8/3Q2K1/6P1/7r/8 w - - 2 47 | f7f5 | g4f3 | -2 | g4f3 f5e4 f3e4 h2c2 e4e5 c2e2 e5d4 e2g2 d4e5 g2g3 e5e6 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | 2b1r1k1/2Q2pb1/2PPp1pp/2q5/2p5/P5P1/5PBP/5RK1 b - - 0 29 | d6d7 | c8d7 | -12 | c8d7 c6d7 c5c7 d7e8q g8g7 e8c6 c7c6 g2c6 e5b2 c6a4 g7f6 h2h4 b2a3 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | r4q2/p3b2k/1pp1pnPP/3rN3/8/P2b4/1P2QP2/5K1R b - - 0 30 | g6g7 | f8g7 | -7 | f8g7 h6g7 h8g7 h1g1 g7f8 e5d3 a8d8 d3f4 d5d1 f1g2 d1g1 g2g1 d8d6 f4e6 f8f7 e6g5 f7e8 e2f3 f6d5 f3f7 e8d7 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | 8/8/p4Qpp/2p1p3/1p4kP/1P6/P4PK1/4q3 b - - 2 47 | f2f3 | e4f3 | -2 | e4f3 f6f3 g4h4 f3f6 h4g4 f6g6 g4f4 g2f2 e5e4 g6h6 f4g4 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | r5k1/bbpq1Npp/p1np4/1p2P3/3P2n1/8/PP3PPP/RNBQR1K1 b - - 0 15 | e5e6 | d7e6 | -6 | d7e6 e1e6 h7h5 c1e3 c6d4 e3d4 a7d4 e6e2 g4f2 e2f2 f7g8 d1d4 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | 5r2/3b1kp1/4p3/1p1nRP2/p1p5/6PB/1P1B3P/6K1 b - - 0 34 | f5e6 | d7e6 | -4 | d7e6 h3e6 e8e6 e5d5 e6e2 d5f5 f7e6 f5f2 e2e4 g1f1 e4e5 h2h4 e6d5 d2c3 e5e3 f2f5 d5c6 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | r1bq1rk1/pppn1pbp/3p2p1/3Pp3/2PnP3/2NBBN1P/PP3PP1/R2QK2R w KQ - 1 10 | e5d4 | e3d4 | -4 | e3d4 g7d4 d1d2 d8f6 a1c1 a7a6 d3c2 d4c3 b2c3 b7b6 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |
| pawn-fork M1 | Q7/2p2pk1/4p1p1/4q3/7p/4B1PP/P4R1K/3r4 w - - 2 31 | h4g3 | h2g2 | -6 | h2g2 g3f2 f3d1 e5e3 d1c2 g7g8 c2f2 e3e4 g2g1 | a legal immediate capture of the forking piece is not refuted by forced mate or a two-pawn-equivalent gain |

## UNSOUND_TARGETS_ESCAPE

| Theme/stage | FEN | Stored line | Best defense | Material result | PV | Learner explanation |
|---|---|---|---|---|---|---|
| pawn-fork M1 | 8/1p4rk/1b1p1p2/1Pp1p2p/2B1Pn1r/2PP2N1/R4PP1/4RK2 b - - 7 28 | f2g3 | h4h1 | -9 | h4h1 f1f2 f4d3 c4d3 c5c4 f2e2 c4d3 e2d2 h1e1 d2e1 f6f5 e4f5 e5e4 a2a8 b6g1 a8d8 g1h2 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M1 | r4rk1/2pb1ppp/p2p4/P7/1RPNP1n1/8/3N1PPP/1R4K1 w - - 1 21 | c7c5 | b4b7 | -6 | b4b7 d7c8 b7b6 c5d4 b6d6 c8e6 f2f4 f8d8 c4c5 g8f8 h2h3 g4e3 f4f5 d8d6 c5d6 e6d7 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M1 | 8/8/3n4/4kpp1/8/4NK1P/6P1/8 w - - 4 61 | f5f4 | g3f3 | -1 | g3f3 f4e3 f3e3 d6f5 e3f3 f5h4 f3g3 e5f6 g3f2 f6f5 f2f1 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M1 | rn2r1k1/1pq1bp1p/p2pNPp1/2p5/8/1P1BP3/PBPP2bP/RN3RK1 b - - 1 14 | f6f7 | g8f8 | -6 | g8f8 b2g7 f8g7 f7e8n g7h6 e8c7 g2f1 d3f1 e7f6 b1c3 a8a7 c7e6 b7b6 e6f4 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M1 | 2br1r2/1pp3kp/p3P1p1/8/2B3P1/7P/PP6/4RRK1 b - - 0 24 | e6e7 | f8f1 | -5 | f8f1 e1f1 d8e8 f1f7 g7h6 c4d5 c8d7 h3h4 c7c5 d5f3 g6g5 h4h5 d7e6 f7f6 h6g7 f6e6 g7g8 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M1 | r4n1r/ppkn2R1/2p1PP2/3p1B2/3P1K2/1PP4P/P7/8 b - - 0 41 | e6e7 | f8e6 | -1 | f8e6 f5e6 d8e8 f4g5 c7d6 e6f5 c6c5 b3b4 c5b4 c3b4 a7a6 h3h4 b7b6 f5g6 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M1 | 4k2r/1b2Bpb1/p2p2p1/1p4Qp/2q1P2P/n1N2P2/KPP3P1/3R3R w k - 2 23 | b5b4 | a3a4 | -4 | a3a4 g7h6 b2b3 c4c3 e7d6 b7c6 a4a5 h6g5 h4g5 f7f6 a5b6 e8f7 d6c5 f6g5 d1d6 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M2 | 8/1pp5/1pn2k1p/8/3P4/4PBP1/4K3/8 b - - 4 30 | d4d5 e6d6 d5c6 | e6d6 | -1 | e6d6 d5c6 b7c6 f3h1 c6c5 e2d3 b6b5 d3c3 c7c6 h1g2 d6c7 g2f3 c7d6 f3h1 d6c7 c3d3 c5c4 d3c3 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M2 | 1r4k1/2R3p1/1pBp2rp/3P2P1/5R1K/3q1p2/1Q3P1P/8 w - - 0 36 | h6g5 h4h5 g6h6 | h4h5 | -13 | h4h5 g6h6 h5g4 d3g6 c7g7 g6g7 d4g7 g8g7 f4f3 h6h2 g4g5 b6b5 f3e3 b5b4 e3e7 g7f8 e7d7 b4b3 d7d6 | best defense can neutralize the fork without a verified material gain or mate |
| pawn-fork M2 | r3r1k1/1pq2ppp/p2bp3/2p1N3/P2nR3/3P3P/1PP2PPB/R2Q2K1 w - - 1 19 | f7f5 h2d6 c7d6 | h2d6 | -6 | h2d6 c7d6 e4d4 c5d4 g4h2 e6e5 d1h5 d6f6 h2f3 a8d8 a1e1 | best defense can neutralize the fork without a verified material gain or mate |

## UNSOUND_COUNTERTACTIC

| Theme/stage | FEN | Stored line | Best defense | Material result | PV | Learner explanation |
|---|---|---|---|---|---|---|
| knight-fork M1 | 1r1q2k1/5pp1/4p2p/1PppNn2/3p1Q2/8/2P2PPP/1R4K1 b - - 3 25 | e5c6 | b8b5 | -13 | b8b5 b1c1 a5b6 c6d4 f5d4 c2c3 d4e2 g1f1 e2f4 | best defense creates a stronger countertactic for the defender |
| knight-fork M4 | rb2nr1k/pq4p1/1p3n2/1Np3N1/2P4P/1P1Q2P1/PB3p1K/R4R2 w - - 2 28 | f6g4 h2g1 b7h1 g1h1 g4f2 h1g2 f2d3 | h2g1 | -3 | h2g1 e8f6 f2e2 a7a6 a1e1 b8g3 d3g3 a6b5 e2e7 b7c8 g5f7 f8f7 | best defense creates a stronger countertactic for the defender |
| queen-fork M4 | 1q1rb2r/3Pp1k1/2p1Pp2/1pN2Ppp/3Q2P1/PB2B2P/1P6/4R1K1 w - - 1 33 | b8g3 g1f1 e8h5 e1b1 g3f3 e3f2 f3e2 f1g1 h5f3 d4g4 f3g4 | g1f1 | 0 | g1f1 e8h5 e1c1 h5f3 e3f2 g3h3 f1e1 h3g2 e1d2 h8h2 c1e1 f3g4 | best defense creates a stronger countertactic for the defender |
| king-fork M1 | r2k4/p6R/2b1p2Q/1p6/3q4/1B1P2rP/2P3P1/1R5K b - - 0 29 | h1h2 | g3h3 | -10 | g3h3 h6h3 g2h3 b1g1 h3g4 g1g2 b5b4 b3a4 d4d6 h2g1 d6c5 g1h2 | best defense creates a stronger countertactic for the defender |
| king-fork M1 | 8/3n4/p2n3p/2p2k2/2q2Bp1/6P1/P6P/3R1NK1 w - - 0 42 | f5e4 | e3c4 | -13 | e3c4 d6c4 d1d7 h6h5 d7e7 e4d3 e7c7 a6a5 c7c5 | best defense creates a stronger countertactic for the defender |
| king-fork M1 | rn3r2/1pq1N1k1/p4p2/8/3N3R/1K1Pn3/PP6/R7 w - - 1 34 | g7f7 | e6c7 | -18 | e6c7 f7e7 c7a8 f6f5 a8b6 f5f4 b6c4 f8d8 c4e3 d8d3 b3c2 d3e3 h4f4 | best defense creates a stronger countertactic for the defender |
