import { Chess } from 'chess.js'

/** The result of applying a single legal move to a position. */
export interface FreeMove {
  /** FEN after the move. */
  fen: string
  /** SAN of the move, e.g. 'e4', 'Nxe5', 'e8=Q'. */
  san: string
  /** Side to move AFTER the move (for `toWhitePov`). */
  stm: 'w' | 'b'
}

/**
 * Applies one move for the side to move in `fen` and returns the resulting
 * position, or `null` if the move is illegal (including moving an opponent's
 * piece or an off-board square).
 *
 * Pure and React-free: `chess.js` validates the move and produces SAN/FEN, so no
 * chess rules are hand-rolled. Promotions default to a queen when `promotion` is
 * omitted.
 */
export function applyFreeMove(
  fen: string,
  from: string,
  to: string,
  promotion: 'q' | 'r' | 'b' | 'n' = 'q',
): FreeMove | null {
  const chess = new Chess(fen)
  try {
    const move = chess.move({ from, to, promotion })
    return { fen: chess.fen(), san: move.san, stm: chess.turn() }
  } catch {
    // chess.js throws on an illegal / malformed move.
    return null
  }
}
