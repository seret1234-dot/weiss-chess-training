export type SiteExplanationKey =
 | "home"
 | "mates"
 | "anastasiaMate"
 | "backRankMate"
 | "arabianMate"
 | "smotheredMate"
 | "hookMate"
 | "killBoxMate"
 | "dovetailMate"
 | "doubleBishopMate"
 | "mixedMate"
 | "stalemateUnderpromotion" | "tacticDefense"
 | "tacticAdvancedPawn"
 | "tacticAttackingF2F7"
 | "tacticQuietMove"
 | "tacticDiscoveredAttack"
 | "tacticDiscoveredCheck"
 | "tacticDoubleCheck"
 | "tacticForkDoubleAttack"
 | "tacticPin"
 | "tacticSkewer"
 | "tacticXRayAttack"
 | "tacticSacrifice"
 | "tacticClearance"
 | "tacticClearanceSacrifice"
 | "tacticDecoyAttraction"
 | "tacticDecoyDeflection"
 | "tacticDeflection"
 | "tacticEnPassant"
 | "tacticHangingPiece"
 | "tacticInterference"
 | "tacticInterferenceSacrifice"
 | "tacticKingsideAttack"
 | "tacticQueensideAttack"
 | "tacticUnderpromotion"
 | "tacticKnightUnderpromotion"
 | "tacticPromotion"
 | "tacticRemoveDefender"
 | "tacticTrappedPiece"
 | "tacticVulnerableKing"
 | "tacticZugzwang"
 | "tacticZwischenzug"
 | "tacticMixed"
 | "tactics"
 | "endgames"
 | "boardVision"
 | "openings"
 | "masterGames"
 | "playComputer"
 | "analyze"
 | "museum";

export type SiteExplanation = {
 title: string;
 concept: string;
 lookFor?: string;
 howToUse?: string;
 goal?: string;
};

export const siteExplanations: Record<SiteExplanationKey, SiteExplanation> = {
 home: {
 title: "Weiss Chess Trainer",
 concept:
 "This site breaks chess into basic patterns and trains them with repetition.",
 goal:
 "Build real chess intuition by practicing small ideas many times until they become automatic.",
 },

 mates: {
 title: "Mate Trainers",
 concept:
 "Mate trainers teach you to recognize common checkmate patterns.",
 lookFor:
 "Start with forcing moves: checks, captures, threats, trapped kings, and blocked escape squares.",
 goal:
 "Improve your ability to finish games when the enemy king is vulnerable.",
 },

 anastasiaMate: {
 title: "Anastasia's Mate",
 concept:
 "A knight controls key escape squares while a rook or queen gives mate along a file or rank.",
 lookFor:
 "Look for a king near the edge, a knight covering escape squares, and a heavy piece ready to give mate.",
 goal:
 "Learn how a knight and heavy piece cooperate to create a mating net.",
 },

 backRankMate: {
 title: "Back Rank Mate",
 concept:
 "The king is stuck on the back rank, usually blocked by its own pawns, and a rook or queen gives mate.",
 lookFor:
 "Look for open files or ranks leading to the king. Check whether the king has a flight square.",
 goal:
 "Recognize when a king has no escape and can be mated by a heavy piece.",
 },
 arabianMate: {
 title: "Arabian Mate",
 concept:
 "Arabian mate uses a rook and knight working together. The rook gives check while the knight protects the rook and controls key escape squares.",
 lookFor:
 "Look for a king near the corner or edge, a rook ready to check along a file or rank, and a knight close enough to cover the escape squares.",
 goal:
 "Learn one of the classic rook-and-knight mating patterns and recognize when the king is trapped on the edge.",
 },


 smotheredMate: {
 title: "Smothered Mate",
 concept:
 "The king is trapped by its own pieces, and a knight gives checkmate.",
 lookFor:
 "Look for knight checks near the king and blocked escape squares.",
 goal:
 "Train your eye to notice when the king is boxed in by its own army.",
 },


 stalemateUnderpromotion: {
 title: "Stalemate Underpromotion",
 concept:
 "Promoting to a queen can be too strong: it may take away every legal move and accidentally stalemate the opponent.",
 lookFor:
 "Before queening, check whether the enemy king has any legal moves. If queen promotion stalemates, look for rook, bishop, or knight promotion.",
 goal:
 "Train the habit of choosing the correct promotion piece, not automatically making a queen.",
 },
 hookMate: {
 title: "Hook Mate",
 concept:
 "A hook mate uses a knight and a heavy piece to trap the king. The knight acts like the hook by covering escape squares while the rook or queen gives mate.",
 lookFor:
 "Look for a king near the edge, a knight close to the king, and a rook or queen that can give a forcing check.",
 goal:
 "Learn to see how a knight can lock the king in place so a heavy piece can finish the attack.",
 },

 killBoxMate: {
 title: "Kill Box Mate",
 concept:
 "A kill box mate happens when the king is boxed into a small area and every escape square is controlled.",
 lookFor:
 "Look for checks that shrink the king's space. The final mate usually comes when the king has no safe square, no block, and no capture.",
 goal:
 "Train your eye to build a mating net instead of only looking for one-move checks.",
 },

 dovetailMate: {
 title: "Dovetail Mate",
 concept:
 "A dovetail mate happens when the king's own pieces block its diagonal escape squares, often allowing a queen mate.",
 lookFor:
 "Look for a king surrounded by friendly pieces on diagonal squares. A queen check can cover the remaining escape squares.",
 goal:
 "Recognize when the defender's own pieces become a cage around the king.",
 },

 doubleBishopMate: {
 title: "Double Bishop Mate",
 concept:
 "Two bishops can create a powerful mating net by controlling crossing diagonals around the king.",
 lookFor:
 "Look for diagonal control, a king with limited escape squares, and checks that use both bishops together.",
 goal:
 "Improve your ability to see long diagonal mating patterns.",
 },

 mixedMate: {
 title: "Mixed Mate Patterns",
 concept:
 "Mixed mate trainers combine several mating ideas, so the pattern is not given away by the title.",
 lookFor:
 "Start with forcing moves. Check the king's escape squares, possible captures, blocks, and pinned defenders.",
 goal:
 "Train flexible mate recognition instead of memorizing only one named pattern.",
 },
 tacticAttackingF2F7: {
 title: "Attacking f2/f7",
 concept:
 "The f2 and f7 squares are early tactical targets because they are usually protected only by the king at the start of the game.",
 lookFor:
 "Look for bishop, queen, knight, or rook pressure on f2/f7, especially when the king is uncastled or the defender is pinned.",
 goal:
 "Learn to recognize common attacks against the weakest starting squares near the king.",
 },

 tacticDefense: {
 title: "Defense",
 concept:
 "Defense tactics are moves that survive a threat, stop mate, save material, or turn the opponent's attack against them.",
 lookFor:
 "First identify the threat. Then look for forcing defensive moves: checks, captures, blocks, interpositions, escapes, and counterattacks.",
 goal:
 "Learn to defend actively instead of only reacting passively.",
 },

 tacticAdvancedPawn: {
 title: "Advanced Pawn",
 concept:
 "An advanced pawn tactic uses a pawn deep in enemy territory to promote, fork, restrict the king, or support an attack.",
 lookFor:
 "Look for passed pawns close to promotion, pawn checks, promotion threats, and pieces tied down to stopping the pawn.",
 goal:
 "Recognize when a far-advanced pawn is a tactical weapon, not just extra material.",
 },

 tacticQuietMove: {
 title: "Quiet Move",
 concept:
 "A quiet move is not an immediate check or capture, but it creates a threat the opponent cannot meet.",
 lookFor:
 "Look for calm moves that improve a piece, create mate threats, trap a piece, or remove the defender's only resource.",
 goal:
 "Train patience and calculation beyond obvious forcing moves.",
 },

 tacticDiscoveredAttack: {
 title: "Discovered Attack",
 concept:
 "A discovered attack happens when one piece moves away and opens a line for another piece behind it.",
 lookFor:
 "Find lined-up pieces on ranks, files, or diagonals. Then look for a move by the front piece that creates a second threat.",
 goal:
 "Learn to use hidden line pieces as tactical weapons.",
 },

 tacticDiscoveredCheck: {
 title: "Discovered Check",
 concept:
 "A discovered check opens a line to the king while the moving piece can create another threat.",
 lookFor:
 "Look for your rook, bishop, or queen lined up with the enemy king behind one of your own pieces.",
 goal:
 "Use check tempo to win material, force mate, or improve the attacking piece.",
 },

 tacticDoubleCheck: {
 title: "Double Check",
 concept:
 "Double check attacks the king with two pieces at once, so the king usually must move.",
 lookFor:
 "Look for discovered checks where the moving piece also gives check. Blocks and captures often do not work against double check.",
 goal:
 "Recognize one of the most forcing attacking patterns in chess.",
 },

 tacticForkDoubleAttack: {
 title: "Fork / Double Attack",
 concept:
 "A fork or double attack creates two threats at the same time, so the opponent cannot answer both.",
 lookFor:
 "Look for checks or attacks that hit the king, queen, rook, loose pieces, or mate threats at once.",
 goal:
 "Train your eye to find moves with two purposes.",
 },

 tacticPin: {
 title: "Pin",
 concept:
 "A pinned piece cannot move safely because moving it would expose a more valuable piece or the king behind it.",
 lookFor:
 "Look for pieces lined up with the king, queen, or rook behind them. Then attack the pinned piece or add pressure.",
 goal:
 "Learn to exploit pieces that are stuck defending something behind them.",
 },

 tacticSkewer: {
 title: "Skewer",
 concept:
 "A skewer attacks a valuable piece first; when it moves, a weaker piece behind it is lost.",
 lookFor:
 "Look for lined-up king, queen, rook, or bishop targets on open files, ranks, and diagonals.",
 goal:
 "Recognize line attacks where the front piece is forced to move.",
 },

 tacticXRayAttack: {
 title: "X-Ray Attack",
 concept:
 "An x-ray attack uses pressure through a piece or along a line, often because something behind the first piece is vulnerable.",
 lookFor:
 "Look for rooks, bishops, and queens aiming through pieces toward valuable targets behind them.",
 goal:
 "Train long-range vision through files, ranks, and diagonals.",
 },

 tacticSacrifice: {
 title: "Sacrifice",
 concept:
 "A sacrifice gives up material to gain something stronger: mate, promotion, decisive attack, or winning more material back.",
 lookFor:
 "Look for forcing sacrifices with check, captures near the king, overloaded defenders, or pieces that cannot safely accept the sacrifice.",
 goal:
 "Learn when giving material is justified by calculation.",
 },

 tacticClearance: {
 title: "Clearance",
 concept:
 "A clearance move vacates a square, file, rank, or diagonal so another piece can use it.",
 lookFor:
 "Find your own piece blocking an important line or square. The tactic often starts by moving it with tempo.",
 goal:
 "Recognize when the best move is to get out of the way.",
 },

 tacticClearanceSacrifice: {
 title: "Clearance Sacrifice",
 concept:
 "A clearance sacrifice gives up a piece to open a square or line for a stronger tactic.",
 lookFor:
 "Look for a blocked file, rank, diagonal, or key square near the king where sacrificing the blocker opens the attack.",
 goal:
 "Learn to value open lines and key squares more than the sacrificed material.",
 },

 tacticDecoyAttraction: {
 title: "Decoy / Attraction",
 concept:
 "A decoy or attraction tactic lures an enemy piece onto a bad square where it can be attacked, pinned, forked, or mated.",
 lookFor:
 "Look for forcing checks or captures that drag the king, queen, or defender to a vulnerable square.",
 goal:
 "Learn to force enemy pieces where you want them.",
 },

 tacticDecoyDeflection: {
 title: "Decoy + Deflection",
 concept:
 "This combines luring a piece to a bad square with removing it from an important defensive job.",
 lookFor:
 "Find the defender. Then look for a forcing move that pulls it away or onto a square where it becomes overloaded.",
 goal:
 "Recognize tactics where one forced move creates two problems for the opponent.",
 },

 tacticDeflection: {
 title: "Deflection",
 concept:
 "Deflection removes or distracts a defender from an important square, piece, or mating line.",
 lookFor:
 "Ask which enemy piece is holding the position together. Then look for a forcing move that makes it leave.",
 goal:
 "Learn to attack the defender before attacking the target.",
 },

 tacticEnPassant: {
 title: "En Passant",
 concept:
 "En passant can be tactical because it opens lines, gives check, wins material, or changes pawn structure immediately.",
 lookFor:
 "Check whether an en passant capture opens a rook, bishop, or queen line, creates a discovered attack, or stops promotion.",
 goal:
 "Remember that en passant is not only a rule trick, but sometimes the key tactic.",
 },

 tacticHangingPiece: {
 title: "Hanging Piece",
 concept:
 "A hanging piece is undefended or insufficiently defended, so it can often be won tactically.",
 lookFor:
 "Scan for loose pieces, especially after forcing moves like checks and captures.",
 goal:
 "Build the habit of noticing undefended targets.",
 },

 tacticInterference: {
 title: "Interference",
 concept:
 "Interference places a piece between an enemy defender and its target, cutting the defensive line.",
 lookFor:
 "Look for enemy rooks, bishops, or queens defending along a line. Then find a move that blocks that line with tempo.",
 goal:
 "Learn to break coordination between enemy pieces.",
 },

 tacticInterferenceSacrifice: {
 title: "Interference Sacrifice",
 concept:
 "An interference sacrifice gives up material to block a key defensive line.",
 lookFor:
 "Find a line defender, then look for a sacrifice on the line that cannot be ignored.",
 goal:
 "Recognize when blocking a line is worth more than the sacrificed piece.",
 },

 tacticKingsideAttack: {
 title: "Kingside Attack",
 concept:
 "A kingside attack focuses pieces and pawns toward the enemy king on the kingside.",
 lookFor:
 "Look for weakened pawns, open files, pieces aimed at the king, sacrifices on h7/h2 or g7/g2, and mating threats.",
 goal:
 "Learn common attacking signals around the castled king.",
 },

 tacticQueensideAttack: {
 title: "Queenside Attack",
 concept:
 "A queenside attack uses files, pawn breaks, and piece pressure on the queenside to win material or create decisive threats.",
 lookFor:
 "Look for open b- or c-files, weak pawns, trapped pieces, and tactics against the queen or rook.",
 goal:
 "Recognize tactical chances away from the king.",
 },

 tacticUnderpromotion: {
 title: "Underpromotion",
 concept:
 "Underpromotion chooses a rook, bishop, or knight instead of a queen because the queen would fail or stalemate.",
 lookFor:
 "Check whether a knight promotion gives check, whether a rook/bishop avoids stalemate, or whether queen promotion allows defense.",
 goal:
 "Train accurate promotion choices instead of automatic queening.",
 },

 tacticKnightUnderpromotion: {
 title: "Knight Underpromotion",
 concept:
 "Knight underpromotion is used when only a knight move gives the needed check, fork, or tempo.",
 lookFor:
 "Look for promotion squares where a new knight would check the king or fork major pieces.",
 goal:
 "Recognize the special geometry only a knight promotion can create.",
 },

 tacticPromotion: {
 title: "Promotion",
 concept:
 "Promotion tactics revolve around making a pawn queen or promoting with decisive effect.",
 lookFor:
 "Look for passed pawns, forcing checks, sacrifices that clear the promotion square, and defenders that can be deflected.",
 goal:
 "Learn to calculate pawn races and promotion tactics accurately.",
 },

 tacticRemoveDefender: {
 title: "Remove the Defender",
 concept:
 "Remove-the-defender tactics capture, deflect, or overload the piece guarding an important target.",
 lookFor:
 "Identify the target, then identify what protects it. The tactic often starts by eliminating that defender.",
 goal:
 "Train the habit of asking what protects the thing you want to win.",
 },

 tacticTrappedPiece: {
 title: "Trapped Piece",
 concept:
 "A trapped piece has no safe squares and can be won by attacking its escape routes.",
 lookFor:
 "Look for pieces with limited mobility, especially queens, rooks, bishops, and knights near the edge.",
 goal:
 "Learn to win material by restricting movement before attacking.",
 },

 tacticVulnerableKing: {
 title: "Vulnerable / Exposed King",
 concept:
 "An exposed king creates tactical chances because checks become stronger and defenses are harder to coordinate.",
 lookFor:
 "Look for open lines to the king, unsafe king squares, weak diagonals, and forcing checks.",
 goal:
 "Train yourself to attack when the king lacks shelter.",
 },

 tacticZugzwang: {
 title: "Zugzwang",
 concept:
 "Zugzwang means the opponent must move, but every legal move worsens their position.",
 lookFor:
 "Look for positions where quiet waiting moves remove the opponent's last useful move.",
 goal:
 "Recognize tactics based on forcing the opponent to damage their own position.",
 },

 tacticZwischenzug: {
 title: "Zwischenzug / Intermezzo",
 concept:
 "A zwischenzug is an in-between move played before the expected recapture or reply.",
 lookFor:
 "Before making the obvious move, check for a stronger check, capture, or threat first.",
 goal:
 "Train the habit of looking for forcing in-between moves.",
 },

 tacticMixed: {
 title: "Mixed Tactics",
 concept:
 "Mixed tactics combine different tactical ideas, so the pattern is not given away by the trainer title.",
 lookFor:
 "Start with forcing moves: checks, captures, threats, loose pieces, king safety, and overloaded defenders.",
 goal:
 "Build flexible tactical vision across many pattern types.",
 },



 tactics: {
 title: "Tactics Trainers",
 concept:
 "Tactics trainers teach forcing patterns that win material, mate, or create decisive threats.",
 lookFor:
 "Look for checks, captures, threats, pins, forks, skewers, discovered attacks, and overloaded pieces.",
 goal:
 "Improve calculation and pattern recognition.",
 },

 endgames: {
 title: "Endgame Trainers",
 concept:
 "Endgame trainers teach technical positions where the plan matters more than tactics.",
 lookFor:
 "Look for king activity, opposition, passed pawns, checking distance, and drawing zones.",
 goal:
 "Learn reliable winning and drawing methods instead of guessing.",
 },

 boardVision: {
 title: "Board Vision",
 concept:
 "Board vision drills train your ability to see squares, lines, diagonals, and piece movement quickly.",
 goal:
 "Make the board feel automatic so you spend less energy finding squares and more energy thinking chess.",
 },

 openings: {
 title: "Opening Trainer",
 concept:
 "The opening trainer helps you learn common opening positions by repetition and understanding.",
 lookFor:
 "Notice development, center control, king safety, pawn structure, and typical plans.",
 goal:
 "Remember openings through ideas, not only memorized moves.",
 },

 masterGames: {
 title: "Master Games",
 concept:
 "Master games show how strong players build positions, attack, defend, and convert advantages.",
 goal:
 "Absorb good chess patterns from real high-level games.",
 },

 playComputer: {
 title: "Play Computer",
 concept:
 "Play against the engine from the starting position or from any position you are studying.",
 howToUse:
 "Use normal play for practice, or start from a position you analyzed and try to convert it.",
 goal:
 "Practice applying ideas in real play, not only solving isolated puzzles.",
 },

 analyze: {
 title: "Analyze",
 concept:
 "Analyze lets you review games and positions with engine help.",
 lookFor:
 "Check where the evaluation changed, which moves were missed, and what the best move was trying to do.",
 goal:
 "Understand your mistakes and turn them into training material.",
 },

 museum: {
 title: "Fun Chess",
 concept:
 "Fun Chess collects strange, beautiful, famous, and funny chess positions.",
 goal:
 "Enjoy memorable chess ideas and discover unusual patterns.",
 },
};