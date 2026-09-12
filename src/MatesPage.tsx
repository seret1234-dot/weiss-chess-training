import MateLandingPage, { type MateDistanceCard } from './MateLandingPage'

const cards: MateDistanceCard[] = [
 { title: 'Mate in 1', subtitle: 'Single move checkmate patterns', icon: '♚', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)', href: '/mates/m1' },
 { title: 'Mate in 2', subtitle: 'Two move mating combinations', icon: '♚', accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)', href: '/mates/m2' },
 { title: 'Mate in 3', subtitle: 'Calculation-based mating patterns', icon: '♚', accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)', href: '/mates/m3' },
 { title: 'Mate in 4', subtitle: 'Longer forcing sequences', icon: '♚', accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)', href: '/mates/m4' },
 { title: 'Mate in 5', subtitle: 'Advanced mating ideas', icon: '♚', accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)', href: '/mates/m5' },
]

export default function MatesPage() {
 return <MateLandingPage cards={cards} />
}
