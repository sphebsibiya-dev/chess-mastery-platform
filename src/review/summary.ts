import { START_FEN } from '../chess/constants'
import { PIECE_VALUES } from '../chess/material'
import type { ImportedGame, ImportedMove } from '../import/types'
import { gameAccuracy } from './accuracy'
import { positionKey } from './openings/book'
import type { MoveClass, MoveReview, SideAccuracy } from './types'

type Color = 'w' | 'b'
const COLORS: readonly Color[] = ['w', 'b']

export type PhaseName = 'opening' | 'middlegame' | 'endgame'
export type PhaseGrade = 'good' | 'ok' | 'poor'

/** 1-based, inclusive ply range. */
export interface PlyRange {
  start: number
  end: number
}

export interface ClassCount {
  count: number
  /** The first ply with this class for this side (the jump target); unset when count is 0. */
  firstPly?: number
}

export type ClassCounts = Record<MoveClass, Record<Color, ClassCount>>

export interface PhaseReport {
  phase: PhaseName
  /** Undefined when the game has no such phase. */
  range?: PlyRange
  /** Each side's accuracy over the phase (`gameAccuracy` on the phase slice). */
  accuracy: SideAccuracy
  grade: Partial<Record<Color, PhaseGrade>>
}

export interface ReviewReport {
  counts: ClassCounts
  /** Estimated rating per side; undefined when the side made too few moves. */
  rating: Partial<Record<Color, number>>
  /** Always three entries, in phase order. */
  phases: PhaseReport[]
}

/** Row order of the class table in the summary. */
export const SUMMARY_CLASS_ORDER: readonly MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
  'forced',
]

export const PHASE_ORDER: readonly PhaseName[] = ['opening', 'middlegame', 'endgame']

// ---------------------------------------------------------------------------
// Rating estimate

/**
 * Accuracy -> rating anchor points. This is a documented first guess, not a
 * calibrated model: it maps game accuracy (0..100) piecewise-linearly onto a
 * rating. It only looks at accuracy, so the UI labels it as an estimate.
 */
export const RATING_TABLE: readonly (readonly [accuracy: number, rating: number])[] = [
  [0, 100],
  [40, 400],
  [50, 600],
  [60, 850],
  [70, 1150],
  [80, 1500],
  [85, 1800],
  [90, 2100],
  [95, 2500],
  [100, 2900],
]
export const RATING_ROUND_TO = 50
export const RATING_MIN = 100
export const RATING_MAX = 3000
/** A side needs at least this many moves for a rating estimate. */
export const MIN_MOVES_FOR_RATING = 10

/**
 * Estimated rating for a game accuracy: linear interpolation in `RATING_TABLE`,
 * rounded to the nearest 50 and clamped to 100..3000. Accuracy outside 0..100
 * is clamped first.
 */
export function estimateRating(accuracy: number): number {
  const acc = Math.max(0, Math.min(100, accuracy))
  let rating = RATING_TABLE[RATING_TABLE.length - 1][1]
  for (let i = 1; i < RATING_TABLE.length; i++) {
    const [a1, r1] = RATING_TABLE[i]
    if (acc <= a1) {
      const [a0, r0] = RATING_TABLE[i - 1]
      rating = r0 + ((acc - a0) / (a1 - a0)) * (r1 - r0)
      break
    }
  }
  const rounded = Math.round(rating / RATING_ROUND_TO) * RATING_ROUND_TO
  return Math.max(RATING_MIN, Math.min(RATING_MAX, rounded))
}

// ---------------------------------------------------------------------------
// Phase grades

export const PHASE_GOOD_MIN = 80
export const PHASE_OK_MIN = 60

/** good >= 80, ok >= 60, poor below; undefined when the side had no moves. */
export function phaseGrade(accuracy: number | undefined): PhaseGrade | undefined {
  if (accuracy === undefined) return undefined
  if (accuracy >= PHASE_GOOD_MIN) return 'good'
  if (accuracy >= PHASE_OK_MIN) return 'ok'
  return 'poor'
}

// ---------------------------------------------------------------------------
// Phase boundaries

/** A position is an endgame at or below this much non-pawn material (both sides, in pawns). */
export const ENDGAME_MAX_NON_PAWN = 13
/** In a standard-start game the opening lasts at least through this full move. */
export const OPENING_FALLBACK_MOVES = 12

/**
 * Total non-pawn material of both sides (N/B 3, R 5, Q 9), counted from the
 * letters of the FEN placement field. No rule logic is involved.
 */
export function nonPawnMaterial(fen: string): number {
  const placement = fen.trim().split(/\s+/)[0] ?? ''
  let total = 0
  for (const ch of placement) {
    const type = ch.toLowerCase()
    if (type === 'n' || type === 'b' || type === 'r' || type === 'q') total += PIECE_VALUES[type]
  }
  return total
}

/** No queen of either colour, or at most `ENDGAME_MAX_NON_PAWN` non-pawn material. */
export function isEndgamePosition(fen: string): boolean {
  const placement = fen.trim().split(/\s+/)[0] ?? ''
  if (!/[qQ]/.test(placement)) return true
  return nonPawnMaterial(fen) <= ENDGAME_MAX_NON_PAWN
}

export type PhaseRanges = Record<PhaseName, PlyRange | undefined>

type PhaseMove = Pick<ImportedMove, 'moveNumber' | 'fenBefore'>

const rangeOf = (start: number, end: number): PlyRange | undefined => (end >= start ? { start, end } : undefined)

/**
 * Splits the game into contiguous opening / middlegame / endgame ply ranges
 * (any may be empty):
 * - The endgame starts at the first ply whose `fenBefore` is an endgame position
 *   and lasts to the end of the game.
 * - The opening ends at the last `book` ply. From the standard start position
 *   it lasts at least through move `OPENING_FALLBACK_MOVES`. It never runs into
 *   the endgame.
 * - The middlegame is whatever lies between.
 */
export function splitPhases(
  game: { startFen: string; moves: readonly PhaseMove[] },
  classes: readonly (MoveClass | undefined)[],
): PhaseRanges {
  const n = game.moves.length
  const endgameIndex = game.moves.findIndex((m) => isEndgamePosition(m.fenBefore))
  const endgameStart = endgameIndex === -1 ? n + 1 : endgameIndex + 1

  let openingEnd = 0
  for (let i = 0; i < n; i++) if (classes[i] === 'book') openingEnd = i + 1
  if (positionKey(game.startFen) === positionKey(START_FEN)) {
    for (let i = 0; i < n; i++) {
      if (game.moves[i].moveNumber <= OPENING_FALLBACK_MOVES) openingEnd = Math.max(openingEnd, i + 1)
    }
  }
  openingEnd = Math.min(openingEnd, endgameStart - 1)

  return {
    opening: rangeOf(1, openingEnd),
    middlegame: rangeOf(openingEnd + 1, endgameStart - 1),
    endgame: rangeOf(endgameStart, n),
  }
}

// ---------------------------------------------------------------------------
// Class counts

/**
 * Counts each class per side, split by the mover's colour (not ply parity),
 * and remembers the first ply of each.
 */
export function countClasses(
  moves: readonly Pick<ImportedMove, 'color'>[],
  reviews: readonly Pick<MoveReview, 'cls'>[],
): ClassCounts {
  const counts = {} as ClassCounts
  for (const cls of SUMMARY_CLASS_ORDER) counts[cls] = { w: { count: 0 }, b: { count: 0 } }
  reviews.forEach((review, i) => {
    const color = moves[i]?.color
    if (!color) return
    const entry = counts[review.cls][color]
    entry.count++
    entry.firstPly ??= i + 1
  })
  return counts
}

// ---------------------------------------------------------------------------
// Whole report

function accuracyOver(
  moves: readonly Pick<ImportedMove, 'color'>[],
  reviews: readonly Pick<MoveReview, 'accuracy'>[],
  whiteWp: readonly number[],
  range: PlyRange,
): SideAccuracy {
  return gameAccuracy(
    whiteWp.slice(range.start - 1, range.end + 1),
    reviews.slice(range.start - 1, range.end).map((r, i) => ({
      color: moves[range.start - 1 + i].color,
      accuracy: r.accuracy,
    })),
  )
}

/**
 * The summary report: class counts, an estimated rating and per-phase accuracy
 * and grades for each side.
 *
 * @param whiteWp White's win% for every position (moves.length + 1 entries).
 */
export function summarizeReview(
  game: Pick<ImportedGame, 'startFen' | 'moves'>,
  reviews: readonly MoveReview[],
  whiteWp: readonly number[],
): ReviewReport {
  const { moves } = game
  const counts = countClasses(moves, reviews)

  const rating: ReviewReport['rating'] = {}
  if (moves.length > 0) {
    const overall = accuracyOver(moves, reviews, whiteWp, { start: 1, end: moves.length })
    for (const color of COLORS) {
      const made = moves.filter((m) => m.color === color).length
      const acc = overall[color]
      if (made >= MIN_MOVES_FOR_RATING && acc !== undefined) rating[color] = estimateRating(acc)
    }
  }

  const ranges = splitPhases(
    game,
    reviews.map((r) => r.cls),
  )
  const phases = PHASE_ORDER.map((phase): PhaseReport => {
    const range = ranges[phase]
    if (!range) return { phase, accuracy: {}, grade: {} }
    const accuracy = accuracyOver(moves, reviews, whiteWp, range)
    const grade: PhaseReport['grade'] = {}
    for (const color of COLORS) {
      const g = phaseGrade(accuracy[color])
      if (g) grade[color] = g
    }
    return { phase, range, accuracy, grade }
  })

  return { counts, rating, phases }
}
