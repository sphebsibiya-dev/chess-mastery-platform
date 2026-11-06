import type { PositionAnalysis } from '../engine/types'
import type { ImportedMove } from '../import/types'
import { GOOD_MAX_LOSS, sacrificedMaterial } from './classify'
import type { Opening } from './openings/book'
import type { MoveClass, MoveReview } from './types'

/** Classes where we do NOT append "Best was X." at the end. */
const NO_BEST_SUFFIX: ReadonlySet<MoveClass> = new Set(['best', 'forced', 'book', 'brilliant', 'great'])

export interface ExplainContext {
  move: Pick<ImportedMove, 'ply' | 'color' | 'lan' | 'fenBefore' | 'san'>
  /** Engine analysis of the position before the move (positions[ply - 1]). */
  posBefore: PositionAnalysis
  /** Engine analysis of the position after the move (positions[ply]). */
  posAfter: PositionAnalysis
  /** Named opening for the current position, only set for book moves. */
  opening?: Opening
}

/**
 * Returns true when the given loss (mover's win% drop) is within the acceptable
 * range for a retry attempt to be counted as good enough.
 * Exported for unit tests; uses GOOD_MAX_LOSS from classify.ts.
 */
export function acceptsRetry(loss: number): boolean {
  return loss <= GOOD_MAX_LOSS
}

/**
 * One sentence explaining a move from engine data.
 * Pure function; no side effects; usable in unit tests without a real engine.
 */
export function explainMove(review: MoveReview, ctx: ExplainContext): string {
  const { cls } = review
  const { move, posAfter, opening } = ctx

  switch (cls) {
    case 'book':
      return opening ? `Part of the ${opening.name} opening.` : 'A book move in the opening.'

    case 'brilliant': {
      const sacrifice = sacrificedMaterial(move.fenBefore, move.lan, move.color, posAfter.pv)
      if (sacrifice !== undefined && sacrifice >= 1) {
        return `A brilliant sacrifice of about ${sacrifice.toFixed(1)} pawns of material that keeps the initiative.`
      }
      return 'A brilliant sacrifice that maintains the initiative.'
    }

    case 'great':
      return 'The only move that keeps the advantage.'

    case 'best':
      return "The engine's top choice for this position."

    case 'excellent':
      return 'An excellent move.'

    case 'good':
      return 'A good move.'

    case 'forced':
      return 'The only legal reply.'

    default:
      return explainNegativeMove(review, ctx)
  }
}

function explainNegativeMove(review: MoveReview, ctx: ExplainContext): string {
  const { cls, bestMoveSan, wpBefore, wpAfter } = review
  const { move, posBefore, posAfter } = ctx
  const appendBest = !NO_BEST_SUFFIX.has(cls) && bestMoveSan ? ` Best was ${bestMoveSan}.` : ''

  // 1. Allows mate (opponent wins after this move)
  if (posAfter.eval.kind === 'mate' && posAfter.eval.winner !== move.color) {
    const inMoves = posAfter.eval.in
    if (inMoves === 0) return `This move leads to immediate checkmate.${appendBest}`
    return `This move allows mate in ${inMoves}.${appendBest}`
  }

  // 2. Misses a forced mate that existed before the move
  if (
    posBefore.eval.kind === 'mate' &&
    posBefore.eval.winner === move.color &&
    !(posAfter.eval.kind === 'mate' && posAfter.eval.winner === move.color)
  ) {
    const inMoves = posBefore.eval.in
    return `Missed a forced mate in ${inMoves}.${appendBest}`
  }

  // 3. Hangs / loses material along the best continuation
  const sacrifice = sacrificedMaterial(move.fenBefore, move.lan, move.color, posAfter.pv)
  if (sacrifice !== undefined && sacrifice >= 1) {
    const amount =
      sacrifice >= 3
        ? `about ${Math.round(sacrifice)} pawns of material`
        : `material worth about ${sacrifice.toFixed(1)} pawns`
    return `This move hangs ${amount}.${appendBest}`
  }

  // 4. Win% drop fallback
  const before = Math.round(wpBefore)
  const after = Math.round(wpAfter)
  return `Win chance dropped from ${before}% to ${after}%.${appendBest}`
}
