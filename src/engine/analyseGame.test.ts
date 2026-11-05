import { describe, expect, it } from 'vitest'
import { TWO_GAMES } from '../import/fixtures'
import { parsePgn } from '../import/pgn'
import type { ImportedGame } from '../import/types'
import { isAbortError } from './abort'
import { analyseGame } from './analyseGame'
import type { AnalyseOptions, Engine, EngineResult } from './types'

function foolsMate(): ImportedGame {
  const result = parsePgn(TWO_GAMES)
  if (!result.ok) throw new Error(result.error)
  return result.games[1]
}

/** Returns +40 cp for the side to move in every position. */
class FakeEngine implements Engine {
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
    return {
      score: { type: 'cp', value: 40 },
      bestMove: 'a2a3',
      pv: ['a2a3'],
      depth: 14,
      lines: [
        { move: 'a2a3', score: { type: 'cp', value: 40 }, pv: ['a2a3'] },
        { move: 'h2h3', score: { type: 'cp', value: 10 }, pv: ['h2h3'] },
      ],
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

  it('asks for two lines by default and stores them in White POV', async () => {
    const engine = new FakeEngine()
    const analysis = await analyseGame(foolsMate(), engine)
    expect(engine.options.every((o) => o.multiPv === 2)).toBe(true)
    // Start position: White to move, kept as is.
    expect(analysis.positions[0].lines).toEqual([
      { move: 'a2a3', eval: { kind: 'cp', cp: 40 }, pv: ['a2a3'] },
      { move: 'h2h3', eval: { kind: 'cp', cp: 10 }, pv: ['h2h3'] },
    ])
    // After 1.f3: Black to move, so +40 for the mover is -40 for White.
    expect(analysis.positions[1].lines.map((l) => l.eval)).toEqual([
      { kind: 'cp', cp: -40 },
      { kind: 'cp', cp: -10 },
    ])
  })

  it('passes a custom multiPv through', async () => {
    const engine = new FakeEngine()
    await analyseGame(foolsMate(), engine, { multiPv: 1 })
    expect(engine.options.every((o) => o.multiPv === 1)).toBe(true)
  })

  it("flips Black-to-move scores to White's POV", async () => {
    const analysis = await analyseGame(foolsMate(), new FakeEngine())
    const cps = analysis.positions.slice(0, 4).map((p) => (p.eval.kind === 'cp' ? p.eval.cp : NaN))
    // Start (White to move), after f3 (Black), after e5 (White), after g4 (Black).
    expect(cps).toEqual([40, -40, 40, -40])
    expect(analysis.positions[0].bestMove).toBe('a2a3')
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
