import { describe, expect, it } from 'vitest'
import { classForLoss } from './classify'
import { findKeyMoments, MAX_MOMENTS, winBand } from './keyMoments'
import type { MoveClass, MoveReview } from './types'
import { winPercent } from './winProbability'

type Color = 'w' | 'b'

const colorOf = (ply: number): Color => (ply % 2 === 1 ? 'w' : 'b')

function movesFor(count: number) {
  return Array.from({ length: count }, (_, i) => ({ ply: i + 1, color: colorOf(i + 1) }))
}

/** Reviews derived from White's win% per position, like `classifyGame` does. */
function reviewsFromWp(whiteWp: number[], overrides: Record<number, Partial<MoveReview>> = {}): MoveReview[] {
  return whiteWp.slice(1).map((after, i) => {
    const ply = i + 1
    const before = whiteWp[i]
    const pov = (wp: number) => (colorOf(ply) === 'w' ? wp : 100 - wp)
    const wpBefore = pov(before)
    const wpAfter = pov(after)
    const loss = Math.max(0, wpBefore - wpAfter)
    return { ply, cls: classForLoss(loss), wpBefore, wpAfter, loss, accuracy: 0, ...overrides[ply] }
  })
}

/** Reviews given only by loss (and optionally wpBefore/cls); whiteWp stays flat at 50. */
function reviewsFromLosses(
  specs: { loss: number; wpBefore?: number; cls?: MoveClass }[],
): { moves: { ply: number; color: Color }[]; reviews: MoveReview[]; whiteWp: number[] } {
  const reviews = specs.map((s, i) => {
    const wpBefore = s.wpBefore ?? 50
    return {
      ply: i + 1,
      cls: s.cls ?? classForLoss(s.loss),
      wpBefore,
      wpAfter: wpBefore - s.loss,
      loss: s.loss,
      accuracy: 0,
    }
  })
  return { moves: movesFor(specs.length), reviews, whiteWp: Array(specs.length + 1).fill(50) }
}

describe('winBand', () => {
  it.each([
    [0, 'black'],
    [33, 'black'],
    [33.1, 'equal'],
    [50, 'equal'],
    [66.9, 'equal'],
    [67, 'white'],
    [100, 'white'],
  ] as const)('%d -> %s', (wp, band) => {
    expect(winBand(wp)).toBe(band)
  })
})

describe('findKeyMoments', () => {
  it('finds blunders that change the band, both ways', () => {
    // Ply 2 (Black) 52 -> 75: Black loses 23, equal -> White.
    // Ply 5 (White) 74 -> 40: White loses 34, White -> equal.
    // (Ply 4 is a quiet Black move, so the White blunder is on an odd ply.)
    const whiteWp = [50, 52, 75, 74, 74, 40]
    const moments = findKeyMoments(movesFor(5), reviewsFromWp(whiteWp), whiteWp)
    expect(moments.map((m) => [m.ply, m.color, m.kinds])).toEqual([
      [2, 'b', ['blunder', 'turning-point']],
      [5, 'w', ['blunder', 'turning-point']],
    ])
    expect(moments[0].loss).toBeCloseTo(23)
    expect(moments[0]).toMatchObject({ whiteWpBefore: 52, whiteWpAfter: 75 })
    expect(moments[1].loss).toBeCloseTo(34)
  })

  it('ignores a band change caused by a tiny loss', () => {
    const whiteWp = [50, 68, 66]
    expect(findKeyMoments(movesFor(2), reviewsFromWp(whiteWp), whiteWp)).toEqual([])
  })

  it('lists a jump straight from White to Black once', () => {
    // White to move at 80% and drops to 20%.
    const whiteWp = [80, 20]
    const moments = findKeyMoments(movesFor(1), reviewsFromWp(whiteWp), whiteWp)
    expect(moments).toHaveLength(1)
    expect(moments[0]).toMatchObject({ ply: 1, kinds: ['blunder', 'turning-point'] })
  })

  it('treats a mate score like any other win% (mate -> equal is a turning point)', () => {
    // White had mate and played a move that only keeps equality.
    const whiteWp = [winPercent({ kind: 'mate', in: 3, winner: 'w' }), winPercent({ kind: 'cp', cp: 0 })]
    expect(whiteWp[0]).toBeCloseTo(97.5, 0)
    const moments = findKeyMoments(movesFor(1), reviewsFromWp(whiteWp), whiteWp)
    expect(moments).toHaveLength(1)
    expect(moments[0]).toMatchObject({ ply: 1, kinds: ['blunder', 'turning-point'] })
  })

  it('carries the engine best move', () => {
    const whiteWp = [50, 52, 75]
    const moments = findKeyMoments(movesFor(2), reviewsFromWp(whiteWp, { 2: { bestMoveSan: 'Rd1' } }), whiteWp)
    expect(moments[0].bestMoveSan).toBe('Rd1')
  })

  describe('missed tactic', () => {
    // Ply 4 (Black) blunders by 30; White to move at ply 5 with 80%.
    const base = (ply5: { loss: number; wpBefore?: number; cls?: MoveClass }) =>
      reviewsFromLosses([{ loss: 0 }, { loss: 0 }, { loss: 0 }, { loss: 30 }, { wpBefore: 80, ...ply5 }])

    it('flags a move that loses 10+ right after the opponent blundered', () => {
      const { moves, reviews, whiteWp } = base({ loss: 15 })
      const moments = findKeyMoments(moves, reviews, whiteWp)
      expect(moments.find((m) => m.ply === 5)?.kinds).toEqual(['missed-tactic'])
    })

    it.each([
      ['a small loss', { loss: 4 }],
      ['the best move', { loss: 15, cls: 'best' as const }],
      ['a forced move', { loss: 15, cls: 'forced' as const }],
      ['no real chance (55%)', { loss: 15, wpBefore: 55 }],
    ])('does not flag %s', (_, ply5) => {
      const { moves, reviews, whiteWp } = base(ply5)
      expect(findKeyMoments(moves, reviews, whiteWp).find((m) => m.ply === 5)).toBeUndefined()
    })

    it('never flags ply 1 (no previous move)', () => {
      const { moves, reviews, whiteWp } = reviewsFromLosses([{ loss: 15, wpBefore: 90 }])
      expect(findKeyMoments(moves, reviews, whiteWp)).toEqual([])
    })

    it('can combine with blunder', () => {
      const { moves, reviews, whiteWp } = base({ loss: 25 })
      expect(findKeyMoments(moves, reviews, whiteWp).find((m) => m.ply === 5)?.kinds).toEqual([
        'blunder',
        'missed-tactic',
      ])
    })
  })

  it('keeps the three biggest blunders per side, in ply order', () => {
    // White blunders at plies 1, 3, 5, 7, 9; Black plays quietly.
    const losses = [21, 30, 45, 22, 60]
    const specs = losses.flatMap((loss) => [{ loss }, { loss: 0 }])
    const { moves, reviews, whiteWp } = reviewsFromLosses(specs)
    const moments = findKeyMoments(moves, reviews, whiteWp)
    expect(moments.map((m) => m.loss)).toEqual([30, 45, 60])
    expect(moments.map((m) => m.ply)).toEqual([3, 5, 9])
  })

  it('caps the list at the largest losses', () => {
    // 6 blunders per side would give 6 kept blunders, plus turning points.
    const whiteWp = [50]
    for (let i = 0; i < 12; i++) whiteWp.push(i % 2 === 0 ? 80 : 20)
    // Each move swings the band and loses a lot, with growing size.
    const reviews = reviewsFromWp(whiteWp).map((r, i) => ({ ...r, loss: 30 + i }))
    const moments = findKeyMoments(movesFor(12), reviews, whiteWp)
    expect(moments).toHaveLength(MAX_MOMENTS)
    expect(moments.map((m) => m.loss)).toEqual([34, 35, 36, 37, 38, 39, 40, 41])
    expect(moments.map((m) => m.ply)).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('keeps a capped blunder that is also a turning point, without the blunder kind', () => {
    // Black blunders on ply 6 (50 -> 80); White gives it back on ply 7 (80 -> 55, loss 25).
    const whiteWp = [50, 50, 50, 50, 50, 50, 80, 55]
    // White also blundered bigger on plies 1, 3 and 5 (eval kept flat for simplicity).
    const reviews = reviewsFromWp(whiteWp).map((r) => (r.ply <= 5 && r.ply % 2 === 1 ? { ...r, loss: 50 } : r))
    const moments = findKeyMoments(movesFor(7), reviews, whiteWp)
    // Not a blunder any more (White's 4th biggest), but still a missed tactic and turning point.
    expect(moments.find((m) => m.ply === 7)?.kinds).toEqual(['missed-tactic', 'turning-point'])
    expect(moments.find((m) => m.ply === 6)?.kinds).toEqual(['blunder', 'turning-point'])
    expect(moments.filter((m) => m.color === 'w' && m.kinds.includes('blunder')).map((m) => m.ply)).toEqual([
      1, 3, 5,
    ])
  })

  it('never lists the engine-best move, even with a noisy eval loss', () => {
    // White's move matches the engine but the evals say it lost 25 and swung the band.
    const whiteWp = [70, 45]
    const reviews = reviewsFromWp(whiteWp, { 1: { cls: 'best' } })
    expect(reviews[0].loss).toBe(25)
    expect(findKeyMoments(movesFor(1), reviews, whiteWp)).toEqual([])
  })

  it('returns [] for an empty game or only forced moves', () => {
    expect(findKeyMoments([], [], [50])).toEqual([])
    const whiteWp = [50, 90, 10]
    const forced = reviewsFromWp(whiteWp).map((r) => ({ ...r, cls: 'forced' as const }))
    expect(findKeyMoments(movesFor(2), forced, whiteWp)).toEqual([])
  })

  it('throws when the lengths do not match', () => {
    expect(() => findKeyMoments(movesFor(2), reviewsFromWp([50, 50, 50]), [50, 50])).toThrow(/Expected 3/)
    expect(() => findKeyMoments(movesFor(2), [], [50, 50, 50])).toThrow(/Expected 2 reviews/)
  })
})
