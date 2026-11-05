import { Chess } from 'chess.js'
import { uciToSan } from '../chess/uci'
import type { Eval, GameAnalysis } from '../engine/types'
import type { ImportedGame, ImportedMove } from '../import/types'
import { accuracyFromLoss, gameAccuracy } from './accuracy'
import type { MoveClass, MoveReview, SideAccuracy } from './types'
import { moverWinPercent, winPercent } from './winProbability'

/**
 * Win% loss thresholds (mover's POV, 0..100 scale). A move whose loss is below
 * a threshold gets that class; anything at or above MISTAKE is a blunder.
 * Exported so they can be tuned later.
 */
export const EXCELLENT_MAX_LOSS = 2
export const GOOD_MAX_LOSS = 5
export const INACCURACY_MAX_LOSS = 10
export const MISTAKE_MAX_LOSS = 20

export function classForLoss(loss: number): Exclude<MoveClass, 'best' | 'forced'> {
  if (loss < EXCELLENT_MAX_LOSS) return 'excellent'
  if (loss < GOOD_MAX_LOSS) return 'good'
  if (loss < INACCURACY_MAX_LOSS) return 'inaccuracy'
  if (loss < MISTAKE_MAX_LOSS) return 'mistake'
  return 'blunder'
}

export interface ClassifyInput {
  move: Pick<ImportedMove, 'ply' | 'color' | 'lan' | 'fenBefore'>
  /** Eval of the position before the move (best play), White POV. */
  before: Eval
  /** Eval of the position after the move, White POV. */
  after: Eval
  /** Engine best move (UCI) in the position before the move. */
  bestMove?: string
}

/**
 * Classifies one move:
 * - `forced` if it was the only legal move;
 * - `best` if it is the engine's best move (even if eval noise shows a small loss);
 * - otherwise by the mover's win% loss, see the thresholds above.
 */
export function classifyMove({ move, before, after, bestMove }: ClassifyInput): MoveReview {
  const wpBefore = moverWinPercent(before, move.color)
  const wpAfter = moverWinPercent(after, move.color)
  const loss = Math.max(0, wpBefore - wpAfter)
  const legalMoves = new Chess(move.fenBefore).moves().length

  let cls: MoveClass
  if (legalMoves === 1) cls = 'forced'
  else if (bestMove !== undefined && move.lan === bestMove) cls = 'best'
  else cls = classForLoss(loss)

  const review: MoveReview = {
    ply: move.ply,
    cls,
    wpBefore,
    wpAfter,
    loss,
    accuracy: cls === 'forced' ? 100 : accuracyFromLoss(loss),
  }
  const bestMoveSan = bestMove ? uciToSan(move.fenBefore, bestMove) : undefined
  if (bestMoveSan) review.bestMoveSan = bestMoveSan
  return review
}

export interface GameReview {
  reviews: MoveReview[]
  accuracy: SideAccuracy
}

/** Classifies every move and computes each side's accuracy. */
export function classifyGame(game: ImportedGame, analysis: GameAnalysis): GameReview {
  const { positions } = analysis
  if (positions.length !== game.moves.length + 1) {
    throw new Error(`Expected ${game.moves.length + 1} positions, got ${positions.length}`)
  }
  const reviews = game.moves.map((move, i) =>
    classifyMove({ move, before: positions[i].eval, after: positions[i + 1].eval, bestMove: positions[i].bestMove }),
  )
  const accuracy = gameAccuracy(
    positions.map((p) => winPercent(p.eval)),
    reviews.map((r, i) => ({ color: game.moves[i].color, accuracy: r.accuracy })),
  )
  return { reviews, accuracy }
}
