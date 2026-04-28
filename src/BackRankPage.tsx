import PatternMateTrainer from "./trainers/patternMate/PatternMateTrainer"

export default function BackRankPage() {
  return (
    <PatternMateTrainer
      config={{
        trainerKey: "back_rank_m1",
        trainerTitle: "Back Rank Mate in 1",
        dataBasePath: "/data/lichess/mate_in_1/back_rank",
        studyCourse: "mates",
        studyTheme: "back_rank",
      }}
    />
  )
}