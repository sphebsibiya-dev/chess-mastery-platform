import type { CSSProperties } from 'react'
import type { Eval } from '../engine/types'
import { evalBarView } from './evalBarGeometry'

interface EvalBarProps {
  evaluation: Eval | undefined
  /** Which side is at the bottom of the board. Defaults to White. */
  orientation?: 'white' | 'black'
}

/**
 * Evaluation bar for the current position: vertical beside the board on wide
 * screens, horizontal above it on phones (see `.eval-bar` in `index.css`).
 */
export default function EvalBar({ evaluation, orientation = 'white' }: EvalBarProps) {
  const view = evalBarView(evaluation)
  const className = [
    'eval-bar',
    orientation === 'black' && 'eval-bar--flipped',
    view.pending && 'eval-bar--pending',
  ]
    .filter(Boolean)
    .join(' ')
  const style = { '--white-share': `${view.whiteShare}%` } as CSSProperties
  return (
    <div className={className} role="img" aria-label={view.ariaText} style={style}>
      <div className="eval-bar-white" />
      {view.label && <span className={`eval-bar-label eval-bar-label-${view.labelSide}`}>{view.label}</span>}
    </div>
  )
}
