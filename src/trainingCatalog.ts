export type NavCard = {
  title: string
  subtitle: string
  icon: string
  accent: string
  path: string
  children?: NavCard[]
}

export const trainingCatalog: NavCard[] = [
  {
    title: 'Mates',
    subtitle: 'Mate in 1 to Mate in 8 by theme',
    icon: '♚',
    accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
    path: '/mates',
    children: [
      { title: 'Mate in 1', subtitle: 'Single-move checkmate patterns', icon: '♚', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)', path: '/mates/m1' },
      { title: 'Mate in 2', subtitle: 'Two-move mating combinations', icon: '♚', accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)', path: '/mates/m2' },
      { title: 'Mate in 3', subtitle: 'Calculation-based mating patterns', icon: '♚', accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)', path: '/mates/m3' },
      { title: 'Mate in 4', subtitle: 'Longer forcing sequences', icon: '♚', accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)', path: '/mates/m4' },
      { title: 'Mate in 5', subtitle: 'Advanced mating ideas', icon: '♚', accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)', path: '/mates/m5' },
      { title: 'Mate in 6', subtitle: 'Deep calculation training', icon: '♚', accent: 'linear-gradient(135deg, #6bc1a3 0%, #3d8f75 100%)', path: '/mates/m6' },
      { title: 'Mate in 7', subtitle: 'Extended attack sequences', icon: '♚', accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)', path: '/mates/m7' },
      { title: 'Mate in 8', subtitle: 'Maximum depth mating training', icon: '♚', accent: 'linear-gradient(135deg, #d85c8a 0%, #a02f5a 100%)', path: '/mates/m8' },
    ],
  },

  {
    title: 'Tactics',
    subtitle: 'Core tactical motifs and subthemes',
    icon: '⚔',
    accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)',
    path: '/tactics',
    children: [
      { title: 'Fork / Double Attack', subtitle: 'Knight, pawn, bishop, rook, queen, king, mixed', icon: '♞', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)', path: '/tactics/forks' },
      { title: 'Pins', subtitle: 'Absolute and relative pin patterns', icon: '♝', accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)', path: '/tactics/pins' },
    ],
  },

  {
    title: 'Endgames',
    subtitle: 'Piece mates and strategic endgames',
    icon: '♔',
    accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)',
    path: '/endgame',
    children: [
      {
        title: 'Piece Mates',
        subtitle: 'KQK, KRK, 2R, 2B, BN',
        icon: '♚',
        accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
        path: '/endgame/piece-mates',
        children: [
          {
            title: 'Bishop + Knight',
            subtitle: 'Coordinate pieces and force corner mate',
            icon: '♗♘',
            accent: 'linear-gradient(135deg, #4f7cac 0%, #35597d 100%)',
            path: '/endgame/piece-mates/bn',
          },
          {
            title: 'Two Bishops',
            subtitle: 'Restrict and squeeze with bishops',
            icon: '♗♗',
            accent: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
            path: '/endgame/piece-mates/two-bishops',
          },
          {
            title: 'King + Two Rooks',
            subtitle: 'Rook ladder mate technique',
            icon: '♖♖',
            accent: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
            path: '/endgame/piece-mates/k2r',
          },
          {
            title: 'King + Queen',
            subtitle: 'Drive king and deliver mate',
            icon: '♕',
            accent: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            path: '/endgame/piece-mates/kqk',
          },
          {
            title: 'King + Rook',
            subtitle: 'Classic rook mate conversion',
            icon: '♖',
            accent: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)',
            path: '/endgame/piece-mates/krk',
          },
        ],
      },
      {
        title: 'Endgame Strategy',
        subtitle: 'Pawn, rook, queen, fortress and more',
        icon: '♟',
        accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)',
        path: '/endgame/strategy',
      },
    ],
  },

  {
    title: 'Board Vision',
    subtitle: 'Visual board training modules',
    icon: '◧',
    accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)',
    path: '/board-vision',
  },

  {
    title: 'Master Games',
    subtitle: 'Progressive line memorization by player',
    icon: '★',
    accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)',
    path: '/master-games',
  },

  // ✅ FIXED: now goes to library
  {
    title: 'Openings',
    subtitle: 'Learn opening lines through repetition and memory',
    icon: '📖',
    accent: 'linear-gradient(135deg, #5fa8ff 0%, #3f7ad9 100%)',
    path: '/openings',
  },

  {
    title: 'Play Computer',
    subtitle: 'Play, review mistakes, get recommendations',
    icon: '🤖',
    accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)',
    path: '/play-computer',
  },
]