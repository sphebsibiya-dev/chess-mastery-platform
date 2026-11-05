import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { terminalEval } from '../engine/evaluate'
import { winPercentFromCp } from '../review/winProbability'
import { barLabel, evalBarView } from './evalBarGeometry'

describe('evalBarView', () => {
  it('is pending with a half bar and no label when there is no eval yet', () => {
    expect(evalBarView(undefined)).toEqual({
      pending: true,
      whiteShare: 50,
      label: '',
      labelSide: 'w',
      ariaText: 'Evaluation pending',
    })
  })

  it('shows an equal position as half and half', () => {
    const view = evalBarView({ kind: 'cp', cp: 0 })
    expect(view).toMatchObject({ pending: false, whiteShare: 50, label: '0.0', labelSide: 'w' })
    expect(view.ariaText).toBe('Evaluation 0.00')
  })

  it('fills by win% for a White advantage', () => {
    const view = evalBarView({ kind: 'cp', cp: 120 })
    expect(view.whiteShare).toBeCloseTo(winPercentFromCp(120))
    expect(view.whiteShare).toBeCloseTo(61, 0)
    expect(view).toMatchObject({ label: '1.2', labelSide: 'w', ariaText: 'Evaluation +1.20' })
  })

  it('fills by win% for a Black advantage with the label on the black end', () => {
    const view = evalBarView({ kind: 'cp', cp: -250 })
    expect(view.whiteShare).toBeCloseTo(winPercentFromCp(-250))
    expect(view.whiteShare).toBeCloseTo(28.5, 0)
    expect(view).toMatchObject({ label: '2.5', labelSide: 'b', ariaText: 'Evaluation -2.50' })
  })

  it('puts a tiny Black edge on the black end', () => {
    expect(evalBarView({ kind: 'cp', cp: -4 })).toMatchObject({ label: '0.0', labelSide: 'b' })
  })

  it('clamps big cp evals so the losing side stays visible', () => {
    expect(evalBarView({ kind: 'cp', cp: 5000 }).whiteShare).toBe(95)
    expect(evalBarView({ kind: 'cp', cp: -5000 }).whiteShare).toBe(5)
  })

  it('fills the whole bar for the side that mates', () => {
    expect(evalBarView({ kind: 'mate', in: 3, winner: 'w' })).toMatchObject({
      whiteShare: 100,
      label: 'M3',
      labelSide: 'w',
      ariaText: 'Evaluation M3',
    })
    expect(evalBarView({ kind: 'mate', in: 1, winner: 'b' })).toMatchObject({
      whiteShare: 0,
      label: 'M1',
      labelSide: 'b',
      ariaText: 'Evaluation -M1',
    })
  })

  it('shows the result once checkmate is on the board', () => {
    expect(evalBarView({ kind: 'mate', in: 0, winner: 'w' })).toMatchObject({
      whiteShare: 100,
      label: '1-0',
      labelSide: 'w',
      ariaText: 'Evaluation #',
    })
    expect(evalBarView({ kind: 'mate', in: 0, winner: 'b' })).toMatchObject({
      whiteShare: 0,
      label: '0-1',
      labelSide: 'b',
    })
  })

  it('shows a draw as half and half', () => {
    expect(evalBarView({ kind: 'draw' })).toMatchObject({
      whiteShare: 50,
      label: '½-½',
      labelSide: 'w',
      ariaText: 'Evaluation Draw',
    })
  })

  it('works with the evals of real terminal positions', () => {
    const chess = new Chess()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(san)
    const mated = terminalEval(chess.fen())
    expect(evalBarView(mated)).toMatchObject({ label: '0-1', whiteShare: 0, labelSide: 'b' })

    const stalemate = terminalEval('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(evalBarView(stalemate)).toMatchObject({ label: '½-½', whiteShare: 50 })
  })
})

describe('barLabel', () => {
  it.each([
    [35, '0.4'],
    [994, '9.9'],
    [995, '10'],
    [1234, '12'],
    [-1234, '12'],
    [100, '1.0'],
  ])('cp %d -> %s', (cp, label) => {
    expect(barLabel({ kind: 'cp', cp })).toBe(label)
  })
})
