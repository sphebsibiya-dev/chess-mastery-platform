import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import { parseGame } from '../import/pgn'
import { gameAccuracy } from './accuracy'
import {
  countClasses,
  estimateRating,
  isEndgamePosition,
  MIN_MOVES_FOR_RATING,
  nonPawnMaterial,
  phaseGrade,
  RATING_TABLE,
  splitPhases,
  summarizeReview,
  SUMMARY_CLASS_ORDER,
} from './summary'
import type { MoveClass, MoveReview } from './types'

type Color = 'w' | 'b'

const QUEENS_OFF = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1'
const CUSTOM_MIDDLEGAME = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 10'
const CUSTOM_ENDGAME = '8/5k2/8/3KP3/8/8/8/8 w - - 0 50'

/** Made-up moves from a position with White to move at full move `firstMove`. */
function fakeMoves(count: number, fenAt: (ply: number) => string, firstMove = 1) {
  return Array.from({ length: count }, (_, i) => {
    const ply = i + 1
    const color: Color = ply % 2 === 1 ? 'w' : 'b'
    return { ply, color, moveNumber: firstMove + Math.floor(i / 2), fenBefore: fenAt(ply) }
  })
}

function review(ply: number, cls: MoveClass, accuracy = 100): MoveReview {
  return { ply, cls, wpBefore: 50, wpAfter: 50, loss: 0, accuracy }
}

describe('estimateRating', () => {
  it('hits the table anchors', () => {
    expect(estimateRating(80)).toBe(1500)
    expect(estimateRating(85)).toBe(1800)
    expect(estimateRating(0)).toBe(100)
    expect(estimateRating(100)).toBe(2900)
    for (const [acc, rating] of RATING_TABLE) expect(estimateRating(acc)).toBe(rating)
  })

  it('interpolates between anchors and rounds to the nearest 50', () => {
    expect(estimateRating(82.5)).toBe(1650)
    // 0..40 maps 100..400: 36 -> 370 -> 350, 37 -> 377.5 -> 400.
    expect(estimateRating(36)).toBe(350)
    expect(estimateRating(37)).toBe(400)
  })

  it('clamps accuracy outside 0..100', () => {
    expect(estimateRating(-5)).toBe(100)
    expect(estimateRating(105)).toBe(2900)
  })

  it('never goes down as accuracy rises', () => {
    let prev = -Infinity
    for (let acc = 0; acc <= 100; acc += 0.5) {
      const r = estimateRating(acc)
      expect(r).toBeGreaterThanOrEqual(prev)
      expect(r % 50).toBe(0)
      prev = r
    }
  })
})

describe('phaseGrade', () => {
  it('uses the 80 / 60 boundaries', () => {
    expect(phaseGrade(80)).toBe('good')
    expect(phaseGrade(79.99)).toBe('ok')
    expect(phaseGrade(60)).toBe('ok')
    expect(phaseGrade(59.99)).toBe('poor')
    expect(phaseGrade(undefined)).toBeUndefined()
  })
})

describe('nonPawnMaterial / isEndgamePosition', () => {
  it.each([
    [START_FEN, 62, false],
    [QUEENS_OFF, 44, true],
    ['3qk3/8/8/8/8/8/8/R3K3 w - - 0 1', 14, false],
    ['3qk3/8/8/8/8/8/8/4K3 w - - 0 1', 9, true],
    ['r3k3/8/8/8/8/8/8/R1B1K3 w - - 0 1', 13, true],
    ['4k3/8/8/8/8/8/8/4K3 w - - 0 1', 0, true],
  ])('%s', (fen, material, endgame) => {
    expect(nonPawnMaterial(fen)).toBe(material)
    expect(isEndgamePosition(fen)).toBe(endgame)
  })
})

describe('splitPhases', () => {
  it('standard start, no book: opening through move 12, no endgame', () => {
    const moves = fakeMoves(40, () => START_FEN)
    expect(splitPhases({ startFen: START_FEN, moves }, [])).toEqual({
      opening: { start: 1, end: 24 },
      middlegame: { start: 25, end: 40 },
      endgame: undefined,
    })
  })

  it('book moves past move 12 extend the opening', () => {
    const moves = fakeMoves(40, () => START_FEN)
    const classes = Array.from({ length: 40 }, (_, i): MoveClass => (i < 30 ? 'book' : 'good'))
    expect(splitPhases({ startFen: START_FEN, moves }, classes)).toEqual({
      opening: { start: 1, end: 30 },
      middlegame: { start: 31, end: 40 },
      endgame: undefined,
    })
  })

  it('an early queen trade goes straight from opening to endgame', () => {
    const moves = fakeMoves(40, (ply) => (ply >= 15 ? QUEENS_OFF : START_FEN))
    expect(splitPhases({ startFen: START_FEN, moves }, [])).toEqual({
      opening: { start: 1, end: 14 },
      middlegame: undefined,
      endgame: { start: 15, end: 40 },
    })
  })

  it('stays in the endgame after a promotion brings a queen back', () => {
    const moves = fakeMoves(40, (ply) => (ply >= 30 && ply < 35 ? QUEENS_OFF : START_FEN))
    expect(splitPhases({ startFen: START_FEN, moves }, []).endgame).toEqual({ start: 30, end: 40 })
  })

  it('custom start FEN without book moves has no opening', () => {
    const moves = fakeMoves(20, () => CUSTOM_MIDDLEGAME, 10)
    expect(splitPhases({ startFen: CUSTOM_MIDDLEGAME, moves }, [])).toEqual({
      opening: undefined,
      middlegame: { start: 1, end: 20 },
      endgame: undefined,
    })
  })

  it('custom endgame FEN is endgame only', () => {
    const moves = fakeMoves(10, () => CUSTOM_ENDGAME, 50)
    expect(splitPhases({ startFen: CUSTOM_ENDGAME, moves }, [])).toEqual({
      opening: undefined,
      middlegame: undefined,
      endgame: { start: 1, end: 10 },
    })
  })

  it('no moves: no phases', () => {
    expect(splitPhases({ startFen: START_FEN, moves: [] }, [])).toEqual({
      opening: undefined,
      middlegame: undefined,
      endgame: undefined,
    })
  })
})

describe('countClasses', () => {
  it('counts per side with the first ply of each class', () => {
    // Plies: W book, B book, W best, B mistake, W blunder, B best, W best
    const classes: MoveClass[] = ['book', 'book', 'best', 'mistake', 'blunder', 'best', 'best']
    const moves = classes.map((_, i) => ({ color: (i % 2 === 0 ? 'w' : 'b') as Color }))
    const counts = countClasses(
      moves,
      classes.map((cls, i) => review(i + 1, cls)),
    )
    expect(counts.best.w).toEqual({ count: 2, firstPly: 3 })
    expect(counts.best.b).toEqual({ count: 1, firstPly: 6 })
    expect(counts.mistake.b).toEqual({ count: 1, firstPly: 4 })
    expect(counts.blunder.w).toEqual({ count: 1, firstPly: 5 })
    expect(counts.book.w).toEqual({ count: 1, firstPly: 1 })
    expect(counts.brilliant.w).toEqual({ count: 0 })
    const total = SUMMARY_CLASS_ORDER.reduce((sum, cls) => sum + counts[cls].w.count + counts[cls].b.count, 0)
    expect(total).toBe(7)
  })

  it('follows the mover, not ply parity (Black to move first)', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 b - - 0 1"]\n\n1... Kd7 2. Kd2 *')
    expect(game.moves[0].color).toBe('b')
    const counts = countClasses(game.moves, [review(1, 'mistake'), review(2, 'good')])
    expect(counts.mistake.b).toEqual({ count: 1, firstPly: 1 })
    expect(counts.mistake.w).toEqual({ count: 0 })
    expect(counts.good.w).toEqual({ count: 1, firstPly: 2 })
  })

  it('has a row for every class, including forced', () => {
    expect([...SUMMARY_CLASS_ORDER].sort()).toEqual(
      ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].sort(),
    )
  })
})

describe('summarizeReview', () => {
  it("Scholar's mate: opening only, too few moves for a rating", () => {
    const game = parseGame('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0')
    const classes: MoveClass[] = ['book', 'book', 'best', 'good', 'best', 'blunder', 'best']
    const reviews = classes.map((cls, i) => review(i + 1, cls, cls === 'blunder' ? 10 : 100))
    const whiteWp = Array<number>(game.moves.length + 1).fill(50)
    const report = summarizeReview(game, reviews, whiteWp)
    expect(report.phases.map((p) => p.phase)).toEqual(['opening', 'middlegame', 'endgame'])
    expect(report.phases[0].range).toEqual({ start: 1, end: 7 })
    expect(report.phases[1].range).toBeUndefined()
    expect(report.phases[2].range).toBeUndefined()
    expect(report.phases[1].grade).toEqual({})
    expect(report.rating).toEqual({})
    expect(report.counts.blunder.b).toEqual({ count: 1, firstPly: 6 })
  })

  it('grades each phase from gameAccuracy on its slice', () => {
    const moves = fakeMoves(40, () => START_FEN)
    const game = { startFen: START_FEN, moves: moves.map((m) => ({ ...m, fenAfter: START_FEN })) } as unknown as Parameters<
      typeof summarizeReview
    >[0]
    const reviews = moves.map((m) => {
      const white = m.color === 'w'
      return review(m.ply, 'good', white && m.ply > 24 ? 30 : 100)
    })
    const whiteWp = Array.from({ length: 41 }, (_, i) => 50 + (i % 4))
    const report = summarizeReview(game, reviews, whiteWp)
    const [opening, middlegame, endgame] = report.phases

    expect(opening.range).toEqual({ start: 1, end: 24 })
    expect(middlegame.range).toEqual({ start: 25, end: 40 })
    expect(endgame.range).toBeUndefined()
    expect(opening.grade.w).toBe('good')
    expect(middlegame.grade.w).toBe('poor')
    expect(middlegame.grade.b).toBe('good')

    const slice = (start: number, end: number) =>
      gameAccuracy(
        whiteWp.slice(start - 1, end + 1),
        reviews.slice(start - 1, end).map((r, i) => ({ color: moves[start - 1 + i].color, accuracy: r.accuracy })),
      )
    expect(opening.accuracy).toEqual(slice(1, 24))
    expect(middlegame.accuracy).toEqual(slice(25, 40))

    // 20 moves each: both sides get a rating estimate.
    expect(moves.filter((m) => m.color === 'w').length).toBeGreaterThanOrEqual(MIN_MOVES_FOR_RATING)
    const overall = slice(1, 40)
    expect(report.rating.w).toBe(estimateRating(overall.w!))
    expect(report.rating.b).toBe(2900)
  })
})
