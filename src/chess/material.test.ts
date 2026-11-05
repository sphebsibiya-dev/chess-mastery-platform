import { describe, expect, it } from 'vitest'
import { START_FEN } from './constants'
import { materialBalance, PIECE_VALUES } from './material'

describe('materialBalance', () => {
  it('is 0 in the start position for both sides', () => {
    expect(materialBalance(START_FEN, 'w')).toBe(0)
    expect(materialBalance(START_FEN, 'b')).toBe(0)
  })

  it("counts the mover's material minus the opponent's", () => {
    // White: Q + N + 2 pawns = 14. Black: R + 2 pawns = 7.
    const fen = 'r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1'
    expect(materialBalance(fen, 'w')).toBe(7)
    expect(materialBalance(fen, 'b')).toBe(-7)
  })

  it('does not count kings', () => {
    expect(PIECE_VALUES.k).toBe(0)
    expect(materialBalance('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w')).toBe(0)
  })
})
