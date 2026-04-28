import PatternMateTrainer from "./trainers/patternMate/PatternMateTrainer"
import { supabase } from "./lib/supabase"

export default function AnastasiaMateIn2Page() {
  return (
    <PatternMateTrainer
      config={{
        trainerKey: "anastasia_m2",
        trainerTitle: "Anastasia Mate in 2",
        dataBasePath: "/data/lichess/mate_in_2/anastasia",

        studyCourse: "mates",
        studyTheme: "mate_in_2",

        onPuzzleSolved: async (payload) => {
          const { data: sessionData } = await supabase.auth.getSession()
          const userId = sessionData.session?.user?.id

          if (!userId) {
            console.log("No signed in user, skipping progress save")
            return
          }

          const quality = payload.wasFast ? 5 : 4

          const { error } = await supabase.rpc("update_training_progress", {
            p_user_id: userId,
            p_course: payload.course ?? "mates",
            p_theme: payload.theme ?? "mate_in_2",
            p_item_id: payload.puzzleId,
            p_quality: quality,
          })

          if (error) {
            console.error("SAVE PROGRESS ERROR:", error)
          } else {
            console.log("PROGRESS SAVED:", {
              userId,
              puzzleId: payload.puzzleId,
              quality,
            })
          }
        },
      }}
    />
  )
}