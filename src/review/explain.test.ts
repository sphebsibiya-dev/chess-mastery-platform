import { describe, expect, it } from 'vitest'
import type { PositionAnalysis } from '../engine/types'
import { acceptsRetry, explainMove } from './explain'
import type { ExplainContext } from './explain'
import type { MoveReview } from './types'

// ---- Shared minimal fixtures ----

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

function pos(overrides: Partial<PositionAnalysis> = {}): PositionAnalysis {
  return {
    fen: START_FEN,
    eval: { kind: 'cp', cp: 20 },
    bestMove: 'e2e4',
    pv: [],
    depth: 14,
    lines: [],
    ...overrides,
  }
}

function review(cls: MoveReview['cls'], overrides: Partial<MoveReview> = {}): MoveReview {
  return {
    ply: 1,
    cls,
    wpBefore: 50,
    wpAfter: 50,
    loss: 0,
    accuracy: 100,
    ...overrides,
  }
}

function ctx(overrides: Partial<ExplainContext> = {}): ExplainContext {
  return {
    move: {
      ply: 1,
      color: 'w',
      lan: 'e2e4',
      fenBefore: START_FEN,
      san: 'e4',
    },
    posBefore: pos(),
    posAfter: pos({ fen: AFTER_E4_FEN, eval: { kind: 'cp', cp: -20 }, bestMove: 'e7e5' }),
    ...overrides,
  }
}

// ---- Tests for each class ----

describe('explainMove – positive classes', () => {
  it('book: includes opening name when available', () => {
    const result = explainMove(review('book'), ctx({ opening: { eco: 'C00', name: "King's Pawn" } }))
    expect(result).toContain("King's Pawn")
  })

  it('book: generic message without opening', () => {
    const result = explainMove(review('book'), ctx())
    expect(result.toLowerCase()).toContain('book')
  })

  it('brilliant: mentions "brilliant"', () => {
    // With empty PV, sacrifice is undefined → generic brilliant message
    const result = explainMove(review('brilliant'), ctx())
    expect(result.toLowerCase()).toContain('brilliant')
  })

  it('great: says "only move"', () => {
    const result = explainMove(review('great'), ctx())
    expect(result.toLowerCase()).toContain('only move')
  })

  it('best: mentions engine', () => {
    const result = explainMove(review('best'), ctx())
    expect(result.toLowerCase()).toContain("engine")
  })

  it('excellent: positive language', () => {
    const result = explainMove(review('excellent'), ctx())
    expect(result.toLowerCase()).toContain('excellent')
  })

  it('good: positive language', () => {
    const result = explainMove(review('good'), ctx())
    expect(result.toLowerCase()).toContain('good')
  })

  it('forced: mentions "only legal"', () => {
    const result = explainMove(review('forced'), ctx())
    expect(result.toLowerCase()).toContain('only legal')
  })
})

describe('explainMove – negative classes', () => {
  it('blunder: "allows mate in N" when posAfter has opponent mating', () => {
    const result = explainMove(
      review('blunder', { wpBefore: 60, wpAfter: 5, loss: 55 }),
      ctx({
        posAfter: pos({
          fen: AFTER_E4_FEN,
          eval: { kind: 'mate', in: 2, winner: 'b' },
        }),
      }),
    )
    expect(result).toContain('mate in 2')
  })

  it('blunder: "mate in 0" when checkmate on board', () => {
    const result = explainMove(
      review('blunder', { wpBefore: 60, wpAfter: 0, loss: 60 }),
      ctx({
        posAfter: pos({
          eval: { kind: 'mate', in: 0, winner: 'b' },
        }),
      }),
    )
    expect(result.toLowerCase()).toContain('immediate checkmate')
  })

  it('blunder: "missed forced mate" when posBefore had mate for mover', () => {
    const result = explainMove(
      review('blunder', { wpBefore: 97, wpAfter: 30, loss: 67 }),
      ctx({
        posBefore: pos({ eval: { kind: 'mate', in: 3, winner: 'w' } }),
        posAfter: pos({ eval: { kind: 'cp', cp: -100 } }),
      }),
    )
    expect(result.toLowerCase()).toContain('missed a forced mate')
  })

  it('mistake: win% drop fallback when no mate or hanging material', () => {
    const result = explainMove(
      review('mistake', { wpBefore: 65, wpAfter: 40, loss: 25 }),
      ctx(),
    )
    expect(result.toLowerCase()).toContain('win chance dropped')
    expect(result).toContain('65%')
    expect(result).toContain('40%')
  })

  it('inaccuracy: appends "Best was X." when bestMoveSan is present', () => {
    const result = explainMove(
      review('inaccuracy', { wpBefore: 55, wpAfter: 47, loss: 8, bestMoveSan: 'Nf3' }),
      ctx(),
    )
    expect(result).toContain('Nf3')
  })

  it('miss: returns a non-empty string', () => {
    const result = explainMove(
      review('miss', { wpBefore: 20, wpAfter: 5, loss: 15 }),
      ctx(),
    )
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('best/forced/book/brilliant/great do NOT append best-was suffix', () => {
    const noSuffixClasses: MoveReview['cls'][] = ['best', 'forced', 'book', 'brilliant', 'great']
    for (const cls of noSuffixClasses) {
      const result = explainMove(review(cls, { bestMoveSan: 'Nf3' }), ctx())
      expect(result).not.toContain('Best was')
    }
  })
})

describe('acceptsRetry', () => {
  it('accepts moves with loss at or below GOOD_MAX_LOSS (5)', () => {
    expect(acceptsRetry(0)).toBe(true)
    expect(acceptsRetry(5)).toBe(true)
    expect(acceptsRetry(4.99)).toBe(true)
  })

  it('rejects moves with loss above GOOD_MAX_LOSS', () => {
    expect(acceptsRetry(5.01)).toBe(false)
    expect(acceptsRetry(10)).toBe(false)
    expect(acceptsRetry(50)).toBe(false)
  })
})
