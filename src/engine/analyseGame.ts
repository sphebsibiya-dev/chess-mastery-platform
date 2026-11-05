import type { ImportedGame } from '../import/types'
import { sideToMove, terminalEval, toWhitePov } from './evaluate'
import { abortError } from './abort'
import type { Engine, GameAnalysis, PositionAnalysis } from './types'

export const DEFAULT_DEPTH = 14
/** Lines per position: the top two feed the "Great" (only good move) rule. */
export const DEFAULT_MULTI_PV = 2

export interface AnalyseGameOptions {
  depth?: number
  multiPv?: number
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
  { depth = DEFAULT_DEPTH, multiPv = DEFAULT_MULTI_PV, signal, onProgress }: AnalyseGameOptions = {},
): Promise<GameAnalysis> {
  const fens = gamePositions(game)
  const positions: PositionAnalysis[] = []

  if (signal?.aborted) throw abortError()
  await engine.newGame?.()

  for (const fen of fens) {
    if (signal?.aborted) throw abortError()
    const terminal = terminalEval(fen)
    if (terminal) {
      positions.push({ fen, eval: terminal, pv: [], depth: 0, lines: [] })
    } else {
      const result = await engine.analyse(fen, { depth, multiPv, signal })
      const stm = sideToMove(fen)
      positions.push({
        fen,
        eval: toWhitePov(result.score, stm),
        bestMove: result.bestMove,
        pv: result.pv,
        depth: result.depth,
        lines: result.lines.map((line) => ({ move: line.move, eval: toWhitePov(line.score, stm), pv: line.pv })),
      })
    }
    onProgress?.(positions.length, fens.length, positions.slice())
  }

  return { gameId: game.id, depth, positions }
}
