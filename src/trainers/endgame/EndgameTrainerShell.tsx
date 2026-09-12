import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import TrainerShell from '../../components/trainer/TrainerShell'
import { BigMessage, PanelCard, SectionTitle } from '../../components/trainer/ui'
import './endgameLayout.css'

type Props = ComponentProps<typeof TrainerShell>

function heading(node: ReactNode): string {
  if (!isValidElement<{ children?: ReactNode }>(node)) return ''
  if (node.type === SectionTitle) return Children.toArray(node.props.children).join('')
  return Children.toArray(node.props.children).map(heading).find(Boolean) || ''
}

/** Recompose existing cards without replacing their handlers, content or state. */
function EndgamePanel({ children }: { children: ReactNode }) {
  const cards = isValidElement<{ children?: ReactNode }>(children) ? Children.toArray(children.props.children) : Children.toArray(children)
  let passedStatus = false
  const primary: ReactNode[] = [], secondary: ReactNode[] = []
  for (const [index, card] of cards.entries()) {
    if (!isValidElement(card)) continue
    const title = heading(card)
    const status = card.type === BigMessage
    const kind = title === 'Actions' ? 'actions' : ['Chunk navigation', 'Navigation'].includes(title) ? 'navigation' : status ? 'status' : title === 'First decision' ? 'decision' : 'core'
    const reference = ['Puzzle info', 'Message', 'Danger zone'].includes(title) || (passedStatus && card.type === PanelCard && !title)
    if (reference) secondary.push(<div key={index} className="endgame-reference-card">{!title && <SectionTitle>Chunk positions</SectionTitle>}{card}</div>)
    else primary.push(<div key={index} className={`endgame-section endgame-section--${kind}`}>{card}</div>)
    if (status) passedStatus = true
  }
  return <div className="endgame-panel-grid">
    {primary}
    {secondary.length > 0 && <details className="endgame-secondary">
      <summary>Puzzle info, message &amp; reset options</summary>
      <div className="endgame-secondary-content">{secondary}</div>
    </details>}
  </div>
}

/** Endgame-only presentation. The base shell and Pattern trainer layouts are untouched. */
export default function EndgameTrainerShell(props: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, cap: window.innerHeight - 300 }))
  const desktop = viewport.width > 768
  // Reserve a readable panel plus page gutters, board frame, divider and gaps.
  // Legacy trainer boardSize (usually 580px) is not a desktop maximum.
  const horizontalChrome = 100 + (props.boardLeft ? 48 : 0)
  const boardSize = desktop ? Math.min(800, Math.max(240, viewport.cap), Math.max(240, viewport.width - 600 - horizontalChrome)) : props.boardSize
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const slot = element.querySelector('.trainer-shell-managed-board-slot')?.getBoundingClientRect()
        const column = element.querySelector('.trainer-shell-board-column')?.getBoundingClientRect()
        const controls = element.querySelector('.trainer-shell-board-controls')?.getBoundingClientRect()
        if (!slot || !column) return
        // Reserve the normal AI control block even in Mouse mode, so changing
        // input mode does not change the board/panel proportions.
        const reserve = Math.max(0, 140 - (controls?.height ?? 0))
        const cap = Math.floor(innerHeight - (slot.top + scrollY) - (column.bottom - slot.bottom) - reserve - 72)
        setViewport(previous => previous.width === innerWidth && previous.cap === cap ? previous : { width: innerWidth, cap })
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const controls = element.querySelector('.trainer-shell-board-controls')
    if (controls) observer.observe(controls)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', measure) }
  }, [])
  const boardLeft = desktop && isValidElement<{ style?: object }>(props.boardLeft)
    ? cloneElement(props.boardLeft, { style: { ...props.boardLeft.props.style, height: boardSize } }) : props.boardLeft
  return <div className="endgame-layout" ref={root}>
    <TrainerShell {...props} boardSize={boardSize} boardLeft={boardLeft}
      footerRight={typeof props.footerRight === 'string' && /^\d+px$/.test(props.footerRight) ? `${desktop ? boardSize : Math.max(0, viewport.width - 16)}px` : props.footerRight}
      preventPageScroll sidePanelColumns={1}
      sidePanelWidth={desktop ? Math.min(680, viewport.width - boardSize - horizontalChrome) : props.sidePanelWidth}
      sidePanel={<EndgamePanel>{props.sidePanel}</EndgamePanel>} />
  </div>
}
