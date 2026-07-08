type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export default function PromotionChoiceOverlay({
 onSelect,
 onCancel,
 title = 'Choose promotion',
}: {
 onSelect: (piece: PromotionPiece) => void
 onCancel: () => void
 title?: string
}) {
 const pieces: Array<[PromotionPiece, string]> = [
 ['q', '♛'],
 ['r', '♜'],
 ['b', '♝'],
 ['n', '♞'],
 ]

 return (
 <div
 style={{
 position: 'absolute',
 inset: 0,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 background: 'rgba(0,0,0,0.35)',
 zIndex: 20,
 }}
 >
 <div
 style={{
 background: '#111827',
 border: '1px solid rgba(255,255,255,0.18)',
 borderRadius: 14,
 padding: 14,
 boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
 }}
 >
 <div style={{ color: '#e5e7eb', fontWeight: 800, marginBottom: 10 }}>
 {title}
 </div>

 <div style={{ display: 'flex', gap: 8 }}>
 {pieces.map(([piece, label]) => (
 <button
 key={piece}
 onClick={() => onSelect(piece)}
 style={{
 width: 52,
 height: 52,
 borderRadius: 10,
 border: '1px solid rgba(255,255,255,0.18)',
 background: '#1f2937',
 color: '#f9fafb',
 fontSize: 30,
 cursor: 'pointer',
 }}
 >
 {label}
 </button>
 ))}
 </div>

 <button
 onClick={onCancel}
 style={{
 marginTop: 10,
 width: '100%',
 border: '1px solid rgba(255,255,255,0.14)',
 borderRadius: 8,
 background: 'transparent',
 color: '#d1d5db',
 padding: '7px 10px',
 cursor: 'pointer',
 }}
 >
 Cancel
 </button>
 </div>
 </div>
 )
}