import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import { sideToMove, terminalEval, toWhitePov } from './evaluate'

describe('toWhitePov', () => {
  it('keeps cp for White to move and flips it for Black', () => {
    expect(toWhitePov({ type: 'cp', value: 35 }, 'w')).toEqual({ kind: 'cp', cp: 35 })
    expect(toWhitePov({ type: 'cp', value: -35 }, 'b')).toEqual({ kind: 'cp', cp: 35 })
    expect(toWhitePov({ type: 'cp', value: 0 }, 'b')).toEqual({ kind: 'cp', cp: 0 })
  })

  it('assigns the mate winner from the side to move', () => {
    expect(toWhitePov({ type: 'mate', value: 2 }, 'b')).toEqual({ kind: 'mate', in: 2, winner: 'b' })
    expect(toWhitePov({ type: 'mate', value: 2 }, 'w')).toEqual({ kind: 'mate', in: 2, winner: 'w' })
    expect(toWhitePov({ type: 'mate', value: -3 }, 'w')).toEqual({ kind: 'mate', in: 3, winner: 'b' })
    expect(toWhitePov({ type: 'mate', value: -1 }, 'b')).toEqual({ kind: 'mate', in: 1, winner: 'w' })
  })

  it('treats mate 0 as the side to move being mated', () => {
    expect(toWhitePov({ type: 'mate', value: 0 }, 'w')).toEqual({ kind: 'mate', in: 0, winner: 'b' })
  })
})

describe('terminalEval', () => {
  it('scores checkmate on the board', () => {
    expect(terminalEval('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toEqual({
      kind: 'mate',
      in: 0,
      winner: 'b',
    })
  })

  it('scores stalemate and insufficient material as a draw', () => {
    expect(terminalEval('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ kind: 'draw' })
    expect(terminalEval('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).toEqual({ kind: 'draw' })
  })

  it('returns undefined for a normal position', () => {
    expect(terminalEval(START_FEN)).toBeUndefined()
  })
})

describe('sideToMove', () => {
  it('reads the FEN turn field', () => {
    expect(sideToMove(START_FEN)).toBe('w')
    expect(sideToMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('b')
  })
})
