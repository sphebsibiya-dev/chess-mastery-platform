import type { TimeClass } from './types'

export const TIME_CLASSES: readonly TimeClass[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily']

export const TIME_CLASS_LABELS: Record<TimeClass, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  daily: 'Daily',
}

/** Seconds as a clock base: 180 -> '3', 90 -> '1.5', 15 -> '15s'. */
function formatBase(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = seconds / 60
  return Number.isInteger(minutes) ? String(minutes) : String(Math.round(minutes * 100) / 100)
}

/** '1 day', '3 days'. */
export function formatDays(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`
}

/** Clock in seconds plus increment: (180, 2) -> '3+2'. */
export function formatClock(initialSeconds: number, incrementSeconds = 0): string {
  return `${formatBase(initialSeconds)}+${incrementSeconds}`
}

/**
 * chess.com / PGN `TimeControl` to display form:
 * '180' -> '3+0', '180+2' -> '3+2', '15' -> '15s+0', '1/86400' -> '1 day'.
 * Unknown formats are returned unchanged; '-' (no clock) gives 'Unlimited'.
 */
export function formatTimeControl(timeControl: string): string {
  const tc = timeControl.trim()
  if (tc === '-' || tc === '') return 'Unlimited'
  const daily = /^1\/(\d+)$/.exec(tc)
  if (daily) {
    const seconds = Number(daily[1])
    const days = seconds / 86400
    return Number.isInteger(days) ? formatDays(days) : `${Math.round(seconds / 3600)} h/move`
  }
  const live = /^(\d+)(?:\+(\d+(?:\.\d+)?))?$/.exec(tc)
  if (live) return formatClock(Number(live[1]), live[2] === undefined ? 0 : Number(live[2]))
  return tc
}

export interface ParsedTimeControl {
  initialSeconds: number
  incrementSeconds: number
}

/**
 * Live-clock `TimeControl` tag to seconds: '180+2' -> { 180, 2 }, '600' -> { 600, 0 }.
 * Returns null for games without a live clock ('-', daily '1/86400') and for
 * anything it cannot read.
 */
export function parseTimeControl(timeControl: string | undefined | null): ParsedTimeControl | null {
  const live = /^(\d+)(?:\+(\d+(?:\.\d+)?))?$/.exec((timeControl ?? '').trim())
  if (!live) return null
  return { initialSeconds: Number(live[1]), incrementSeconds: live[2] === undefined ? 0 : Number(live[2]) }
}

/** Site speed names to our time classes. Returns null for unknown names. */
export function normaliseTimeClass(name: string | undefined | null): TimeClass | null {
  switch ((name ?? '').toLowerCase()) {
    case 'ultrabullet':
    case 'bullet':
      return 'bullet'
    case 'blitz':
      return 'blitz'
    case 'rapid':
      return 'rapid'
    case 'classical':
      return 'classical'
    case 'daily':
    case 'correspondence':
    case 'unlimited':
      return 'daily'
    default:
      return null
  }
}

/**
 * Time class from a clock, using Lichess's estimate (initial + 40 * increment):
 * < 3 min bullet, < 8 min blitz, < 25 min rapid, else classical.
 */
export function timeClassFromClock(initialSeconds: number, incrementSeconds = 0): TimeClass {
  const estimate = initialSeconds + 40 * incrementSeconds
  if (estimate < 180) return 'bullet'
  if (estimate < 480) return 'blitz'
  if (estimate < 1500) return 'rapid'
  return 'classical'
}

export function filterByTimeClass<T extends { timeClass: TimeClass }>(games: readonly T[], filter: TimeClass | 'all'): T[] {
  return filter === 'all' ? [...games] : games.filter((g) => g.timeClass === filter)
}

/** Time classes present in a list, in canonical order. */
export function presentTimeClasses(games: readonly { timeClass: TimeClass }[]): TimeClass[] {
  const present = new Set(games.map((g) => g.timeClass))
  return TIME_CLASSES.filter((c) => present.has(c))
}
