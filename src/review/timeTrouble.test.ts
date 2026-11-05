import { describe, expect, it } from 'vitest'
import { CHESSCOM_CLOCKS, LICHESS_CLOCKS, RUY_LOPEZ } from '../import/fixtures'
import { parseGame } from '../import/pgn'
import { lowClockThreshold, moveTimes } from './timeTrouble'
import type { MoveReview } from './types'

/** Alternating White/Black moves from a list of clocks (undefined = no clock comment). */
function game(clocks: (number | undefined)[], timeControl?: string) {
  return {
    headers: { timeControl },
    moves: clocks.map((clockSeconds, i) => ({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: (i % 2 === 0 ? 'w' : 'b') as 'w' | 'b',
      clockSeconds,
    })),
  }
}

function reviews(count: number, losses: Record<number, number> = {}, cls: Record<number, MoveReview['cls']> = {}) {
  return Array.from({ length: count }, (_, i): MoveReview => {
    const ply = i + 1
    const loss = losses[ply] ?? 0
    return { ply, cls: cls[ply] ?? 'good', wpBefore: 50, wpAfter: 50 - loss, loss, accuracy: 100 }
  })
}

/**
 * 3+0 game of `moves` full moves where each side spends `spend(moveNumber)`
 * seconds per move. Clocks stay well above the low-clock threshold by default.
 */
function steadyGame(fullMoves: number, spend: (moveNumber: number, color: 'w' | 'b') => number, initial = 600) {
  const clocks: number[] = []
  const left = { w: initial, b: initial }
  for (let n = 1; n <= fullMoves; n++) {
    for (const color of ['w', 'b'] as const) {
      left[color] -= spend(n, color)
      clocks.push(left[color])
    }
  }
  return game(clocks, String(initial))
}

describe('lowClockThreshold', () => {
  it.each([
    [60, 10],
    [180, 18],
    [600, 60],
    [1800, 60],
    [15, 10],
  ])('%ds -> %ds', (initial, threshold) => {
    expect(lowClockThreshold(initial)).toBe(threshold)
  })
})

describe('moveTimes', () => {
  it('computes time spent with the increment', () => {
    const g = parseGame('[TimeControl "180+2"]\n\n1. e4 {[%clk 0:02:59]} e5 {[%clk 0:03:01]} *')
    const times = moveTimes(g)
    expect(times.hasClocks).toBe(true)
    expect(times.control).toEqual({ initialSeconds: 180, incrementSeconds: 2 })
    expect(times.moves.map((m) => m.spentSeconds)).toEqual([3, 1])
    expect(times.moves.map((m) => m.clockSeconds)).toEqual([179, 181])
  })

  it('flags low clock (3+0 threshold 18s) and records where trouble starts', () => {
    const times = moveTimes(game([170, 170, 20, 160, 17, 150, 12, 15], '180'))
    expect(times.moves.map((m) => m.flags)).toEqual([[], [], [], [], ['low-clock'], [], ['low-clock'], ['low-clock']])
    expect(times.troubleStart).toEqual({ w: 5, b: 8 })
  })

  it.each([
    ['60', 11, 9],
    ['600', 61, 59],
    ['1800+20', 61, 59],
  ])('uses the right threshold for %s', (tc, safe, low) => {
    expect(moveTimes(game([safe, safe], tc)).moves[0].flags).toEqual([])
    expect(moveTimes(game([low, safe], tc)).moves[0].flags).toEqual(['low-clock'])
  })

  describe('too fast', () => {
    // Each side spends 10s per move, except White's move 20 (ply 39), which takes 2s.
    const g = steadyGame(30, (n, c) => (n === 20 && c === 'w' ? 2 : 10))
    const ply = 39

    it('flags a quick move that lost a lot', () => {
      const times = moveTimes(g, reviews(60, { [ply]: 25 }))
      expect(times.medianSpent).toEqual({ w: 10, b: 10 })
      expect(times.moves[ply - 1]).toMatchObject({ spentSeconds: 2, flags: ['too-fast'] })
      expect(times.moves.filter((m) => m.flags.length > 0)).toHaveLength(1)
    })

    it('flags a quick move right after the opponent blundered', () => {
      const times = moveTimes(g, reviews(60, { [ply - 1]: 30 }))
      expect(times.moves[ply - 1].flags).toEqual(['too-fast'])
    })

    it('does not flag a quick move in a quiet position', () => {
      const times = moveTimes(g, reviews(60, { [ply]: 3 }))
      expect(times.moves[ply - 1].flags).toEqual([])
    })

    it('does not flag a forced move', () => {
      const times = moveTimes(g, reviews(60, { [ply]: 25 }, { [ply]: 'forced' }))
      expect(times.moves[ply - 1].flags).toEqual([])
    })

    it('does not flag the opening (move 8 or earlier)', () => {
      const early = steadyGame(30, (n, c) => (n === 6 && c === 'w' ? 2 : 10))
      expect(moveTimes(early, reviews(60, { 11: 25 })).moves[10].flags).toEqual([])
    })

    it('needs at least 5 timed moves for a median', () => {
      const short = steadyGame(12, (n, c) => (n === 12 && c === 'w' ? 2 : 10))
      // White has moves 9..12 = 4 timed moves after move 8.
      const times = moveTimes(short, reviews(24, { 23: 25 }))
      expect(times.medianSpent).toEqual({})
      expect(times.moves[22].flags).toEqual([])
    })

    it('needs reviews', () => {
      expect(moveTimes(g).moves[ply - 1].flags).toEqual([])
    })

    it('a low-clock move only gets low-clock', () => {
      // 3+0 (threshold 18s). White spends 9s on moves 1-19 (9s left), 1s on
      // move 20 (8s left), then 0s. White's median after move 8 is 5s, so the
      // 1s move would be too fast, but White is already in time trouble.
      const g = steadyGame(30, (n, c) => (c === 'b' ? 1 : n <= 19 ? 9 : n === 20 ? 1 : 0), 180)
      const times = moveTimes(g, reviews(60, { 39: 25 }))
      expect(times.medianSpent.w).toBe(5)
      expect(times.moves[38]).toMatchObject({ clockSeconds: 8, spentSeconds: 1, flags: ['low-clock'] })
      expect(times.troubleStart.w).toBe(37)
    })
  })

  it('works on a real game without clocks', () => {
    const times = moveTimes(parseGame(RUY_LOPEZ))
    expect(times.hasClocks).toBe(false)
    expect(times.control).toBeNull()
    expect(times.moves).toHaveLength(10)
    expect(times.moves.every((m) => m.flags.length === 0 && m.spentSeconds === undefined)).toBe(true)
  })

  it.each([
    ['chess.com', CHESSCOM_CLOCKS],
    ['Lichess', LICHESS_CLOCKS],
  ])('reads %s clocks', (_, pgn) => {
    const times = moveTimes(parseGame(pgn))
    expect(times.hasClocks).toBe(true)
    expect(times.moves.every((m) => m.clockSeconds !== undefined)).toBe(true)
  })

  it('falls back to the highest clock without a TimeControl tag', () => {
    // LICHESS_CLOCKS: 3:00, 2:59, 2:58 and no TimeControl tag.
    const times = moveTimes(parseGame(LICHESS_CLOCKS))
    expect(times.control).toEqual({ initialSeconds: 180, incrementSeconds: 0 })
    expect(times.moves.map((m) => m.spentSeconds)).toEqual([0, 1, 2])
  })

  it('never reports a negative time spent', () => {
    const times = moveTimes(game([170, 170, 175, 172], '180'))
    expect(times.moves[2].spentSeconds).toBe(0)
  })

  it('treats daily and unlimited games as untimed', () => {
    expect(moveTimes(game([100, 100], '1/86400')).hasClocks).toBe(false)
    expect(moveTimes(game([100, 100], '-')).hasClocks).toBe(false)
  })

  it('skips spent time after a move without a clock', () => {
    const times = moveTimes(game([170, 170, undefined, 165, 160, 160], '180'))
    expect(times.moves.map((m) => m.spentSeconds)).toEqual([10, 10, undefined, 5, undefined, 5])
  })

  it('handles an empty game', () => {
    expect(moveTimes(game([], '180'))).toMatchObject({ hasClocks: false, moves: [] })
  })
})
