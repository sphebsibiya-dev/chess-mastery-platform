import { describe, expect, it } from 'vitest'
import {
  filterByTimeClass,
  formatClock,
  formatTimeControl,
  normaliseTimeClass,
  parseTimeControl,
  presentTimeClasses,
  timeClassFromClock,
} from './timeControl'
import type { TimeClass } from './types'

describe('parseTimeControl', () => {
  it.each([
    ['180+2', { initialSeconds: 180, incrementSeconds: 2 }],
    ['600', { initialSeconds: 600, incrementSeconds: 0 }],
    ['15+0', { initialSeconds: 15, incrementSeconds: 0 }],
    [' 300+3 ', { initialSeconds: 300, incrementSeconds: 3 }],
  ])('%s', (input, expected) => {
    expect(parseTimeControl(input)).toEqual(expected)
  })

  it.each(['-', '1/86400', '', 'abc', '40/7200:3600'])('returns null for %j', (input) => {
    expect(parseTimeControl(input)).toBeNull()
  })

  it('returns null for a missing tag', () => {
    expect(parseTimeControl(undefined)).toBeNull()
  })
})

describe('formatTimeControl', () => {
  it.each([
    ['180', '3+0'],
    ['180+2', '3+2'],
    ['600+5', '10+5'],
    ['15', '15s+0'],
    ['90+1', '1.5+1'],
    ['1/86400', '1 day'],
    ['1/259200', '3 days'],
    ['-', 'Unlimited'],
    ['weird', 'weird'],
  ])('%s -> %s', (input, expected) => {
    expect(formatTimeControl(input)).toBe(expected)
  })
})

describe('formatClock', () => {
  it('formats a Lichess clock', () => {
    expect(formatClock(180, 2)).toBe('3+2')
    expect(formatClock(15, 0)).toBe('15s+0')
    expect(formatClock(60)).toBe('1+0')
  })
})

describe('normaliseTimeClass', () => {
  it.each([
    ['ultraBullet', 'bullet'],
    ['bullet', 'bullet'],
    ['blitz', 'blitz'],
    ['rapid', 'rapid'],
    ['classical', 'classical'],
    ['daily', 'daily'],
    ['correspondence', 'daily'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseTimeClass(input)).toBe(expected)
  })

  it('returns null for unknown or missing names', () => {
    expect(normaliseTimeClass('hyper')).toBeNull()
    expect(normaliseTimeClass(undefined)).toBeNull()
  })
})

describe('timeClassFromClock', () => {
  it('uses initial + 40 * increment', () => {
    expect(timeClassFromClock(60)).toBe('bullet')
    expect(timeClassFromClock(180)).toBe('blitz')
    expect(timeClassFromClock(180, 2)).toBe('blitz')
    expect(timeClassFromClock(600)).toBe('rapid')
    expect(timeClassFromClock(1800, 20)).toBe('classical')
  })
})

describe('filterByTimeClass', () => {
  const games: { id: number; timeClass: TimeClass }[] = [
    { id: 1, timeClass: 'blitz' },
    { id: 2, timeClass: 'rapid' },
    { id: 3, timeClass: 'blitz' },
    { id: 4, timeClass: 'daily' },
  ]

  it('keeps only the chosen class', () => {
    expect(filterByTimeClass(games, 'blitz').map((g) => g.id)).toEqual([1, 3])
    expect(filterByTimeClass(games, 'bullet')).toEqual([])
  })

  it("'all' keeps everything", () => {
    expect(filterByTimeClass(games, 'all')).toEqual(games)
  })

  it('lists present classes in canonical order', () => {
    expect(presentTimeClasses(games)).toEqual(['blitz', 'rapid', 'daily'])
  })
})
