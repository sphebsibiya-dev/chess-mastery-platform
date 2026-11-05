import type { ImportedGame } from '../import/types'
import { sideToMove, terminalEval, toWhitePov, type Color } from './evaluate'
import { abortError } from './abort'
import type { AnalysisLine, Engine, EngineLine, GameAnalysis, PositionAnalysis } from './types'

export const DEFAULT_DEPTH = 14
/**
 * Lines searched when the played move was the engine's best move. Only then can
 * the "Great" (only good move) rule apply, and it needs line 2 to measure the gap.
 * Every other position gets a single line, which keeps a full review about as
 * fast as before (MultiPV 2 everywhere was about 3x slower).
 */
export const GREAT_CHECK_MULTI_PV = 2

export interface AnalyseGameOptions {
  depth?: number
  signal?: AbortSignal
  /**
   * Called after each position with the count done, the total (N + 1) and the
   * positions so far. A position counts as done once any re-search for line 2 is done too.
   */
  onProgress?: (done: number, total: number, positions: PositionAnalysis[]) => void
}

/** The start position followed by the position after every move. */
export function gamePositions(game: ImportedGame): string[] {
  return [game.startFen, ...game.moves.map((m) => m.fenAfter)]
}

const toLines = (lines: EngineLine[], stm: Color): AnalysisLine[] =>
  lines.map((line) => ({ move: line.move, eval: toWhitePov(line.score, stm), pv: line.pv }))

/**
 * Evaluates every position of a game (N moves give N + 1 positions), one at a
 * time, with one engine line. Positions that are already checkmate or a draw are
 * scored with chess.js and never sent to the engine. Every eval is returned from
 * White's POV.
 *
 * When the move actually played from a position is the engine's best move, that
 * position is searched again right away with `GREAT_CHECK_MULTI_PV` lines at the
 * same depth (the hash from the first search makes this cheaper) and its `lines`
 * are replaced by the result. `eval`, `bestMove`, `pv` and `depth` always come
 * from the first search, so classification by loss is unaffected.
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

  for (const [i, fen] of fens.entries()) {
    if (signal?.aborted) throw abortError()
    const terminal = terminalEval(fen)
    if (terminal) {
      positions.push({ fen, eval: terminal, pv: [], depth: 0, lines: [] })
    } else {
      const result = await engine.analyse(fen, { depth, multiPv: 1, signal })
      const stm = sideToMove(fen)
      let lines = toLines(result.lines, stm)
      const played = game.moves[i]?.lan
      if (played !== undefined && played === result.bestMove) {
        const multi = await engine.analyse(fen, { depth, multiPv: GREAT_CHECK_MULTI_PV, signal })
        lines = toLines(multi.lines, stm)
      }
      positions.push({
        fen,
        eval: toWhitePov(result.score, stm),
        bestMove: result.bestMove,
        pv: result.pv,
        depth: result.depth,
        lines,
      })
    }
    onProgress?.(positions.length, fens.length, positions.slice())
  }

  return { gameId: game.id, depth, positions }
}
