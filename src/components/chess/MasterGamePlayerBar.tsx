import type { CSSProperties } from 'react'

export type MasterGamePlayerBarPlayer = {
 name: string
 side: 'White' | 'Black'
 meta: string
}

export function masterGamePlayerBarStyle(): CSSProperties {
 return {
  background: '#1f1d1c',
  borderRadius: 12,
  padding: '10px 14px',
  border: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
 }
}

export default function MasterGamePlayerBar({ player }: { player: MasterGamePlayerBarPlayer }) {
 return (
  <div style={masterGamePlayerBarStyle()}>
   <div style={{ minWidth: 0 }}>
    <div
     style={{
      fontSize: 19,
      fontWeight: 800,
      color: '#f3f3f3',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
     }}
    >
     {player.name}
    </div>
    <div style={{ fontSize: 12, color: '#b8b8b8', marginTop: 2 }}>{player.side}</div>
   </div>

   <div style={{ flexShrink: 0, fontSize: 12, color: '#c9c9c9', textAlign: 'right' }}>
    {player.meta}
   </div>
  </div>
 )
}
