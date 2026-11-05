export type MoveClass = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced'

export interface MoveReview {
  ply: number
  cls: MoveClass
  /** Mover's win% before the move (best play), 0..100. */
  wpBefore: number
  /** Mover's win% after the move, 0..100. */
  wpAfter: number
  /** max(0, wpBefore - wpAfter). */
  loss: number
  /** Lichess move accuracy, 0..100 (100 for forced moves). */
  accuracy: number
  /** Engine's best move from the position before this move, as SAN. */
  bestMoveSan?: string
}

/** Game accuracy per side; undefined for a side that made no moves. */
export interface SideAccuracy {
  w?: number
  b?: number
}
