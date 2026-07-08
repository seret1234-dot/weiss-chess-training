export type EndgameExplanation = {
 id: string
 title: string
 aliases: string[]
 goal: string
 plan: string[]
 rules: string[]
 mistakes: string[]
}

function clean(value: string) {
 return value
 .toLowerCase()
 .replace(/&/g, " and ")
 .replace(/[^a-z0-9]+/g, " ")
 .replace(/\s+/g, " ")
 .trim()
}

export const ENDGAME_EXPLANATIONS: EndgameExplanation[] = [
 {
 id: "kpk",
 title: "King and Pawn vs King",
 aliases: ["kpk", "king pawn king", "king and pawn", "pawn endgame"],
 goal: "Promote the pawn by using the king to control the key squares in front of the pawn.",
 plan: [
 "Bring the king in front of the pawn when possible.",
 "Win the key squares before pushing too far.",
 "Use opposition to force the defending king backward."
 ],
 rules: [
 "The attacking king usually belongs in front of the pawn.",
 "Rook pawns are special because the defender can often hide in the corner.",
 "Always check the square rule in pawn races."
 ],
 mistakes: [
 "Pushing the pawn before the king is active.",
 "Forgetting stalemate or corner draws with rook pawns.",
 "Thinking every extra pawn is automatically winning."
 ]
 },
 {
 id: "opposition",
 title: "Opposition",
 aliases: ["opposition", "basic opposition", "king opposition"],
 goal: "Use your king to take important squares from the enemy king.",
 plan: [
 "Move toward the key square.",
 "When the kings face each other with one square between them, the side not to move has the opposition.",
 "Use opposition to make the defender step aside."
 ],
 rules: [
 "Opposition is a tool, not the final goal.",
 "Do not push the pawn if it gives away the opposition.",
 "Sometimes distant opposition matters before direct opposition."
 ],
 mistakes: [
 "Playing pawn moves too early.",
 "Taking opposition without knowing which square you want.",
 "Forgetting whose move it is."
 ]
 },
 {
 id: "lucena",
 title: "Lucena Position",
 aliases: ["lucena", "bridge", "rook endgame win"],
 goal: "Win a rook endgame where your pawn is on the 7th rank and your king is in front of it.",
 plan: [
 "Cut off the defending king if possible.",
 "Put the rook on the 4th rank to build a bridge.",
 "Walk the king out of checks and hide behind the rook."
 ],
 rules: [
 "The bridge stops side checks.",
 "The attacking king must escape the checking rook.",
 "Do not let the defending king return in front of the pawn."
 ],
 mistakes: [
 "Moving the king out before preparing the bridge.",
 "Checking randomly instead of building the setup.",
 "Putting the rook passively behind the pawn too early."
 ]
 },
 {
 id: "philidor",
 title: "Philidor Position",
 aliases: ["philidor", "third rank defense", "rook endgame draw"],
 goal: "Draw by keeping the attacking king away before the pawn reaches the 6th rank.",
 plan: [
 "Keep the rook on the 3rd rank.",
 "Prevent the attacking king from advancing.",
 "When the pawn reaches the 6th rank, move the rook behind and give checks."
 ],
 rules: [
 "Wait first, check later.",
 "The defending king should stay in front of the pawn.",
 "The rook becomes active only after the pawn advances."
 ],
 mistakes: [
 "Checking too early.",
 "Letting the attacking king reach the 6th rank area.",
 "Putting the rook passively on the back rank."
 ]
 },
 {
 id: "pawn-race",
 title: "Pawn Races",
 aliases: ["pawn race", "pawn races", "passed pawn race", "pawns", "simple race", "kpk pawn races", "endgame studies pawns"],
 goal: "Calculate who promotes first and whether promotion comes with check.",
 plan: [
 "Count both sides' tempi to promotion.",
 "Check if either promotion gives check.",
 "Use the square rule to see if a king can catch the pawn."
 ],
 rules: [
 "Promotion with check can decide the race.",
 "Sometimes a king move is better than pushing the pawn.",
 "Underpromotion can matter if queen promotion stalemates or fails."
 ],
 mistakes: [
 "Counting only pawn moves and ignoring checks.",
 "Missing the square rule.",
 "Queening automatically without checking stalemate."
 ]
 },
 {
 id: "zugzwang",
 title: "Zugzwang",
 aliases: ["zugzwang", "triangulation"],
 goal: "Force the opponent to move when every move worsens their position.",
 plan: [
 "Identify the position you want with the opponent to move.",
 "Use king triangulation to lose a tempo.",
 "Force the defender to abandon a key square."
 ],
 rules: [
 "The same position can be winning or drawing depending on whose move it is.",
 "Pawn moves are permanent, so use them carefully.",
 "Triangulation changes the move order without changing the structure."
 ],
 mistakes: [
 "Playing the obvious king move and losing the move order.",
 "Pushing pawns instead of using the king.",
 "Missing the defender's only waiting move."
 ]
 },
 {
 id: "shouldering",
 title: "Shouldering",
 aliases: ["shouldering", "bodycheck", "body check", "king shoulder"],
 goal: "Use your king to block the enemy king from reaching the critical area.",
 plan: [
 "Find the defender's shortest route.",
 "Move your king to block that route.",
 "Only then push the pawn or run forward."
 ],
 rules: [
 "A slower-looking king move can be faster if it cuts off the opponent.",
 "The king controls squares, not only pieces.",
 "Shouldering often decides pawn races."
 ],
 mistakes: [
 "Running directly to the pawn and letting the enemy king catch up.",
 "Ignoring the defender's path.",
 "Pushing before the king has cut off the defender."
 ]
 },
 {
 id: "fortress",
 title: "Fortress",
 aliases: ["fortress", "drawing fortress"],
 goal: "Hold a draw by building a position where the stronger side cannot make progress.",
 plan: [
 "Keep the king on the key defensive squares.",
 "Avoid unnecessary pawn moves.",
 "Repeat only when the attacker has no breakthrough."
 ],
 rules: [
 "A fortress is about blocked entry squares.",
 "Material count matters less than whether the attacker can enter.",
 "The defender must not abandon the key square."
 ],
 mistakes: [
 "Trying to win instead of holding.",
 "Moving the king away from the fortress square.",
 "Opening the position with a pawn move."
 ]
 },
 {
 id: "rook-vs-pawn",
 title: "Rook vs Pawn",
 aliases: ["rook vs pawn", "krkp", "rook against pawn"],
 goal: "Stop the pawn or force promotion into a won position for the rook side.",
 plan: [
 "Check the king away from the pawn.",
 "Bring your king closer when checks are not enough.",
 "Watch for stalemate and promotion tricks."
 ],
 rules: [
 "A rook usually stops a pawn, but advanced supported pawns can be dangerous.",
 "The defending king's position is the main factor.",
 "Promotion with check changes everything."
 ],
 mistakes: [
 "Giving pointless checks.",
 "Letting the pawn promote with check.",
 "Capturing into stalemate."
 ]
 },
 {
 id: "queen-vs-pawn",
 title: "Queen vs Pawn",
 aliases: ["queen vs pawn", "kqkp", "kqkp7", "queen against pawn", "kq vs k pawn", "kq vs k pawn on 7th", "kq vs k pawn on seventh", "kq vs k pawn on 7th trainer", "pawn on 7th", "pawn on seventh"],
 goal: "Use checks to force the king in front of its pawn, then bring your king closer.",
 plan: [
 "Check until the defender must block the pawn with the king.",
 "Use that tempo to move your king closer.",
 "Repeat until the pawn is won."
 ],
 rules: [
 "The queen often needs help from the king.",
 "Rook pawns and bishop pawns on the 7th rank can have drawing exceptions.",
 "The method is: check, force block, king closer."
 ],
 mistakes: [
 "Trying to win with queen checks only.",
 "Forgetting the drawing exceptions.",
 "Allowing promotion because checks run out."
 ]
 },
 {
 id: "bishop-knight-mate",
 title: "Bishop and Knight Mate",
 aliases: ["bishop knight mate", "bishop and knight", "bn mate", "kbnk", "k b n vs k", "k n b vs k", "bishop and knight vs king", "knight and bishop vs king"],
 goal: "Force the king to the corner controlled by your bishop, then mate.",
 plan: [
 "Use your king to take space.",
 "Drive the enemy king to the bishop-colored corner.",
 "Use the knight to cover escape squares."
 ],
 rules: [
 "Mate happens only in the corner matching your bishop color.",
 "Restrict first, check later.",
 "The attacking king must stay close."
 ],
 mistakes: [
 "Driving the king to the wrong corner.",
 "Checking too much.",
 "Letting the king escape from the edge."
 ]
 },
 {
 id: "stalemate-defense",
 title: "Stalemate Defense",
 aliases: ["stalemate", "stalemate defense", "defensive stalemate"],
 goal: "Save lost positions by forcing a position with no legal moves and no check.",
 plan: [
 "Look for sacrifices that remove your legal moves.",
 "Move the king to a trapped square if it cannot be checked.",
 "Force the opponent to accept the stalemate idea."
 ],
 rules: [
 "Stalemate is a draw only if the side to move is not in check.",
 "The defender often wants fewer legal moves.",
 "Forced captures are common stalemate tools."
 ],
 mistakes: [
 "Trying to keep material in a lost position.",
 "Walking out of the stalemate net.",
 "Missing a forcing sacrifice."
 ]
 },
 {
 id: "queen-vs-rook",
 title: "Queen vs Rook",
 aliases: ["queen vs rook", "kqkr", "k q vs k r", "k q vs k r trainer", "queen against rook", "win the rook", "fork in 1"],
 goal: "Win the rook or force mate by using queen checks, forks, and king support.",
 plan: [
 "Use queen checks to restrict the enemy king.",
 "Look for forks where the queen checks the king and attacks the rook.",
 "Bring your king closer when checks alone do not win immediately."
 ],
 rules: [
 "The queen usually wins against rook, but careless checking can allow fortress-like defense.",
 "The strongest practical motif is often a queen fork.",
 "Do not trade queens or allow perpetual checks."
 ],
 mistakes: [
 "Giving random checks without improving the position.",
 "Missing a direct fork on the king and rook.",
 "Letting the rook give endless checks because your king is exposed."
 ]
 },
 {
 id: "two-knights-vs-pawn",
 title: "Two Knights vs Pawn",
 aliases: ["two knights vs pawn", "knnkp", "knn vs kp", "knn vs k p", "two knights against pawn", "forced mate", "knn vs kp forced mate"],
 goal: "Use the defender's pawn to avoid stalemate and force mate with king and two knights.",
 plan: [
 "Drive the enemy king toward the corner.",
 "Use the knights to cover escape squares while your king takes space.",
 "Keep the defender's pawn alive when it is needed to avoid stalemate."
 ],
 rules: [
 "Two knights alone cannot force mate against a bare king.",
 "With an extra defender pawn, forced mate can become possible because stalemate is avoided.",
 "The attacking king must stay close; the knights cannot do it alone."
 ],
 mistakes: [
 "Capturing the pawn too early and losing the forced mate.",
 "Checking too much instead of restricting the king.",
 "Letting the king escape from the edge."
 ]
 },
 {
 id: "queen-mate",
 title: "Queen Mate",
 aliases: ["queen mate", "queen vs king", "queen against king", "kqk", "kq vs k", "k q vs k", "k + q vs k", "king and queen vs king"],
 goal: "Mate with king and queen by pushing the enemy king to the edge while avoiding stalemate.",
 plan: [
 "Use the queen to cut off ranks and files, making a box around the enemy king.",
 "Bring your king closer to support the final mate.",
 "Mate on the edge or in the corner when your king controls the escape squares."
 ],
 rules: [
 "Do not check randomly. First restrict the king.",
 "The queen can stalemate the enemy king if you take away every square without giving check.",
 "Your king must help in the final position."
 ],
 mistakes: [
 "Putting the queen too close and allowing stalemate.",
 "Giving checks that let the king run back to the center.",
 "Forgetting to bring the king closer."
 ]
 },
 {
 id: "rook-mate",
 title: "Rook Mate",
 aliases: ["rook mate", "rook vs king", "rook against king", "krk", "kr vs k", "k r vs k", "k + r vs k", "king and rook vs king"],
 goal: "Mate with king and rook by cutting the king off and driving it to the edge.",
 plan: [
 "Use the rook to cut the enemy king off from the board.",
 "Bring your king closer and take opposition.",
 "Shrink the box step by step until the king is forced to the edge."
 ],
 rules: [
 "The rook controls a rank or file; the king controls nearby escape squares.",
 "Usually you should improve the king before checking.",
 "The final mate happens on the edge of the board."
 ],
 mistakes: [
 "Checking too early and letting the king escape.",
 "Leaving your rook close enough to be attacked.",
 "Not using the attacking king."
 ]
 },
 {
 id: "two-rooks-mate",
 title: "Two Rooks Mate",
 aliases: ["two rooks mate", "ladder mate", "rook ladder", "krrk", "krr vs k", "k r r vs k", "k + r + r vs k", "two rooks vs king"],
 goal: "Mate with two rooks by using the ladder method to push the king to the edge.",
 plan: [
 "Place the rooks on different ranks or files.",
 "Give checking moves one rook at a time, like a ladder.",
 "Keep the rooks protected by distance so the king cannot capture them."
 ],
 rules: [
 "The king is not always needed, but the rooks must stay safe.",
 "Each rook cuts off one more rank or file.",
 "Mate happens when the king reaches the edge."
 ],
 mistakes: [
 "Putting a rook next to the king where it can be captured.",
 "Repeating checks without reducing the king's space.",
 "Moving both rooks to the same line too early."
 ]
 },
 {
 id: "queen-rook-mate",
 title: "Queen and Rook Mate",
 aliases: ["queen and rook mate", "queen rook mate", "queen and rook vs king", "kqrk", "kqr vs k", "k q r vs k", "k + q + r vs k", "queen rook vs king"],
 goal: "Mate quickly by using the queen and rook as a powerful ladder.",
 plan: [
 "Use the queen and rook to cut the king off rank by rank or file by file.",
 "Keep both heavy pieces safe from capture.",
 "Finish on the edge when the king has no escape squares."
 ],
 rules: [
 "Queen and rook mate is usually easier than queen mate because both pieces can build a ladder.",
 "Do not allow the king to attack an undefended piece.",
 "Avoid stalemate when the king is boxed in."
 ],
 mistakes: [
 "Moving the queen too close and stalemating.",
 "Leaving the rook undefended.",
 "Checking without reducing the box."
 ]
 },
 {
 id: "two-bishops-mate",
 title: "Two Bishops Mate",
 aliases: ["two bishops mate", "two bishops vs king", "bishop bishop mate", "kbbk", "kbb vs k", "k b b vs k", "k + b + b vs k", "two bishops against king"],
 goal: "Mate with two bishops and king by building a diagonal wall and driving the king to a corner.",
 plan: [
 "Centralize your king first.",
 "Use the bishops together to create a diagonal wall.",
 "Push the king to the edge, then walk it into a corner."
 ],
 rules: [
 "Two bishops control both colors, so any corner can work.",
 "The attacking king must stay close.",
 "The bishops restrict; the king does the pushing."
 ],
 mistakes: [
 "Moving bishops randomly instead of keeping a wall.",
 "Letting the king return to the center.",
 "Forgetting stalemate near the final corner."
 ]
 },
 {
 id: "bishop-knight-piece-mate",
 title: "Bishop and Knight Mate",
 aliases: ["bishop and knight mate", "bishop knight mate", "knight bishop mate", "bishop and knight vs king", "kbnk", "kbn vs k", "k b n vs k", "k + b + n vs k", "king bishop knight vs king"],
 goal: "Mate with bishop, knight, and king by driving the enemy king to the corner controlled by your bishop.",
 plan: [
 "Use your king to take space and force the enemy king toward the edge.",
 "Drive the king toward the correct corner: the same color as your bishop.",
 "Use the knight to cover escape squares while the bishop controls diagonals."
 ],
 rules: [
 "The final mate must happen in the bishop-colored corner.",
 "The king does most of the pushing work.",
 "Restrict first, check later."
 ],
 mistakes: [
 "Driving the king to the wrong corner.",
 "Checking too much instead of controlling squares.",
 "Letting the king escape from the edge."
 ]
 },
 {
 id: "queen-minor-mate",
 title: "Queen and Minor Piece Mate",
 aliases: ["queen and bishop mate", "queen and knight mate", "queen bishop mate", "queen knight mate", "kqb vs k", "kqn vs k", "k q b vs k", "k q n vs k", "queen and bishop vs king", "queen and knight vs king"],
 goal: "Mate with queen plus bishop or knight by using the queen to restrict and the minor piece to cover escape squares.",
 plan: [
 "Use the queen to cut off the enemy king.",
 "Bring your king closer if the mate is not immediate.",
 "Use the bishop or knight to cover the final escape square."
 ],
 rules: [
 "The queen is the main mating piece.",
 "The minor piece often covers one critical square.",
 "Still watch for stalemate when the king is trapped."
 ],
 mistakes: [
 "Ignoring the minor piece's useful coverage.",
 "Stalemating with the queen.",
 "Giving checks that let the king back to the center."
 ]
 },
 {
 id: "rook-minor-mate",
 title: "Rook and Minor Piece Mate",
 aliases: ["rook and bishop mate", "rook and knight mate", "rook bishop mate", "rook knight mate", "krb vs k", "krn vs k", "k r b vs k", "k r n vs k", "rook and bishop vs king", "rook and knight vs king"],
 goal: "Mate with rook plus bishop or knight by using the rook to cut off the king and the minor piece to cover escape squares.",
 plan: [
 "Use the rook to cut the king off from ranks or files.",
 "Bring your king closer to support the net.",
 "Use the bishop or knight to control the squares the rook does not cover."
 ],
 rules: [
 "The rook creates the main wall.",
 "The minor piece helps cover escape squares.",
 "The attacking king is still important."
 ],
 mistakes: [
 "Checking with the rook before the king is close enough.",
 "Leaving the rook exposed to capture.",
 "Not coordinating the minor piece with the rook."
 ]
 },
 {
 id: "two-knights-mate",
 title: "Two Knights Mate",
 aliases: ["two knights mate", "two knights vs king", "knnk", "knn vs k", "k n n vs k", "k + n + n vs k", "two knights against king"],
 goal: "Finish specific two-knight mating positions, while remembering that two knights cannot force mate against a bare king from a normal position.",
 plan: [
 "Use the king to restrict the enemy king first.",
 "Use the knights to cover escape squares near the edge.",
 "Only check when it tightens the mating net."
 ],
 rules: [
 "Two knights alone cannot force mate against best defense.",
 "Mate can still exist in specific positions if the defender is already trapped.",
 "With an extra defender pawn, forced mate can sometimes become possible."
 ],
 mistakes: [
 "Assuming two knights always force mate.",
 "Checking instead of restricting.",
 "Letting the king escape from the edge."
 ]
 },
 {
 id: "piece-bishop-knight-exact",
 title: "Bishop + Knight Mate",
 aliases: ["bishop knight", "bishop knight mate", "bishop + knight mate", "bishop and knight mate", "kbnk", "kbn vs k", "king bishop knight", "king bishop knight vs king"],
 goal: "Mate with bishop, knight, and king by forcing the enemy king to the corner controlled by your bishop.",
 plan: [
 "Use your king to take space first.",
 "Drive the enemy king toward the edge.",
 "Force the king toward the bishop-colored corner.",
 "Use the knight to cover escape squares while the bishop controls diagonals."
 ],
 rules: [
 "The final mate must happen in the corner matching your bishop color.",
 "Restrict first, check later.",
 "The king is the main pushing piece."
 ],
 mistakes: [
 "Driving the king to the wrong corner.",
 "Checking too much instead of cutting squares.",
 "Letting the king escape from the edge."
 ]
 },
 {
 id: "piece-two-bishops-exact",
 title: "Two Bishops Mate",
 aliases: ["two bishops", "two bishops mate", "bishop bishop mate", "kbbk", "kbb vs k", "king two bishops", "king two bishops vs king"],
 goal: "Mate with two bishops and king by creating a diagonal wall and squeezing the enemy king to the edge.",
 plan: [
 "Bring your king forward.",
 "Use the bishops together to cut diagonals and build a wall.",
 "Push the king to the edge, then into a corner.",
 "Finish only when your king and bishops cover all escape squares."
 ],
 rules: [
 "Two bishops control both colors, so any corner can work.",
 "The bishops restrict; the king does the pushing.",
 "Avoid stalemate near the final corner."
 ],
 mistakes: [
 "Moving bishops randomly instead of keeping a wall.",
 "Letting the king run back to the center.",
 "Checking before the net is ready."
 ]
 },
 {
 id: "piece-two-rooks-exact",
 title: "King + Two Rooks",
 aliases: ["king two rooks", "king + two rooks", "two rooks", "two rooks mate", "ladder mate", "rook ladder", "krrk", "krr vs k", "king two rooks vs king"],
 goal: "Mate with two rooks by using the ladder method to force the king to the edge.",
 plan: [
 "Put the rooks on different ranks or files.",
 "Check with one rook while the other rook cuts off escape.",
 "Move the rooks like a ladder, reducing the king's space each move.",
 "Keep the rooks far enough away that the king cannot capture them."
 ],
 rules: [
 "Each rook should cut off one rank or file.",
 "The king is not always needed, but the rooks must stay safe.",
 "Mate happens when the enemy king is forced to the edge."
 ],
 mistakes: [
 "Putting a rook next to the king where it can be captured.",
 "Repeating checks without reducing space.",
 "Moving both rooks onto the same line too early."
 ]
 },
 {
 id: "route-k2r-exact",
 title: "K + 2 Rooks Mate",
 aliases: ["k2r", "k 2 r", "k 2 rooks", "k + 2 rooks", "k + 2 rooks trainer", "2 rooks", "2 rooks trainer", "two rooks trainer", "king 2 rooks", "king + 2 rooks"],
 goal: "Mate with two rooks by using the ladder method to force the king to the edge.",
 plan: [
 "Put the rooks on different ranks or files.",
 "Use one rook to check while the other rook cuts off escape squares.",
 "Move the rooks like a ladder, reducing the king's space every move.",
 "Keep the rooks far enough away that the king cannot capture them."
 ],
 rules: [
 "Each rook should cut off one rank or file.",
 "The attacking king is not always needed, but both rooks must stay safe.",
 "Mate happens when the enemy king is forced to the edge."
 ],
 mistakes: [
 "Putting a rook next to the king where it can be captured.",
 "Repeating checks without reducing space.",
 "Moving both rooks onto the same line too early."
 ]
 },
 {
 id: "route-bn-exact",
 title: "B+N Mate",
 aliases: ["bn", "b n", "b n mate", "b n mate trainer", "b+n", "b+n mate", "b+n mate trainer", "bishop knight", "bishop knight trainer", "bishop + knight trainer"],
 goal: "Mate with bishop, knight, and king by forcing the enemy king to the corner controlled by your bishop.",
 plan: [
 "Use your king to take space first.",
 "Drive the enemy king toward the edge.",
 "Force the king toward the bishop-colored corner.",
 "Use the knight to cover escape squares while the bishop controls diagonals."
 ],
 rules: [
 "The final mate must happen in the corner matching your bishop color.",
 "The king is the main pushing piece.",
 "Restrict first, check later."
 ],
 mistakes: [
 "Driving the king to the wrong corner.",
 "Checking too much instead of cutting squares.",
 "Letting the king escape from the edge."
 ]
 }
]

export function getEndgameExplanation(raw: string): EndgameExplanation | null {
 const text = ` ${clean(raw)} `
 if (!text.trim()) return null

 let best: EndgameExplanation | null = null
 let bestScore = 0

 for (const item of ENDGAME_EXPLANATIONS) {
 const keys = [item.id, item.title, ...item.aliases]

 for (const keyRaw of keys) {
 const key = clean(keyRaw)
 if (!key) continue

 let score = 0
 if (text.trim() === key) score = 10000 + key.length
 else if (text.includes(` ${key} `)) score = key.length

 if (score > bestScore) {
 bestScore = score
 best = item
 }
 }
 }

 return best
}