import type { ImportedMove } from '../import/types'
import { GOOD_MAX_LOSS, INACCURACY_MAX_LOSS, MISTAKE_MAX_LOSS } from './classify'
import type { MoveClass, MoveReview } from './types'

export type KeyMomentKind = 'blunder' | 'missed-tactic' | 'turning-point'
export type WinBand = 'white' | 'equal' | 'black'

export interface KeyMoment {
  ply: number
  color: 'w' | 'b'
  /** Every kind that applies to this ply, in `KIND_ORDER`. */
  kinds: KeyMomentKind[]
  /** Win% lost by the mover. */
  loss: number
  /** White's win% before and after the move (for "52% -> 18%"). */
  whiteWpBefore: number
  whiteWpAfter: number
  bestMoveSan?: string
}

/*
 * Thresholds, all on the 0..100 win% scale. Exported so they can be tuned later.
 */
/** A move losing at least this much is a blunder (same as `classify.ts`). */
export const BLUNDER_MIN_LOSS = MISTAKE_MAX_LOSS
/** At most this many blunders per side are listed, biggest loss first. */
export const MAX_BLUNDERS_PER_SIDE = 3
/** Missed tactic: the opponent's previous move lost at least this much... */
export const MISSED_TACTIC_OPPONENT_LOSS = MISTAKE_MAX_LOSS
/** ...the mover then had at least this win%... */
export const MISSED_TACTIC_MIN_WP = 60
/** ...and the move itself lost at least this much. */
export const MISSED_TACTIC_MIN_LOSS = INACCURACY_MAX_LOSS
/** White win% at or below this is Black's band; at or above `WHITE_BAND_MIN` is White's (about +/-1.9 pawns). */
export const BLACK_BAND_MAX = 33
export const WHITE_BAND_MIN = 67
/** A band change only counts as a turning point if the move lost at least this much (filters eval noise). */
export const TURNING_POINT_MIN_LOSS = GOOD_MAX_LOSS
/** The list is capped at this many moments, keeping the largest losses. */
export const MAX_MOMENTS = 8

const KIND_ORDER: readonly KeyMomentKind[] = ['blunder', 'missed-tactic', 'turning-point']

/**
 * Classes that never make a key moment: forced moves had no choice, and book,
 * brilliant, great and best moves are good by definition, so any loss on them
 * is eval noise between search depths.
 */
const NEVER_KEY: ReadonlySet<MoveClass> = new Set(['forced', 'book', 'brilliant', 'great', 'best'])

/** Which side is clearly better, from White's win%. */
export function winBand(whiteWp: number): WinBand {
  if (whiteWp <= BLACK_BAND_MAX) return 'black'
  if (whiteWp >= WHITE_BAND_MIN) return 'white'
  return 'equal'
}

/** Keeps the `n` items with the largest loss (earlier ply wins ties). */
function largestLosses<T extends { ply: number; loss: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.loss - a.loss || a.ply - b.ply).slice(0, n)
}

/**
 * Finds the moves worth jumping to: blunders, missed tactics (the opponent just
 * blundered and the mover did not punish it) and turning points (the win% band
 * changed). Forced, book, brilliant, great and engine-best moves never count; a
 * move classified `miss` is always a missed tactic. Returns at most `MAX_MOMENTS`, sorted by ply.
 *
 * @param whiteWp White's win% for every position, `moves.length + 1` entries.
 */
export function findKeyMoments(
  moves: readonly Pick<ImportedMove, 'ply' | 'color'>[],
  reviews: readonly MoveReview[],
  whiteWp: readonly number[],
): KeyMoment[] {
  if (reviews.length !== moves.length) {
    throw new Error(`Expected ${moves.length} reviews, got ${reviews.length}`)
  }
  if (whiteWp.length !== moves.length + 1) {
    throw new Error(`Expected ${moves.length + 1} win percentages, got ${whiteWp.length}`)
  }

  const candidates: KeyMoment[] = []
  moves.forEach((move, i) => {
    const review = reviews[i]
    if (NEVER_KEY.has(review.cls)) return
    const kinds = new Set<KeyMomentKind>()

    if (review.loss >= BLUNDER_MIN_LOSS) kinds.add('blunder')

    const prevMove = moves[i - 1]
    const prevReview = reviews[i - 1]
    if (review.cls === 'miss') {
      kinds.add('missed-tactic')
    } else if (
      prevMove &&
      prevReview &&
      prevMove.color !== move.color &&
      prevReview.loss >= MISSED_TACTIC_OPPONENT_LOSS &&
      review.wpBefore >= MISSED_TACTIC_MIN_WP &&
      review.loss >= MISSED_TACTIC_MIN_LOSS
    ) {
      kinds.add('missed-tactic')
    }

    if (winBand(whiteWp[i]) !== winBand(whiteWp[i + 1]) && review.loss >= TURNING_POINT_MIN_LOSS) {
      kinds.add('turning-point')
    }

    if (kinds.size === 0) return
    const moment: KeyMoment = {
      ply: move.ply,
      color: move.color,
      kinds: KIND_ORDER.filter((k) => kinds.has(k)),
      loss: review.loss,
      whiteWpBefore: whiteWp[i],
      whiteWpAfter: whiteWp[i + 1],
    }
    if (review.bestMoveSan) moment.bestMoveSan = review.bestMoveSan
    candidates.push(moment)
  })

  // Only the biggest blunders per side keep the "blunder" kind; a capped
  // blunder still stays if it is also a missed tactic or turning point.
  for (const color of ['w', 'b'] as const) {
    const blunders = candidates.filter((m) => m.color === color && m.kinds.includes('blunder'))
    const keep = new Set(largestLosses(blunders, MAX_BLUNDERS_PER_SIDE))
    for (const m of blunders) {
      if (!keep.has(m)) m.kinds = m.kinds.filter((k) => k !== 'blunder')
    }
  }

  return largestLosses(
    candidates.filter((m) => m.kinds.length > 0),
    MAX_MOMENTS,
  ).sort((a, b) => a.ply - b.ply)
}
