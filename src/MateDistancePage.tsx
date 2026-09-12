import { useParams } from 'react-router-dom'
import MateThemeSelectionPage, { type MateThemeCard } from './MateThemeSelectionPage'

export default function MateDistancePage() {
 const { level } = useParams()
 const mateLabel =
  level === 'm1' ? 'Mate in 1' :
  level === 'm2' ? 'Mate in 2' :
  level === 'm3' ? 'Mate in 3' :
  level === 'm4' ? 'Mate in 4' :
  level === 'm5' ? 'Mate in 5' :
  level === 'm6' ? 'Mate in 6' :
  level === 'm7' ? 'Mate in 7' :
  level === 'm8' ? 'Mate in 8' :
  'Mate Themes'

 const themes: MateThemeCard[] = [
  { title: 'Back Rank', subtitle: 'Classic back rank mating patterns', icon: '♟', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)', href: `/mates/${level}/back-rank` },
  { title: 'Arabian', subtitle: 'Knight and rook mating motif', icon: '♟', accent: 'linear-gradient(135deg, #c57b57 0%, #9b5939 100%)', href: `/mates/${level}/arabian` },
  { title: 'Anastasia', subtitle: 'Knight and rook net against the king', icon: '♟', accent: 'linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)', href: `/mates/${level}/anastasia` },
  ...(level === 'm5' ? [] : [{ title: 'Boden', subtitle: 'Crossed bishops mating pattern', icon: '♟', accent: 'linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)', href: `/mates/${level}/boden` }]),
  ...(level === 'm5' ? [] : [{ title: 'Smothered', subtitle: 'Knight mate with trapped king', icon: '♟', accent: 'linear-gradient(135deg, #e27d60 0%, #b45137 100%)', href: `/mates/${level}/smothered` }]),
  { title: 'Hook', subtitle: 'Hook mate attacking pattern', icon: '♟', accent: 'linear-gradient(135deg, #6bc1a3 0%, #3d8f75 100%)', href: `/mates/${level}/hook` },
  { title: 'Dovetail', subtitle: 'Queen-supported boxed king mate', icon: '♟', accent: 'linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)', href: `/mates/${level}/dovetail` },
  { title: 'Kill Box', subtitle: 'Choose a focused Kill Box mating pattern', icon: '♜', accent: 'linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)', href: `/mates/${level}/kill-box` },
  ...(level === 'm4' || level === 'm5' ? [] : [{ title: level === 'm3' ? 'Double Bishop 3+' : 'Double Bishop', subtitle: level === 'm3' ? 'Double bishop mates in 3, 4, and 5' : 'Two bishops mating pattern', icon: 'B', accent: 'linear-gradient(135deg, #4f8cff, #9b5cff)', href: `/mates/${level}/double-bishop` }]),
  { title: 'Mixed', subtitle: 'Mixed mating themes together', icon: '♟', accent: 'linear-gradient(135deg, #d85c8a 0%, #a02f5a 100%)', href: `/mates/${level}/mixed` },
 ]

 const visibleThemes = themes.filter((theme) =>
  (Number(String(level).replace('m', '')) <= 5 || theme.title !== 'Anastasia')
  && !(level === 'm4' && theme.title === 'Boden'),
 )

 return (
  <MateThemeSelectionPage
   title={mateLabel}
   contextLabel="Choose mate theme"
   heroTitle={`${mateLabel} themes`}
   heroDescription="Choose one mating motif and train it separately before mixing patterns together."
   cards={visibleThemes}
   parentHref="/mates"
  />
 )
}
