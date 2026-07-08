export type OpeningExplanation = {
 id: string
 title: string
 aliases: string[]
 goal: string
 plan: string[]
 keyIdeas: string[]
 mistakes: string[]
}

function clean(value: string) {
 return value
 .toLowerCase()
 .replace(/&/g, " and ")
 .replace(/\+/g, " ")
 .replace(/[^a-z0-9]+/g, " ")
 .replace(/\s+/g, " ")
 .trim()
}

export const GENERIC_OPENING_EXPLANATION: OpeningExplanation = {
 id: "generic-opening",
 title: "Opening Plan",
 aliases: [],
 goal: "Reach a playable middlegame by controlling the center, developing pieces, keeping the king safe, and understanding the pawn structure.",
 plan: [
 "Fight for the center with pawns and pieces.",
 "Develop knights and bishops before moving the same piece many times.",
 "Castle before opening the position too much.",
 "Only start an attack when your pieces are ready."
 ],
 keyIdeas: [
 "Do not memorize only moves. Understand what each side is trying to achieve.",
 "Look for the main pawn break: usually d4, e4, c4, c5, e5, or f5.",
 "Bad openings are often playable if you develop quickly and do not lose the center."
 ],
 mistakes: [
 "Moving the queen out too early without a concrete reason.",
 "Grabbing pawns while undeveloped.",
 "Starting an attack before castling or completing development."
 ]
}

export const OPENING_EXPLANATIONS: OpeningExplanation[] = [
 {
 id: "ruy-lopez",
 title: "Ruy Lopez / Spanish",
 aliases: ["ruy lopez", "spanish opening", "spanish game"],
 goal: "Put long-term pressure on Black's e5 pawn while developing naturally and preparing a strong central presence.",
 plan: [
 "White develops Bb5 to pressure the knight that defends e5.",
 "White usually castles quickly and prepares c3 and d4.",
 "Black chooses between solid setups with ...a6, ...Nf6, ...Be7, or more active systems."
 ],
 keyIdeas: [
 "The bishop on b5 is often more about pressure than winning material immediately.",
 "White often builds a big center with c3 and d4.",
 "Black often fights for counterplay with ...b5, ...d6, ...Nf6, and sometimes ...d5."
 ],
 mistakes: [
 "Trying to win e5 too early without calculating.",
 "Letting Black equalize with ...d5 too easily.",
 "Moving the same bishop too many times without completing development."
 ]
 },
 {
 id: "italian",
 title: "Italian Game",
 aliases: ["italian", "giuoco piano", "two knights defense", "fried liver"],
 goal: "Develop quickly, aim at f7, and decide between slow central buildup or direct tactical play.",
 plan: [
 "White develops Bc4 toward f7.",
 "Castle early and prepare c3 and d4, or play quieter d3 systems.",
 "Black must develop quickly and avoid early tactical traps on f7."
 ],
 keyIdeas: [
 "The Italian can become quiet or extremely tactical.",
 "In slow lines, piece placement and central timing matter more than immediate attack.",
 "In sharp lines, f7 and e5 are key tactical squares."
 ],
 mistakes: [
 "Attacking f7 before enough pieces are developed.",
 "Ignoring tactics on e5, f7, and g5.",
 "Playing passive moves and allowing the opponent to take the center."
 ]
 },
 {
 id: "sicilian",
 title: "Sicilian Defense",
 aliases: ["sicilian", "najdorf", "dragon", "accelerated dragon", "scheveningen", "sveshnikov", "taimanov", "kan", "classical sicilian", "alapin sicilian", "closed sicilian"],
 goal: "Black creates an unbalanced fight by trading the c-pawn for White's d-pawn and playing for counterattack.",
 plan: [
 "Black challenges the center with ...c5 instead of mirroring ...e5.",
 "In Open Sicilians, White often plays d4 and Black captures cxd4.",
 "White usually attacks actively; Black seeks queenside or central counterplay."
 ],
 keyIdeas: [
 "The Sicilian is about imbalance, not immediate equality.",
 "White often has more space and attacking chances.",
 "Black often has a central pawn majority and long-term counterplay."
 ],
 mistakes: [
 "Playing slow moves while the opponent starts a direct attack.",
 "Ignoring thematic pawn breaks like ...d5, ...b5, or f4-f5.",
 "Memorizing sharp lines without understanding king safety."
 ]
 },
 {
 id: "french",
 title: "French Defense",
 aliases: ["french", "french defense", "advance french", "tarrasch french", "winawer", "classical french"],
 goal: "Black builds a solid pawn chain with ...e6 and ...d5, then attacks White's center with ...c5 and ...f6.",
 plan: [
 "Black challenges e4 with ...d5.",
 "White often gains space with e5 or keeps tension.",
 "Black attacks the pawn chain, especially with ...c5."
 ],
 keyIdeas: [
 "The French is a pawn-chain opening.",
 "Black's light-squared bishop can be passive, so Black needs active counterplay.",
 "The main breaks are ...c5 and sometimes ...f6."
 ],
 mistakes: [
 "Black accepting a cramped position without counterplay.",
 "White pushing pawns without supporting the center.",
 "Forgetting the pressure on d4 and e5."
 ]
 },
 {
 id: "caro-kann",
 title: "Caro-Kann Defense",
 aliases: ["caro kann", "caro-kann", "advance caro", "exchange caro", "panov", "fantasy variation"],
 goal: "Black builds a solid position with ...c6 and ...d5, often aiming for a healthy structure and safe development.",
 plan: [
 "Black prepares ...d5 with ...c6.",
 "White chooses between gaining space, exchanging, or playing sharp systems.",
 "Black usually develops safely and looks for timely central breaks."
 ],
 keyIdeas: [
 "The Caro-Kann is solid but not passive.",
 "Black often gets a better bishop than in the French.",
 "White must use space actively or Black equalizes comfortably."
 ],
 mistakes: [
 "Black developing too slowly and allowing a kingside attack.",
 "White overextending pawns without piece support.",
 "Ignoring central breaks with ...c5 or ...e5."
 ]
 },
 {
 id: "scandinavian",
 title: "Scandinavian Defense",
 aliases: ["scandinavian", "center counter", "centre counter"],
 goal: "Black immediately challenges e4 with ...d5 and aims for simple development after the queen recapture.",
 plan: [
 "Black plays ...d5 immediately.",
 "After exd5, Black often recaptures with the queen or knight.",
 "Black develops quickly and tries not to lose time with the queen."
 ],
 keyIdeas: [
 "The queen may move early, so tempi matter.",
 "Black wants a clean structure and easy development.",
 "White should gain time without overchasing the queen."
 ],
 mistakes: [
 "Black moving the queen repeatedly without developing.",
 "White chasing the queen while neglecting development.",
 "Allowing simple equality by playing too slowly."
 ]
 },
 {
 id: "pirc-modern",
 title: "Pirc / Modern Defense",
 aliases: ["pirc", "modern defense", "modern", "robatsch"],
 goal: "Black allows White to build a center, then attacks it with pieces and pawn breaks.",
 plan: [
 "Black develops flexibly with ...g6, ...Bg7, and often ...d6.",
 "White usually takes space with e4 and d4.",
 "Black later strikes with ...c5 or ...e5."
 ],
 keyIdeas: [
 "Black must not stay passive after allowing White a big center.",
 "White should use the space advantage before Black breaks the center.",
 "The critical battle is whether White's center is strong or overextended."
 ],
 mistakes: [
 "Black giving White a huge center and never challenging it.",
 "White pushing too many pawns and falling behind in development.",
 "Ignoring dark-square weaknesses around the king."
 ]
 },
 {
 id: "aleekhine",
 title: "Alekhine Defense",
 aliases: ["alekhine", "alekhin"],
 goal: "Black provokes White's pawns forward and then attacks the overextended center.",
 plan: [
 "Black attacks e4 with ...Nf6.",
 "White often advances pawns to gain space.",
 "Black later attacks the advanced center with ...d6, ...c5, and pieces."
 ],
 keyIdeas: [
 "White gets space; Black gets targets.",
 "Black must know when to stop provoking and start attacking the center.",
 "White should not overextend without development."
 ],
 mistakes: [
 "Black moving the knight too much with no compensation.",
 "White pushing pawns until they become weak.",
 "Missing central breaks against the pawn chain."
 ]
 },
 {
 id: "petrov",
 title: "Petrov / Russian Defense",
 aliases: ["petrov", "petroff", "russian defense", "russian game"],
 goal: "Black fights for symmetry and solidity while avoiding early tactical problems.",
 plan: [
 "Black answers Nf3 with ...Nf6, counterattacking e4.",
 "Both sides often develop naturally and fight for the center.",
 "White tries to create imbalance before Black fully equalizes."
 ],
 keyIdeas: [
 "The Petrov is solid but still contains tactics.",
 "Central tension matters more than quick attacks.",
 "White often needs small pressure rather than direct tricks."
 ],
 mistakes: [
 "Automatically copying moves without checking tactics.",
 "Trading everything into a harmless position as White.",
 "Ignoring central pins and knight tactics."
 ]
 },
 {
 id: "philidor-opening",
 title: "Philidor Defense",
 aliases: ["philidor defense", "philidor opening", "philidor"],
 goal: "Black supports e5 with ...d6, aiming for solidity but accepting less space.",
 plan: [
 "Black defends e5 with ...d6.",
 "White usually develops quickly and may prepare d4.",
 "Black needs active development to avoid a cramped position."
 ],
 keyIdeas: [
 "Philidor is solid but can become passive.",
 "White should use the space advantage.",
 "Black often needs ...Nf6, ...Be7, ...O-O, and sometimes ...c6 or ...exd4."
 ],
 mistakes: [
 "Black staying too passive.",
 "White attacking too early without development.",
 "Blocking pieces with unnecessary pawn moves."
 ]
 },
 {
 id: "scotch",
 title: "Scotch Game",
 aliases: ["scotch", "scotch game", "scotch gambit"],
 goal: "White opens the center early with d4 and aims for active piece play.",
 plan: [
 "White challenges e5 quickly with d4.",
 "The center opens earlier than in the Ruy Lopez or Italian.",
 "Both sides must develop actively and watch tactics."
 ],
 keyIdeas: [
 "Open lines favor the better developed side.",
 "White often gets active pieces; Black tries to equalize with accurate development.",
 "Central tactics appear early."
 ],
 mistakes: [
 "Opening the center before pieces are ready.",
 "Ignoring queen and knight tactics.",
 "Trading into a position where the opponent develops freely."
 ]
 },
 {
 id: "vienna",
 title: "Vienna Game",
 aliases: ["vienna", "vienna game"],
 goal: "White develops Nc3 before Nf3 and often prepares f4 or flexible central play.",
 plan: [
 "White supports e4 with Nc3.",
 "White may play f4 for attacking chances.",
 "Black should develop normally and challenge the center."
 ],
 keyIdeas: [
 "The Vienna can transpose to quiet or gambit positions.",
 "The f-pawn advance creates attacking chances but weakens the king.",
 "Control of d5 and e4 is important."
 ],
 mistakes: [
 "Playing f4 without considering king safety.",
 "Black allowing White a free attack.",
 "White delaying development for too many pawn moves."
 ]
 },
 {
 id: "kings-gambit",
 title: "King's Gambit",
 aliases: ["king's gambit", "kings gambit"],
 goal: "White sacrifices the f-pawn to open lines and attack quickly.",
 plan: [
 "White plays f4 to challenge e5 and open the f-file.",
 "Rapid development and king safety are urgent.",
 "Black can accept the pawn or decline and aim for solid development."
 ],
 keyIdeas: [
 "Time is more important than material.",
 "The f-file and central control are White's compensation.",
 "Black should return material if needed to complete development."
 ],
 mistakes: [
 "White playing slowly after sacrificing a pawn.",
 "Black greedily holding material while undeveloped.",
 "Ignoring king safety on both sides."
 ]
 },
 {
 id: "queens-gambit",
 title: "Queen's Gambit",
 aliases: ["queen's gambit", "queens gambit", "qg", "queen gambit"],
 goal: "White offers the c-pawn to gain central control and pressure Black's d5 pawn.",
 plan: [
 "White plays c4 to challenge d5.",
 "White develops naturally and often builds pressure on the queenside and center.",
 "Black chooses between accepting, declining, or Slav-style support."
 ],
 keyIdeas: [
 "The c4 pawn is usually not a real free pawn.",
 "The battle is about control of d5 and e4.",
 "White often wants a long-term space or development edge."
 ],
 mistakes: [
 "Black trying to keep the c4 pawn at all costs.",
 "White recapturing too quickly without gaining anything.",
 "Ignoring the central break e4."
 ]
 },
 {
 id: "qgd",
 title: "Queen's Gambit Declined",
 aliases: ["queen's gambit declined", "queens gambit declined", "qgd", "orthodox defense", "tarrasch defense"],
 goal: "Black keeps a solid center with ...e6 and ...d5 while preparing safe development.",
 plan: [
 "Black supports d5 with ...e6.",
 "White develops pressure with Nc3, Nf3, Bg5, and e3 or e4.",
 "Black looks for ...c5 or ...e5 breaks."
 ],
 keyIdeas: [
 "Black is solid but must avoid passivity.",
 "White often has a small space advantage.",
 "The c-file and central pawn breaks are critical."
 ],
 mistakes: [
 "Black locking in the light bishop forever.",
 "White playing slowly and allowing full equality.",
 "Missing the timing of ...c5."
 ]
 },
 {
 id: "qga",
 title: "Queen's Gambit Accepted",
 aliases: ["queen's gambit accepted", "queens gambit accepted", "qga"],
 goal: "Black accepts the c-pawn but usually does not try to keep it forever.",
 plan: [
 "Black captures c4 and develops quickly.",
 "White tries to regain the pawn with central control.",
 "Black aims for active piece play and a healthy structure."
 ],
 keyIdeas: [
 "The accepted pawn is usually temporary.",
 "White often plays e4 or e3 followed by Bxc4.",
 "Black must avoid falling behind in development."
 ],
 mistakes: [
 "Black trying too hard to hold the c-pawn.",
 "White regaining the pawn without using the tempo advantage.",
 "Ignoring central development."
 ]
 },
 {
 id: "slav",
 title: "Slav Defense",
 aliases: ["slav", "slav defense"],
 goal: "Black supports d5 with ...c6 and keeps the light-squared bishop flexible.",
 plan: [
 "Black plays ...c6 to support d5.",
 "Black often develops the bishop before playing ...e6.",
 "White tries to build pressure with c4, Nf3, Nc3, and e3 or e4."
 ],
 keyIdeas: [
 "The Slav is solid but active.",
 "The c-file and d5 square are central themes.",
 "Black's bishop development is better than in many QGD lines."
 ],
 mistakes: [
 "Black becoming too passive after ...c6.",
 "White allowing Black easy development without pressure.",
 "Ignoring queenside tactics around c4 and b5."
 ]
 },
 {
 id: "semi-slav",
 title: "Semi-Slav Defense",
 aliases: ["semi slav", "semi-slav", "meran", "botvinnik variation"],
 goal: "Black combines ...c6 and ...e6 for a solid but sharp structure with central and queenside counterplay.",
 plan: [
 "Black supports d5 with both ...c6 and ...e6.",
 "White may choose quiet development or sharp systems.",
 "Black often prepares ...dxc4, ...b5, or ...c5."
 ],
 keyIdeas: [
 "The Semi-Slav can become extremely tactical.",
 "Black's structure is solid, but piece activity is essential.",
 "White must decide between pressure and direct central expansion."
 ],
 mistakes: [
 "Memorizing sharp lines without understanding the pawn breaks.",
 "Black delaying development too long.",
 "White opening the center before castling."
 ]
 },
 {
 id: "london",
 title: "London System",
 aliases: ["london", "london system", "jobava london", "mason attack"],
 goal: "White develops a solid setup with Bf4, e3, Nf3, and c3, aiming for easy development and long-term kingside chances.",
 plan: [
 "Develop the dark bishop early to f4.",
 "Build a stable center with e3 and c3.",
 "Castle and prepare Ne5, h3, or kingside attacking ideas."
 ],
 keyIdeas: [
 "The London is a system, but move order still matters.",
 "White should not play automatically against every setup.",
 "Black often challenges with ...c5, ...Qb6, or ...Bd6."
 ],
 mistakes: [
 "Playing the same moves without reacting to Black.",
 "Letting Black win b2 or gain easy ...c5 counterplay.",
 "Starting a kingside attack before development is complete."
 ]
 },
 {
 id: "catalan",
 title: "Catalan Opening",
 aliases: ["catalan", "catalan opening"],
 goal: "White combines Queen's Gambit pressure with a fianchettoed bishop on g2 to pressure the long diagonal.",
 plan: [
 "White plays d4, c4, g3, and Bg2.",
 "White pressures the center and queenside from the long diagonal.",
 "Black chooses between holding c4 or returning it for development."
 ],
 keyIdeas: [
 "The bishop on g2 is the soul of the Catalan.",
 "White often sacrifices or delays regaining c4 for pressure.",
 "Black must solve development without falling into long-term passivity."
 ],
 mistakes: [
 "White trading the g2 bishop without reason.",
 "Black grabbing c4 and falling behind in development.",
 "Ignoring pressure on the long diagonal."
 ]
 },
 {
 id: "nimzo",
 title: "Nimzo-Indian Defense",
 aliases: ["nimzo", "nimzo indian", "nimzo-indian"],
 goal: "Black pins the c3 knight and fights for central control with flexible pawn structures.",
 plan: [
 "Black plays Bb4 to pressure Nc3.",
 "Black often doubles White's c-pawns or keeps the tension.",
 "White tries to use the bishop pair and central space."
 ],
 keyIdeas: [
 "The battle is often bishop pair vs structure.",
 "Black fights for e4 and dark-square control.",
 "White must turn space and bishops into activity."
 ],
 mistakes: [
 "White accepting doubled pawns without compensation.",
 "Black giving up the bishop pair without clear reason.",
 "Ignoring central breaks with e4 or ...c5."
 ]
 },
 {
 id: "kings-indian",
 title: "King's Indian Defense",
 aliases: ["king's indian", "kings indian", "kid"],
 goal: "Black allows White a big center, then attacks it and often plays for kingside counterplay.",
 plan: [
 "Black fianchettoes the bishop with ...g6 and ...Bg7.",
 "White often builds a center with c4, d4, and e4.",
 "Black strikes with ...e5 or ...c5 and may attack with ...f5."
 ],
 keyIdeas: [
 "White has space; Black has dynamic counterplay.",
 "Pawn breaks decide the opening.",
 "The g7 bishop can become extremely powerful if the center opens."
 ],
 mistakes: [
 "Black staying passive after giving White the center.",
 "White ignoring Black's kingside attack.",
 "Closing the center without understanding which side benefits."
 ]
 },
 {
 id: "grunfeld",
 title: "Gr - nfeld Defense",
 aliases: ["grunfeld", "gr - nfeld"],
 goal: "Black allows White a broad center and immediately attacks it with piece pressure.",
 plan: [
 "Black fianchettoes the bishop and plays ...d5.",
 "White often builds a large pawn center.",
 "Black attacks the center with ...c5, ...Nc6, and Bg7 pressure."
 ],
 keyIdeas: [
 "The center is White's strength and Black's target.",
 "Black's bishop on g7 is very important.",
 "Activity often matters more than structure."
 ],
 mistakes: [
 "Black allowing White's center to advance without counterplay.",
 "White pushing the center too far without support.",
 "Trading the wrong pieces and losing dynamic chances."
 ]
 },
 {
 id: "benoni",
 title: "Benoni Defense",
 aliases: ["benoni", "modern benoni", "old benoni"],
 goal: "Black accepts space disadvantage but gets queenside and dark-square counterplay.",
 plan: [
 "Black challenges d4 with ...c5.",
 "White often gains space with d5.",
 "Black uses ...g6, ...Bg7, ...Re8, ...Na6-c7, and ...b5 ideas."
 ],
 keyIdeas: [
 "White has space; Black has dynamic breaks.",
 "The breaks ...b5 and ...f5 are often critical.",
 "The d6 pawn can be weak but also supports counterplay."
 ],
 mistakes: [
 "Black playing passively with less space.",
 "White ignoring queenside counterplay.",
 "Missing tactics on the e-file and long diagonal."
 ]
 },
 {
 id: "benko",
 title: "Benko Gambit",
 aliases: ["benko", "volga gambit"],
 goal: "Black sacrifices a queenside pawn for long-term pressure on the a- and b-files.",
 plan: [
 "Black offers a pawn with ...b5.",
 "Black opens files on the queenside.",
 "White tries to consolidate the extra pawn and avoid passive defense."
 ],
 keyIdeas: [
 "Black's compensation is long-term pressure, not one immediate tactic.",
 "Rooks on a- and b-files are important.",
 "White must be active or the extra pawn becomes irrelevant."
 ],
 mistakes: [
 "Black sacrificing without getting open files.",
 "White greedily holding material while pieces become passive.",
 "Ignoring pressure on b2 and a2."
 ]
 },
 {
 id: "dutch",
 title: "Dutch Defense",
 aliases: ["dutch", "dutch defense", "stonewall", "leningrad dutch", "classical dutch"],
 goal: "Black fights for kingside control with ...f5, accepting some weaknesses for active play.",
 plan: [
 "Black plays ...f5 to control e4.",
 "Black chooses Stonewall, Leningrad, or Classical setups.",
 "White tries to exploit weakened dark squares and central control."
 ],
 keyIdeas: [
 "...f5 creates attacking chances but weakens the king.",
 "The e4 square is central.",
 "White often fights against Black's kingside ambitions."
 ],
 mistakes: [
 "Black weakening the king without development.",
 "White ignoring Black's attacking potential.",
 "Playing Stonewall structures with the bad bishop trapped."
 ]
 },
 {
 id: "english",
 title: "English Opening",
 aliases: ["english opening", "english", "symmetrical english"],
 goal: "White starts with c4, controlling d5 and often creating flexible flank pressure.",
 plan: [
 "White controls d5 with c4.",
 "Development is flexible: g3, Nc3, Nf3, and sometimes d4 or e4.",
 "Black can mirror, play ...e5, or transpose to queen-pawn openings."
 ],
 keyIdeas: [
 "The English is often about transpositions.",
 "White delays central commitment.",
 "Control of d5 and the long diagonal are common themes."
 ],
 mistakes: [
 "Playing system moves without noticing transpositions.",
 "Allowing Black an easy central break.",
 "Delaying development too much for flank pawn moves."
 ]
 },
 {
 id: "reti",
 title: "R - ti Opening",
 aliases: ["reti", "r - ti", "reti opening"],
 goal: "White develops flexibly with Nf3 and often attacks the center from the flank.",
 plan: [
 "White starts with Nf3 and often g3, Bg2, and c4.",
 "White lets Black occupy the center, then attacks it.",
 "The game can transpose into English, Catalan, or Queen's Pawn structures."
 ],
 keyIdeas: [
 "The R - ti is about flexibility.",
 "The center is controlled by pieces before pawns commit.",
 "Transpositions are very common."
 ],
 mistakes: [
 "Playing too passively and giving Black a free center.",
 "Not knowing which pawn break you want.",
 "Ignoring the long diagonal bishop."
 ]
 },
 {
 id: "colle-torre-trompowsky",
 title: "Colle / Torre / Trompowsky Systems",
 aliases: ["colle", "torre", "trompowsky", "veresov", "stonewall attack"],
 goal: "White uses a system setup to develop smoothly and aim for central or kingside pressure.",
 plan: [
 "Develop pieces to natural squares.",
 "Keep a stable pawn center.",
 "Prepare a thematic break or attack, often e4 or Ne5."
 ],
 keyIdeas: [
 "System openings are easy to start but still require plans.",
 "The main pawn break matters more than memorized move order.",
 "White must avoid becoming too predictable."
 ],
 mistakes: [
 "Playing the same setup against every defense.",
 "Never playing the central break.",
 "Starting a kingside attack before pieces are ready."
 ]
 },
 {
 id: "flank-unusual",
 title: "Flank / Unusual Openings",
 aliases: ["bird", "larsen", "nimzowitsch larsen", "polish", "sokolsky", "grob", "van geet", "dunst"],
 goal: "Create an original position while still following opening principles: center, development, and king safety.",
 plan: [
 "Use the unusual first move to control key central squares indirectly.",
 "Develop quickly so the opening does not become only a surprise weapon.",
 "Watch for weaknesses created by flank pawn moves."
 ],
 keyIdeas: [
 "Unusual openings work best when they still fight for the center.",
 "The opponent may equalize if you only rely on surprise.",
 "Pawn moves like f4, b4, or g4 create both activity and weaknesses."
 ],
 mistakes: [
 "Ignoring the center.",
 "Moving too many pawns before developing pieces.",
 "Assuming surprise is enough to get an advantage."
 ]
 },
 {
 id: "gambits",
 title: "Opening Gambits",
 aliases: ["danish gambit", "center game", "evans gambit", "smith morra", "morra gambit", "budapest", "englund", "albin countergambit", "latvian gambit", "elephant gambit", "blackmar diemer"],
 goal: "Sacrifice material for development, open lines, and attacking chances.",
 plan: [
 "Develop quickly after giving material.",
 "Open files and diagonals toward the enemy king.",
 "Use initiative before the opponent consolidates."
 ],
 keyIdeas: [
 "A gambit must give time, activity, or structural damage.",
 "If the attack disappears, the extra pawn matters.",
 "The side accepting the gambit should develop, not just defend material."
 ],
 mistakes: [
 "Sacrificing a pawn and then playing slowly.",
 "Trying to keep the extra pawn at the cost of development.",
 "Attacking without enough pieces involved."
 ]
 }
]

export function getOpeningExplanation(raw: string): OpeningExplanation | null {
 const text = ` ${clean(raw)} `
 if (!text.trim()) return null

 let best: OpeningExplanation | null = null
 let bestScore = 0

 for (const item of OPENING_EXPLANATIONS) {
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