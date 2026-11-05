import { describe, expect, it } from 'vitest'
import { TWO_GAMES } from '../import/fixtures'
import { parsePgn } from '../import/pgn'
import type { ImportedGame } from '../import/types'
import { isAbortError } from './abort'
import { analyseGame, GREAT_CHECK_MULTI_PV } from './analyseGame'
import type { AnalyseOptions, Engine, EngineResult } from './types'

function foolsMate(): ImportedGame {
  const result = parsePgn(TWO_GAMES)
  if (!result.ok) throw new Error(result.error)
  return result.games[1]
}

/**
 * Returns +40 cp for the side to move in every position, best move 'a2a3' unless
 * `best` names another for that FEN, and as many lines as `multiPv` asks for.
 */
class FakeEngine implements Engine {
  best = new Map<string, string>()
  seen: string[] = []
  options: AnalyseOptions[] = []
  newGames = 0
  onAnalyse?: (index: number) => void

  async newGame(): Promise<void> {
    this.newGames++
  }

  async analyse(fen: string, opts: AnalyseOptions): Promise<EngineResult> {
    this.onAnalyse?.(this.seen.length)
    this.seen.push(fen)
    this.options.push(opts)
    if (opts.signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError')
    const bestMove = this.best.get(fen) ?? 'a2a3'
    const lines = [
      { move: bestMove, score: { type: 'cp' as const, value: 40 }, pv: [bestMove] },
      { move: 'h2h3', score: { type: 'cp' as const, value: 10 }, pv: ['h2h3'] },
    ]
    return {
      score: { type: 'cp', value: 40 },
      bestMove,
      pv: [bestMove],
      depth: 14,
      lines: lines.slice(0, opts.multiPv ?? 1),
    }
  }
}

describe('analyseGame', () => {
  it("evaluates all N + 1 positions of Fool's mate and reports progress", async () => {
    const game = foolsMate()
    const engine = new FakeEngine()
    const progress: [number, number][] = []
    const analysis = await analyseGame(game, engine, {
      depth: 14,
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(analysis.gameId).toBe(game.id)
    expect(analysis.depth).toBe(14)
    expect(analysis.positions).toHaveLength(5)
    expect(analysis.positions.map((p) => p.fen)).toEqual([game.startFen, ...game.moves.map((m) => m.fenAfter)])
    expect(progress).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ])
    expect(engine.newGames).toBe(1)
  })

  it('does not send the mated position to the engine', async () => {
    const game = foolsMate()
    const engine = new FakeEngine()
    const analysis = await analyseGame(game, engine)
    expect(engine.seen).toHaveLength(4)
    expect(engine.seen).not.toContain(game.moves[3].fenAfter)
    expect(analysis.positions[4]).toEqual({
      fen: game.moves[3].fenAfter,
      eval: { kind: 'mate', in: 0, winner: 'b' },
      pv: [],
      depth: 0,
      lines: [],
    })
  })

  it('exports the number of lines used for the Great check', () => {
    expect(GREAT_CHECK_MULTI_PV).toBe(2)
  })

  it('re-searches with MultiPV 2 right after a position whose best move was played', async () => {
    const game = foolsMate() // 1.f3 e5 2.g4 Qh4#
    const engine = new FakeEngine()
    engine.best.set(game.moves[0].fenAfter, 'e7e5') // Black then plays e5
    engine.best.set(game.moves[2].fenAfter, 'd8h4') // and Qh4#
    const progress: [number, number][] = []
    const analysis = await analyseGame(game, engine, { onProgress: (done, total) => progress.push([done, total]) })

    expect(engine.options.map((o) => o.multiPv)).toEqual([1, 1, 2, 1, 1, 2])
    expect(engine.seen).toEqual([
      game.startFen,
      game.moves[0].fenAfter,
      game.moves[0].fenAfter,
      game.moves[1].fenAfter,
      game.moves[2].fenAfter,
      game.moves[2].fenAfter,
    ])
    expect(analysis.positions.map((p) => p.lines.length)).toEqual([1, 2, 1, 2, 0])
    // Black to move: the lines are flipped to White's POV.
    expect(analysis.positions[1].lines).toEqual([
      { move: 'e7e5', eval: { kind: 'cp', cp: -40 }, pv: ['e7e5'] },
      { move: 'h2h3', eval: { kind: 'cp', cp: -10 }, pv: ['h2h3'] },
    ])
    // eval / bestMove / pv come from the first search.
    expect(analysis.positions[1]).toMatchObject({ eval: { kind: 'cp', cp: -40 }, bestMove: 'e7e5', pv: ['e7e5'] })
    // One progress tick per position, re-searches included.
    expect(progress).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ])
  })

  it('does not re-search when the played best move was the only legal move (it is forced)', async () => {
    const parsed = parsePgn('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/6q1/7K w - - 0 1"]\n\n1. Kxg2 *')
    if (!parsed.ok) throw new Error(parsed.error)
    const game = parsed.games[0]
    const engine = new FakeEngine()
    engine.best.set(game.startFen, 'h1g2')
    const analysis = await analyseGame(game, engine)
    // Only the start position is searched (K v K after the move is a draw), once.
    expect(engine.options.map((o) => o.multiPv)).toEqual([1])
    expect(analysis.positions[0].lines).toHaveLength(1)
  })

  it('keeps one line where the played move was not the best move', async () => {
    const analysis = await analyseGame(foolsMate(), new FakeEngine())
    expect(analysis.positions[0].lines).toEqual([{ move: 'a2a3', eval: { kind: 'cp', cp: 40 }, pv: ['a2a3'] }])
  })

  it('stops and rejects when aborted during a re-search', async () => {
    const game = foolsMate()
    const engine = new FakeEngine()
    engine.best.set(game.moves[0].fenAfter, 'e7e5')
    const controller = new AbortController()
    engine.onAnalyse = (index) => {
      if (index === 2) controller.abort() // the MultiPV 2 search of position 1
    }
    const err = await analyseGame(game, engine, { signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
    expect(engine.options[2].multiPv).toBe(2)
    expect(engine.seen).toHaveLength(3)
  })

  it('stops and rejects when aborted', async () => {
    const engine = new FakeEngine()
    const controller = new AbortController()
    engine.onAnalyse = (index) => {
      if (index === 2) controller.abort()
    }
    const err = await analyseGame(foolsMate(), engine, { signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
    expect(engine.seen).toHaveLength(3)
  })

  it('analyses a game with no moves as one position', async () => {
    const game: ImportedGame = { ...foolsMate(), moves: [] }
    const analysis = await analyseGame(game, new FakeEngine())
    expect(analysis.positions).toHaveLength(1)
  })
})
