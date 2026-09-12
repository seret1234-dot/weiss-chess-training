import type { PatternMatePuzzle } from '../trainers/patternMate/PatternMateTrainer'
import MasterProvenanceCard from '../masterPuzzles/MasterProvenanceCard'

export default function MasterMateProvenanceCard({ puzzle, solved }: { puzzle: PatternMatePuzzle | null; solved: boolean }) {
 return <MasterProvenanceCard provenance={puzzle?.masterProvenance} solved={solved} />
}
