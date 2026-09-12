export const endgameTrainers = [
  ['/endgame/piece-mates/bn','src/BNMateTrainer.tsx'],
  ['/endgame/piece-mates/two-bishops','src/TwoBishopsFinalTrainer.tsx'],
  ['/endgame/piece-mates/k2r','src/K2RooksTrainer.tsx'],
  ['/endgame/piece-mates/kqk','src/KQKTrainer.tsx'],
  ['/endgame/piece-mates/krk','src/KRKTrainer.tsx'],
  ['/endgame-studies/kqkr','src/KQKRTrainer.tsx'],
  ['/endgame-studies/kqkp7','src/KQKP7Trainer.tsx'],
  ...[['krkp','KRKP'],['knnkp','KNNKP'],['knnkp-forced','KNNKPForcedMate'],['kpk','KPK'],['stalemate','Stalemate'],['lucena','Lucena'],['philidor','Philidor'],['pawns','PawnRaces'],['zugzwang','Zugzwang'],['fortress','Fortress'],['shouldering','Shouldering']].map(([route,name])=>[`/endgame-studies/${route}`,`src/pages/endgames/${name}Trainer.tsx`]),
]
export const sharedLegacyTemplates = ['src/GenericEndgameTrainer.tsx','src/pages/endgames/OppositionTrainer.tsx']
export const dormantEndgameComponents = ['src/trainers/KPKTrainer.tsx','src/trainers/StalemateTrainer.tsx','src/trainers/OppositionTrainer.tsx','src/TwoBishopsMateTrainer.tsx','src/TwoBishopsSimpleTrainer.tsx']
export const endgameTextRoots = ['public/data/endgames','public/data/kqkr','public/data/lichess/bn_v3','two_bishop_mate','two_rooks_mate']
export const endgameTextFiles = ['src/EndgamePage.tsx','src/EndgameStudiesPage.tsx','src/PieceMatesPage.tsx','src/kqk_mates_1_to_9.json','src/kqkr_positions.json','src/krk_chunks.json']
export const corruptedEndgameText = /[\u0080-\u009f\ufffd]|Ã.|Â.|â€| - ™/u
