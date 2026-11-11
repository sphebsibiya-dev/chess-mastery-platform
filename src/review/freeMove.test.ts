import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import { applyFreeMove } from './freeMove'

// This chess.js version only records the en-passant square when a capture is
// actually available, so after 1.e4 the field is '-'.
const FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
// White pawn on e7; kings placed so e8 promotion is legal and gives no check.
const PROMO_FEN = '8/4P3/8/8/8/1k6/8/4K3 w - - 0 1'

describe('applyFreeMove', () => {
  it('applies a legal pawn move for White from the start position', () => {
    const result = applyFreeMove(START_FEN, 'e2', 'e4')
    expect(result).toEqual({ fen: FEN_AFTER_E4, san: 'e4', stm: 'b' })
  })

  it('returns null for an illegal move (e2-e5)', () => {
    expect(applyFreeMove(START_FEN, 'e2', 'e5')).toBeNull()
  })

  it('applies a move for Black when Black is to move', () => {
    const result = applyFreeMove(FEN_AFTER_E4, 'e7', 'e5')
    expect(result).not.toBeNull()
    expect(result?.san).toBe('e5')
    expect(result?.stm).toBe('w')
  })

  it('promotes to a queen by default', () => {
    const result = applyFreeMove(PROMO_FEN, 'e7', 'e8')
    expect(result?.san).toBe('e8=Q')
    expect(result?.stm).toBe('b')
  })

  it('promotes to the requested piece', () => {
    const result = applyFreeMove(PROMO_FEN, 'e7', 'e8', 'n')
    expect(result?.san).toBe('e8=N')
  })

  it('returns null when moving an opponent piece (not side to move)', () => {
    // White to move in START_FEN; dragging a black pawn is illegal.
    expect(applyFreeMove(START_FEN, 'e7', 'e5')).toBeNull()
  })

  it('chains free moves by feeding the returned FEN back in', () => {
    const first = applyFreeMove(START_FEN, 'e2', 'e4')
    expect(first).not.toBeNull()
    const second = applyFreeMove(first!.fen, 'e7', 'e5')
    expect(second).not.toBeNull()
    expect(second?.stm).toBe('w')
  })
})
