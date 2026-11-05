import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { accuracyFromLoss, gameAccuracy, moveAccuracy, volatilityWeights } from './accuracy'

describe('moveAccuracy', () => {
  it('follows the Lichess curve', () => {
    expect(moveAccuracy(60, 60)).toBe(100)
    expect(accuracyFromLoss(0)).toBe(100)
    expect(accuracyFromLoss(10)).toBeCloseTo(63.6, 1)
    expect(accuracyFromLoss(50)).toBeCloseTo(8.5, 1)
  })

  it('never goes below 0 and treats gains as no loss', () => {
    expect(accuracyFromLoss(100)).toBe(0)
    expect(moveAccuracy(100, 0)).toBe(0)
    expect(moveAccuracy(40, 70)).toBe(100)
  })
})

describe('volatilityWeights', () => {
  it('gives one weight per move, clamped to 0.5..12', () => {
    const flat = Array(21).fill(50)
    const weights = volatilityWeights(flat)
    expect(weights).toHaveLength(20)
    expect(weights.every((w) => w === 0.5)).toBe(true)

    const wild = Array.from({ length: 21 }, (_, i) => (i % 2 ? 0 : 100))
    expect(volatilityWeights(wild).every((w) => w === 12)).toBe(true)
  })

  it('handles very short games', () => {
    expect(volatilityWeights([50])).toEqual([])
    expect(volatilityWeights([50, 60])).toHaveLength(1)
    expect(volatilityWeights([50, 60, 55])).toHaveLength(2)
  })
})

const alternate = (n: number, first: 'w' | 'b' = 'w') =>
  Array.from({ length: n }, (_, i) => ((i % 2 === 0) === (first === 'w') ? ('w' as const) : ('b' as const)))

describe('gameAccuracy', () => {
  it('gives 100 to a side that plays only perfect moves', () => {
    const colors = alternate(20)
    const wp = Array(21).fill(50)
    const result = gameAccuracy(
      wp,
      colors.map((color) => ({ color, accuracy: 100 })),
    )
    expect(result.w).toBeCloseTo(100, 5)
    expect(result.b).toBeCloseTo(100, 5)
  })

  it('lowers only the blundering side', () => {
    // 22 moves: 11 each. White's 6th move (index 10) loses 50 win%.
    const colors = alternate(22)
    const wp: number[] = [50]
    const moves = colors.map((color, i) => {
      const blunder = i === 10
      wp.push(blunder ? 0 : wp[wp.length - 1])
      return { color, accuracy: blunder ? accuracyFromLoss(50) : 100 }
    })
    const result = gameAccuracy(wp, moves)
    expect(result.w).toBeLessThan(90)
    expect(result.b).toBeCloseTo(100, 5)
  })

  it("splits by the mover's colour when Black moves first", () => {
    // A game set up from a FEN with Black to move.
    const chess = new Chess('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1')
    chess.move('Kd7')
    chess.move('e4')
    chess.move('Kc6')
    const colors = chess.history({ verbose: true }).map((m) => m.color)
    expect(colors).toEqual(['b', 'w', 'b'])
    const result = gameAccuracy([50, 50, 50, 50], [
      { color: colors[0], accuracy: 100 },
      { color: colors[1], accuracy: 20 },
      { color: colors[2], accuracy: 100 },
    ])
    expect(result.b).toBeCloseTo(100, 5)
    expect(result.w).toBeCloseTo(20, 5)
  })

  it('gives undefined for a side with no moves', () => {
    const result = gameAccuracy([50, 50], [{ color: 'w', accuracy: 80 }])
    expect(result.w).toBeCloseTo(80, 5)
    expect(result.b).toBeUndefined()
    expect(gameAccuracy([50], [])).toEqual({})
  })

  it('does not divide by zero on a 0% move', () => {
    const result = gameAccuracy([50, 0, 0], [
      { color: 'w', accuracy: 0 },
      { color: 'b', accuracy: 100 },
    ])
    expect(Number.isFinite(result.w)).toBe(true)
    expect(result.w).toBeGreaterThanOrEqual(0)
  })
})
