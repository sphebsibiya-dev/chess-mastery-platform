import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import type { PositionAnalysis } from '../engine/types'
import { ENGINE_ARROW_COLOR, engineArrows, formatEval } from './analysisView'

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
    { fen: START_FEN, eval: { kind: 'cp', cp: 20 }, bestMove: 'e2e4', pv: ['e2e4'], depth: 14 },
    { fen: 'x', eval: { kind: 'mate', in: 0, winner: 'w' }, pv: [], depth: 0 },
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
