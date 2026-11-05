import { describe, expect, it } from 'vitest'
import { moverWinPercent, winPercent } from './winProbability'

const cp = (n: number) => ({ kind: 'cp' as const, cp: n })

describe('winPercent', () => {
  it('follows the Lichess curve', () => {
    expect(winPercent(cp(0))).toBe(50)
    expect(winPercent(cp(100))).toBeCloseTo(59.1, 1)
    expect(winPercent(cp(300))).toBeCloseTo(75.1, 1)
    expect(winPercent(cp(-300))).toBeCloseTo(24.9, 1)
  })

  it('clamps cp to +/-1000', () => {
    expect(winPercent(cp(2000))).toBe(winPercent(cp(1000)))
    expect(winPercent(cp(1000))).toBeCloseTo(97.5, 1)
    expect(winPercent(cp(-5000))).toBe(winPercent(cp(-1000)))
  })

  it('treats mates as cp +/-1000 like Lichess, and draws as 50', () => {
    expect(winPercent({ kind: 'mate', in: 3, winner: 'w' })).toBe(winPercent(cp(1000)))
    expect(winPercent({ kind: 'mate', in: 3, winner: 'w' })).toBeCloseTo(97.54, 2)
    expect(winPercent({ kind: 'mate', in: 0, winner: 'b' })).toBe(winPercent(cp(-1000)))
    expect(winPercent({ kind: 'mate', in: 0, winner: 'b' })).toBeCloseTo(2.46, 2)
    expect(winPercent({ kind: 'draw' })).toBe(50)
  })
})

describe('moverWinPercent', () => {
  it('flips for Black', () => {
    expect(moverWinPercent(cp(300), 'b')).toBeCloseTo(24.9, 1)
    expect(moverWinPercent(cp(300), 'w')).toBeCloseTo(75.1, 1)
  })
})
