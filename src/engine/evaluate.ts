import { Chess } from 'chess.js'
import type { Eval, UciScore } from './types'

export type Color = 'w' | 'b'

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** The side to move, read from the FEN's second field. */
export function sideToMove(fen: string): Color {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w'
}

/**
 * Converts a Stockfish score (side-to-move POV) to White's POV.
 * `mate N` with N > 0 means the side to move mates; N <= 0 means it gets mated
 * (`mate 0` is checkmate on the board).
 */
export function toWhitePov(score: UciScore, stm: Color): Eval {
  if (score.type === 'cp') {
    const cp = stm === 'w' ? score.value : -score.value
    // Avoid -0 so equality checks and formatting stay simple.
    return { kind: 'cp', cp: cp === 0 ? 0 : cp }
  }
  const winner = score.value > 0 ? stm : other(stm)
  return { kind: 'mate', in: Math.abs(score.value), winner }
}

/**
 * Scores positions where the game is already over, without asking the engine.
 * Returns undefined for a normal position. Repetition cannot be seen from a lone
 * FEN, so those positions still go to the engine.
 */
export function terminalEval(fen: string): Eval | undefined {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { kind: 'mate', in: 0, winner: other(chess.turn()) }
  if (chess.isDraw() || chess.isStalemate()) return { kind: 'draw' }
  return undefined
}
