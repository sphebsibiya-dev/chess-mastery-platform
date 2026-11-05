import type { MoveClass } from '../review/types'
import { CLASS_INFO } from './analysisView'
import { CLASS_COLORS } from './boardClassIcon'

/**
 * Round class icon drawn in the corner of a board square. Hidden from screen
 * readers: the move list and the status line already announce the class.
 */
export default function ClassIcon({ cls }: { cls: MoveClass }) {
  const { bg, fg } = CLASS_COLORS[cls]
  const { symbol } = CLASS_INFO[cls]
  // Two-character symbols ('!!', '??', '?!') need a smaller font to fit.
  const fontSize = symbol.length > 1 ? 9 : 12
  return (
    <svg className="board-class-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9.25" fill={bg} stroke="rgba(0, 0, 0, 0.35)" strokeWidth="1" />
      <text
        x="10"
        y="10.5"
        fill={fg}
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {symbol}
      </text>
    </svg>
  )
}
