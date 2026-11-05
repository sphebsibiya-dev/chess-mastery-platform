import type { ImportedMove } from '../import/types'
import type { MoveClass } from '../review/types'

/** The class icon shown on the board for the current move. */
export interface ClassIcon {
  square: string
  cls: MoveClass
}

/**
 * Board icon colours. Keep in sync with the `.badge-*` rules in `index.css`,
 * so the move list and the board match.
 */
export const CLASS_COLORS: Record<MoveClass, { bg: string; fg: string }> = {
  brilliant: { bg: '#1baca6', fg: '#161b18' },
  great: { bg: '#5c8bb0', fg: '#fff' },
  best: { bg: '#2f8f46', fg: '#fff' },
  excellent: { bg: '#5a9e3a', fg: '#fff' },
  good: { bg: '#5d6b63', fg: '#fff' },
  book: { bg: '#a88865', fg: '#161b18' },
  inaccuracy: { bg: '#c49a1a', fg: '#161b18' },
  mistake: { bg: '#d9761e', fg: '#fff' },
  miss: { bg: '#e0604f', fg: '#fff' },
  blunder: { bg: '#c9372c', fg: '#fff' },
  forced: { bg: '#4b5a75', fg: '#fff' },
}

/**
 * The icon for the move that led to the current position: on its destination
 * square (chess.js `to`, so g1/c1 for castling). Undefined at the start
 * position or before the move is classified.
 */
export function classIconFor(
  move: Pick<ImportedMove, 'to'> | undefined,
  cls: MoveClass | undefined,
): ClassIcon | undefined {
  if (!move || !cls) return undefined
  return { square: move.to, cls }
}
