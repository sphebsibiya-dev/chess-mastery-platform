import type { ImportedGame } from '../import/types'
import { sideToMove, terminalEval, toWhitePov } from './evaluate'
import { abortError } from './abort'
import type { Engine, GameAnalysis, PositionAnalysis } from './types'

export const DEFAULT_DEPTH = 14

export interface AnalyseGameOptions {
  depth?: number
  signal?: AbortSignal
  /** Called after each position with the count done, the total and the positions so far. */
  onProgress?: (done: number, total: number, positions: PositionAnalysis[]) => void
}

/** The start position followed by the position after every move. */
export function gamePositions(game: ImportedGame): string[] {
  return [game.startFen, ...game.moves.map((m) => m.fenAfter)]
}

/**
 * Evaluates every position of a game (N moves give N + 1 positions), one at a
 * time. Positions that are already checkmate or a draw are scored with chess.js
 * and never sent to the engine. Every eval is returned from White's POV.
 */
export async function analyseGame(
  game: ImportedGame,
  engine: Engine,
  { depth = DEFAULT_DEPTH, signal, onProgress }: AnalyseGameOptions = {},
): Promise<GameAnalysis> {
  const fens = gamePositions(game)
  const positions: PositionAnalysis[] = []

  if (signal?.aborted) throw abortError()
  await engine.newGame?.()

  for (const fen of fens) {
    if (signal?.aborted) throw abortError()
    const terminal = terminalEval(fen)
    if (terminal) {
      positions.push({ fen, eval: terminal, pv: [], depth: 0 })
    } else {
      const result = await engine.analyse(fen, { depth, signal })
      positions.push({
        fen,
        eval: toWhitePov(result.score, sideToMove(fen)),
        bestMove: result.bestMove,
        pv: result.pv,
        depth: result.depth,
      })
    }
    onProgress?.(positions.length, fens.length, positions.slice())
  }

  return { gameId: game.id, depth, positions }
}
