import { useParams } from "react-router-dom"
import KQKRTrainer from "../KQKRTrainer"

export default function KQKRTrainerPage() {
  const { group } = useParams()

  if (!group) {
    return (
      <div style={{ minHeight: "100vh", background: "#262421", color: "#fff", padding: 24 }}>
        Missing KQKR group.
      </div>
    )
  }

  return <KQKRTrainer group={group} />
}