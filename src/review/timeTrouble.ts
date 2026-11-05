import { parseTimeControl, type ParsedTimeControl } from '../import/timeControl'
import type { GameHeaders, ImportedMove } from '../import/types'
import { INACCURACY_MAX_LOSS, MISTAKE_MAX_LOSS } from './classify'
import type { MoveReview } from './types'

export type TimeFlag = 'low-clock' | 'too-fast'

export interface MoveTime {
  ply: number
  /** Clock left after the move. */
  clockSeconds?: number
  /** Time used on the move (increment included); undefined when it cannot be known. */
  spentSeconds?: number
  flags: TimeFlag[]
}

export interface GameTimes {
  hasClocks: boolean
  control: ParsedTimeControl | null
  /** One entry per move, index = ply - 1. */
  moves: MoveTime[]
  /** First low-clock ply per side. */
  troubleStart: { w?: number; b?: number }
  /** Median time spent per side after the opening (see `TOO_FAST_AFTER_MOVE`). */
  medianSpent: { w?: number; b?: number }
}

/*
 * Thresholds. Exported so they can be tuned later.
 */
/** Low clock = under this share of the initial time... */
export const LOW_CLOCK_SHARE = 0.1
/** ...clamped to this range, in seconds. */
export const LOW_CLOCK_MIN_SECONDS = 10
export const LOW_CLOCK_MAX_SECONDS = 60
/** Too-fast checks (and the median) only use moves after this move number. */
export const TOO_FAST_AFTER_MOVE = 8
/** The median needs at least this many timed moves. */
export const MIN_TIMED_MOVES_FOR_MEDIAN = 5
/** Too fast = at most this share of the side's median... */
export const TOO_FAST_SHARE = 0.3
/** ...or this many seconds, whichever is larger. */
export const TOO_FAST_MIN_SECONDS = 1
/** A position is critical when the move lost at least this much... */
export const CRITICAL_MOVE_LOSS = INACCURACY_MAX_LOSS
/** ...or the opponent's previous move lost at least this much. */
export const CRITICAL_OPPONENT_LOSS = MISTAKE_MAX_LOSS

/** Seconds left below which a player is in time trouble: 1+0 -> 10, 3+0 -> 18, 10+0 -> 60. */
export function lowClockThreshold(initialSeconds: number): number {
  return Math.min(LOW_CLOCK_MAX_SECONDS, Math.max(LOW_CLOCK_MIN_SECONDS, LOW_CLOCK_SHARE * initialSeconds))
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** No live clock: '-' (unlimited) or daily '1/86400'. */
function isUntimed(timeControl: string | undefined): boolean {
  const tc = timeControl?.trim()
  return tc === '-' || (tc !== undefined && /^\d+\/\d+$/.test(tc))
}

type TimedMove = Pick<ImportedMove, 'ply' | 'moveNumber' | 'color' | 'clockSeconds'>

/**
 * Time used per move and time-trouble flags, from `[%clk]` comments.
 *
 * - spent = previous clock of the same side - clock + increment, floored at 0.
 *   A side's first move uses the initial time as the previous clock.
 * - Without a `TimeControl` tag the initial time is the highest clock seen and
 *   the increment is 0.
 * - `low-clock`: clock below `lowClockThreshold(initial)`.
 * - `too-fast` (needs `reviews`): after move 8, spent at most
 *   max(1s, 30% of the side's median) in a critical position (the move lost 10+
 *   or the opponent's previous move lost 20+). Never on low-clock or forced moves.
 */
export function moveTimes(
  game: { moves: readonly TimedMove[]; headers: Pick<GameHeaders, 'timeControl'> },
  reviews?: readonly MoveReview[],
): GameTimes {
  const empty = (): GameTimes => ({
    hasClocks: false,
    control: null,
    moves: game.moves.map((m) => ({ ply: m.ply, flags: [] })),
    troubleStart: {},
    medianSpent: {},
  })

  const clocks = game.moves.map((m) => m.clockSeconds).filter((c): c is number => c !== undefined)
  if (clocks.length === 0 || isUntimed(game.headers.timeControl)) return empty()

  const control = parseTimeControl(game.headers.timeControl) ?? {
    initialSeconds: Math.max(...clocks),
    incrementSeconds: 0,
  }
  const threshold = lowClockThreshold(control.initialSeconds)

  const prevClock: { w?: number; b?: number } = { w: control.initialSeconds, b: control.initialSeconds }
  const troubleStart: GameTimes['troubleStart'] = {}
  const moves: MoveTime[] = game.moves.map((m) => {
    const entry: MoveTime = { ply: m.ply, flags: [] }
    const clock = m.clockSeconds
    if (clock === undefined) {
      prevClock[m.color] = undefined
      return entry
    }
    entry.clockSeconds = clock
    const prev = prevClock[m.color]
    if (prev !== undefined) entry.spentSeconds = Math.max(0, prev - clock + control.incrementSeconds)
    prevClock[m.color] = clock
    if (clock < threshold) {
      entry.flags.push('low-clock')
      if (troubleStart[m.color] === undefined) troubleStart[m.color] = m.ply
    }
    return entry
  })

  const medianSpent: GameTimes['medianSpent'] = {}
  for (const color of ['w', 'b'] as const) {
    const spent = moves
      .filter((_, i) => game.moves[i].color === color && game.moves[i].moveNumber > TOO_FAST_AFTER_MOVE)
      .map((t) => t.spentSeconds)
      .filter((s): s is number => s !== undefined)
    if (spent.length >= MIN_TIMED_MOVES_FOR_MEDIAN) medianSpent[color] = median(spent)
  }

  if (reviews) {
    moves.forEach((t, i) => {
      const move = game.moves[i]
      const review = reviews[i]
      const med = medianSpent[move.color]
      if (!review || med === undefined || t.spentSeconds === undefined) return
      if (move.moveNumber <= TOO_FAST_AFTER_MOVE || review.cls === 'forced' || t.flags.includes('low-clock')) return
      if (t.spentSeconds > Math.max(TOO_FAST_MIN_SECONDS, TOO_FAST_SHARE * med)) return
      const prev = i > 0 && game.moves[i - 1].color !== move.color ? reviews[i - 1] : undefined
      const critical = review.loss >= CRITICAL_MOVE_LOSS || (prev !== undefined && prev.loss >= CRITICAL_OPPONENT_LOSS)
      if (critical) t.flags.push('too-fast')
    })
  }

  return { hasClocks: true, control, moves, troubleStart, medianSpent }
}
