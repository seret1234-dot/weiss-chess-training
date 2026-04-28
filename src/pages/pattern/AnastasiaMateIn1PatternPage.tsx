import PatternMateTrainer from "../../trainers/patternMate/PatternMateTrainer"

export default function AnastasiaMateIn1PatternPage() {
  return (
    <PatternMateTrainer
      config={{
        trainerKey: "anastasia-mate-in-1",
        trainerTitle: "Anastasia Mate in 1",
        dataBasePath: "/data/lichess/mate_in_1/anastasia",
      }}
    />
  )
}