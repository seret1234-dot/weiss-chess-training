import { PanelCard, SectionTitle } from '../components/trainer/ui'

export type MasterPuzzleProvenance = {
 masterGame: Record<string, string | number | null | undefined>
 historicalMoveSan?: string
 historicalMoveUci?: string
 sourceFen?: string
 sourcePly?: number
 learnerSide?: 'w' | 'b'
}

function dateLabel(game: Record<string, string | number | null | undefined>) {
 const date = typeof game.date === 'string' && !game.date.includes('?') ? game.date : game.year
 return [game.event, game.site, date].filter(Boolean).join(' · ')
}

export default function MasterProvenanceCard({ provenance, solved }: { provenance?: MasterPuzzleProvenance; solved: boolean }) {
 if (!provenance) return null
 const game = provenance.masterGame
 const sourceRoute = typeof game.route === 'string' ? game.route : null
 return (
  <PanelCard>
   <SectionTitle>Master game</SectionTitle>
   <div style={{ fontSize: 12, lineHeight: 1.5, color: '#d0d0d0' }}>
    <div style={{ color: '#f1f1f1', fontWeight: 800 }}>{game.white || 'White'} – {game.black || 'Black'}</div>
    <div>{dateLabel(game) || 'Historical master game'}</div>
    {game.result ? <div>Result: {game.result}</div> : null}
    {provenance.learnerSide ? <div>You play: {provenance.learnerSide === 'w' ? 'White' : 'Black'}</div> : null}
    {sourceRoute ? <a href={sourceRoute} style={{ color: '#f2c14e' }}>Source game</a> : null}
    {provenance.sourceFen ? <details style={{ marginTop: 5 }}><summary>Source details</summary><code style={{ overflowWrap: 'anywhere' }}>Root FEN: {provenance.sourceFen}</code></details> : null}
    {solved && provenance.historicalMoveSan ? <div style={{ marginTop: 7, color: '#f2c14e' }}>Played in the game: {provenance.historicalMoveSan}</div> : null}
   </div>
  </PanelCard>
 )
}
