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
 title: 'Analyze',
 subtitle: 'Analyze games, positions, FEN, PGN and pictures',
 icon: '\uD83D\uDD0D',
 accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
 path: '/analyze',
 },
 {
 title: 'Mates',
 subtitle: 'Mate in 1 to Mate in 5 by theme',
 icon: '\u2654',
 accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)',
 path: '/mates',
 },
 {
 title: 'Tactics',
 subtitle: 'Core tactical motifs and subthemes',
 icon: '\u2694\uFE0F',
 accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)',
 path: '/tactics',
 },
 {
 title: 'Endgames',
 subtitle: 'Piece mates and strategic endgames',
 icon: '\u265A',
 accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)',
 path: '/endgame',
 },
 {
 title: 'Board Vision',
 subtitle: 'Visual board training modules',
 icon: '\u25A9',
 accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)',
 path: '/board-vision',
 },
 {
 title: 'Master Games',
 subtitle: 'Progressive line memorization by player',
 icon: '\u2605',
 accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)',
 path: '/master-games',
 },
 {
 title: 'Openings',
 subtitle: 'Learn opening lines through repetition and memory',
 icon: '\uD83D\uDCD6',
 accent: 'linear-gradient(135deg, #5fa8ff 0%, #3f7ad9 100%)',
 path: '/openings',
 },
 {
 title: 'Play Computer',
 subtitle: 'Play, review mistakes, get recommendations',
 icon: '\uD83E\uDD16',
 accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)',
 path: '/play-computer',
 },
 {
 title: 'Fun Chess',
 subtitle: 'Weird games, immortal attacks and bizarre chess curiosities',
 icon: '\u2728',
 accent: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
 path: '/museum',
 },
]

