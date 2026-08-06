export const ATOMIC_TAXONOMY_VERSION = 'verified-lichess-tactics-v1-atomic-taxonomy'
export const RAW_TAG_CANDIDATES = Object.freeze({
  fork: ['Knight Fork', 'Pawn Fork', 'Bishop Fork', 'Rook Fork', 'Queen Fork', 'King Fork', 'Double Attack'],
  pin: ['Bishop Pin', 'Rook Pin', 'Queen Pin'],
  skewer: ['Bishop Skewer', 'Rook Skewer', 'Queen Skewer'],
  deflection: ['Deflection'],
  capturingDefender: ['Removal of Defender by Capture'],
  attraction: ['Decoy / Attraction'],
  interference: ['Interference'],
  clearance: ['Square Clearance', 'File Clearance', 'Rank Clearance', 'Diagonal Clearance', 'Clearance Sacrifice'],
  discoveredAttack: ['Discovered Attack'],
  discoveredCheck: ['Discovered Check'],
  doubleCheck: ['Double Check'],
})
export const PRIORITY_THEMES = Object.freeze([...new Set(Object.values(RAW_TAG_CANDIDATES).flat())])
export const candidateTags = Object.freeze(Object.keys(RAW_TAG_CANDIDATES))
export function rawTags(row) { return String(row.Themes ?? '').trim().split(/\s+/).filter(Boolean) }
export function candidateAtomicThemes(tags) { return [...new Set(tags.flatMap((tag) => RAW_TAG_CANDIDATES[tag] ?? []))] }

// Every tag observed by the full read-only audit is deliberately accounted for.
// `metadata` means it may enrich a verified record but never creates a vague course;
// `unavailable` means a dedicated validator is required before it can enter the corpus.
export const COMPLETE_TAG_COVERAGE = Object.freeze({
  fork:['Knight/Pawn/Bishop/Rook/Queen/King Fork','moving-piece','forkGeometryAndBestDefense','parent'], pin:['Bishop/Rook/Queen Pin','absolute/relative/functional','pinRelation','parent'], skewer:['Bishop/Rook/Queen Skewer','line-piece','skewerRelation','parent'],
  discoveredAttack:['Discovered Attack',null,'newlyOpenedLine','parent'], discoveredCheck:['Discovered Check',null,'revealedCheck','parent'], doubleCheck:['Double Check',null,'twoCheckingPieces','parent'],
  deflection:['Deflection',null,'defenderDutyBroken','parent'], attraction:['Decoy / Attraction',null,'forcedDestination','parent'], capturingDefender:['Removal of Defender by Capture',null,'defenderCaptured','parent'], interference:['Interference',null,'defensiveLineBlocked','parent'], clearance:['Square/File/Rank/Diagonal Clearance',null,'clearedLine','parent'],
  sacrifice:['General Sacrifice','exchange/desperado/clearance','sacrificeCompensation','unavailable'], hangingPiece:['Hanging Piece',null,'bestDefenseMaterialGain','unavailable'], trappedPiece:['Trapped Piece',null,'escapeEnumeration','unavailable'], xRayAttack:['X-Ray Attack',null,'throughPieceLine','unavailable'], intermezzo:['Zwischenzug','zwischencheck','intermediateForcingMove','unavailable'], quietMove:['Quiet Tactical Move',null,'quietDecisiveThreat','unavailable'],
  promotion:['Promotion',null,'promotionCentrality','parent'], underPromotion:['Knight/Rook/Bishop Underpromotion','promoted-piece','underpromotionNecessity','parent'], enPassant:['En Passant Tactic',null,'enPassantObjective','parent'], advancedPawn:['Advanced Pawn Tactic',null,'advancedPawnConcreteThreat','unavailable'],
  defensiveMove:['Defensive Capture/Interposition/Counterattack/Perpetual/Stalemate/Promotion/Simplification','defense mechanism','defenseClassifier','unavailable'], zugzwang:['Zugzwang',null,'allLegalMovesWorsen','unavailable'],
  attackingF2F7:['Attack on f2/f7','target square','kingWeaknessObjective','unavailable'], exposedKing:['Exposed King Tactic',null,'forcedExposure','unavailable'], kingsideAttack:['Kingside Tactical Attack',null,'concreteKingObjective','unavailable'], queensideAttack:['Queenside Tactical Attack',null,'concreteKingObjective','unavailable'],
  backRankMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], smotheredMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], hookMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], anastasiaMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], arabianMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], bodenMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], dovetailMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], doubleBishopMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], killBoxMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'],
  mate:['forcedMate result metadata','mate distance','forcedMateProof','metadata'], mateIn1:['Mates curriculum','distance','separateMateValidator','metadata'], mateIn2:['Mates curriculum','distance','separateMateValidator','metadata'], mateIn3:['Mates curriculum','distance','separateMateValidator','metadata'], mateIn4:['Mates curriculum','distance','separateMateValidator','metadata'], mateIn5:['Mates curriculum','distance','separateMateValidator','metadata'], oneMove:['stage metadata',null,'stageDerivation','metadata'],
  short:['length metadata',null,'stageDerivation','metadata'], long:['length metadata',null,'stageDerivation','metadata'], veryLong:['length metadata',null,'stageDerivation','metadata'], opening:['phase metadata',null,'phaseClassification','metadata'], middlegame:['phase metadata',null,'phaseClassification','metadata'], endgame:['phase metadata',null,'phaseClassification','metadata'], crushing:['evaluation metadata',null,'evaluation','metadata'], advantage:['evaluation metadata',null,'evaluation','metadata'], equality:['evaluation metadata',null,'evaluation','metadata'],
  rookEndgame:['endgame metadata',null,'endgameClassifier','metadata'], pawnEndgame:['endgame metadata',null,'endgameClassifier','metadata'], bishopEndgame:['endgame metadata',null,'endgameClassifier','metadata'], knightEndgame:['endgame metadata',null,'endgameClassifier','metadata'], queenEndgame:['endgame metadata',null,'endgameClassifier','metadata'], queenRookEndgame:['endgame metadata',null,'endgameClassifier','metadata'],
  castling:['special move metadata',null,'legalReplay','metadata'], triangleMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], cornerMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], operaMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], pillsburysMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], morphysMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], blindSwineMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], vukovicMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'], balestraMate:['Mates curriculum','mate pattern','separateMateValidator','metadata'],
  master:['source metadata',null,'sourceFlag','metadata'], masterVsMaster:['source metadata',null,'sourceFlag','metadata'], superGM:['source metadata',null,'sourceFlag','metadata'], queenEndgame:['endgame metadata',null,'endgameClassifier','metadata'], queenRookEndgame:['endgame metadata',null,'endgameClassifier','metadata'], trappedPiece:['Trapped Piece',null,'escapeEnumeration','unavailable'], defensiveMove:['defensive atomic taxonomy',null,'defenseClassifier','unavailable']
})
