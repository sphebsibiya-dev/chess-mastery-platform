import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import type { PositionAnalysis } from '../engine/types'
import type { KeyMoment } from '../review/keyMoments'
import type { GameTimes } from '../review/timeTrouble'
import {
  ENGINE_ARROW_COLOR,
  engineArrows,
  formatEval,
  graphValueText,
  momentText,
  moveClockText,
  moveLabel,
  timeBadge,
  timeBadges,
  timeTroubleText,
} from './analysisView'

describe('key moment and clock text', () => {
  const qxb2 = { moveNumber: 23, color: 'b' as const, san: 'Qxb2' }

  it('labels moves', () => {
    expect(moveLabel(qxb2)).toBe('23... Qxb2')
    expect(moveLabel({ moveNumber: 1, color: 'w', san: 'e4' })).toBe('1. e4')
  })

  it('describes a moment', () => {
    const moment: KeyMoment = {
      ply: 46,
      color: 'b',
      kinds: ['blunder', 'turning-point'],
      loss: 34,
      whiteWpBefore: 52.4,
      whiteWpAfter: 18.2,
      bestMoveSan: 'Rd1',
    }
    expect(momentText(moment, qxb2)).toBe('23... Qxb2 · Blunder, turning point · White 52% → 18% · best Rd1')
    expect(momentText({ ...moment, kinds: ['missed-tactic'], bestMoveSan: undefined }, qxb2)).toBe(
      '23... Qxb2 · Missed tactic · White 52% → 18%',
    )
  })

  it('labels time badges', () => {
    expect(timeBadge({ ply: 1, clockSeconds: 9.4, flags: ['low-clock'] }, 12)).toEqual({
      flag: 'low-clock',
      label: 'Low clock: 0:09',
    })
    expect(timeBadge({ ply: 1, clockSeconds: 90, spentSeconds: 1, flags: ['too-fast'] }, 12)).toEqual({
      flag: 'too-fast',
      label: 'Played in 1s (usual 12s)',
    })
    expect(timeBadge({ ply: 1, clockSeconds: 90, spentSeconds: 30, flags: [] }, 12)).toBeUndefined()
    expect(timeBadge(undefined, 12)).toBeUndefined()
  })

  it('uses each side’s own median for badges', () => {
    const times: GameTimes = {
      hasClocks: true,
      control: { initialSeconds: 180, incrementSeconds: 0 },
      moves: [
        { ply: 1, clockSeconds: 100, spentSeconds: 1, flags: ['too-fast'] },
        { ply: 2, clockSeconds: 100, spentSeconds: 2, flags: ['too-fast'] },
        { ply: 3, clockSeconds: 99, spentSeconds: 1, flags: [] },
      ],
      troubleStart: {},
      medianSpent: { w: 10, b: 20 },
    }
    expect(timeBadges(times, [{ color: 'w' }, { color: 'b' }, { color: 'w' }]).map((b) => b?.label)).toEqual([
      'Played in 1s (usual 10s)',
      'Played in 2s (usual 20s)',
      undefined,
    ])
  })

  it('describes time trouble and the current clock', () => {
    expect(timeTroubleText({ moveNumber: 34, color: 'w' }, 12.3)).toBe('White in time trouble from move 34 (0:12 left)')
    expect(moveClockText({ ply: 1, clockSeconds: 12, spentSeconds: 1, flags: [] })).toBe('Clock 0:12 · took 1s')
    expect(moveClockText({ ply: 1, clockSeconds: 12, flags: [] })).toBe('Clock 0:12')
    expect(moveClockText({ ply: 1, flags: [] })).toBeUndefined()
    expect(moveClockText(undefined)).toBeUndefined()
  })

  it('gives the graph a readable value', () => {
    expect(graphValueText({ moveNumber: 21, color: 'w', san: 'Qxb2' }, { kind: 'cp', cp: -340 })).toBe('21. Qxb2, -3.40')
    expect(graphValueText(undefined, { kind: 'cp', cp: 20 })).toBe('Start position, +0.20')
    expect(graphValueText(qxb2, undefined)).toBe('23... Qxb2, not analysed yet')
  })
})

describe('formatEval', () => {
  it('formats centipawns in pawns with a sign', () => {
    expect(formatEval({ kind: 'cp', cp: 35 })).toBe('+0.35')
    expect(formatEval({ kind: 'cp', cp: -120 })).toBe('-1.20')
    expect(formatEval({ kind: 'cp', cp: 0 })).toBe('0.00')
  })

  it('formats mates and draws', () => {
    expect(formatEval({ kind: 'mate', in: 3, winner: 'w' })).toBe('M3')
    expect(formatEval({ kind: 'mate', in: 2, winner: 'b' })).toBe('-M2')
    expect(formatEval({ kind: 'mate', in: 0, winner: 'b' })).toBe('#')
    expect(formatEval({ kind: 'draw' })).toBe('Draw')
  })
})

describe('engineArrows', () => {
  const positions: PositionAnalysis[] = [
    { fen: START_FEN, eval: { kind: 'cp', cp: 20 }, bestMove: 'e2e4', pv: ['e2e4'], depth: 14, lines: [] },
    { fen: 'x', eval: { kind: 'mate', in: 0, winner: 'w' }, pv: [], depth: 0, lines: [] },
  ]

  it('draws the best move for the current ply', () => {
    expect(engineArrows(positions, 0)).toEqual([{ startSquare: 'e2', endSquare: 'e4', color: ENGINE_ARROW_COLOR }])
  })

  it('is empty without a best move or before the position is analysed', () => {
    expect(engineArrows(positions, 1)).toEqual([])
    expect(engineArrows(positions, 5)).toEqual([])
    expect(engineArrows([], 0)).toEqual([])
  })
})
