import { useCallback, useEffect, useState } from 'react'
import { isAbortError } from '../engine/abort'
import { analyseGame, DEFAULT_DEPTH } from '../engine/analyseGame'
import { createStockfishWorker, StockfishEngine } from '../engine/stockfish'
import type { GameAnalysis, PositionAnalysis } from '../engine/types'
import type { ImportedGame } from '../import/types'
import { classifyGame } from '../review/classify'
import { loadOpeningBookOrNone, type Opening } from '../review/openings/book'
import type { MoveReview, SideAccuracy } from '../review/types'

export type AnalysisState =
  | { status: 'loading' }
  | { status: 'running'; done: number; total: number; partial: PositionAnalysis[] }
  | {
      status: 'done'
      analysis: GameAnalysis
      reviews: MoveReview[]
      accuracy: SideAccuracy
      /** The game's opening from the book, when it reached a named book position. */
      opening?: Opening
    }
  | { status: 'error'; message: string }

export interface GameAnalysisHandle {
  state: AnalysisState
  /** Positions analysed so far (all of them once done). */
  positions: PositionAnalysis[]
  retry: () => void
}

const NO_POSITIONS: PositionAnalysis[] = []

function errorMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `Analysis failed: ${detail}`
}

/**
 * Runs Stockfish over the whole game in a Web Worker. The worker is created when
 * the game opens and is aborted and terminated when the game changes or the
 * viewer unmounts.
 */
export function useGameAnalysis(game: ImportedGame, depth = DEFAULT_DEPTH): GameAnalysisHandle {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<AnalysisState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setState({ status: 'loading' })

    let engine: StockfishEngine
    try {
      engine = new StockfishEngine(createStockfishWorker())
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) })
      return
    }

    const total = game.moves.length + 1
    // The opening book is a lazy chunk; load it while the engine works. If it
    // fails, the review simply has no book moves (and a console warning).
    const bookPromise = loadOpeningBookOrNone()
    engine
      .ready()
      .then(() => {
        if (signal.aborted) return undefined
        setState({ status: 'running', done: 0, total, partial: [] })
        return analyseGame(game, engine, {
          depth,
          signal,
          onProgress: (done, all, partial) => {
            if (!signal.aborted) setState({ status: 'running', done, total: all, partial })
          },
        })
      })
      .then(async (analysis) => {
        if (!analysis || signal.aborted) return
        const book = await bookPromise
        if (signal.aborted) return
        const { reviews, accuracy, opening } = classifyGame(game, analysis, { book })
        setState({ status: 'done', analysis, reviews, accuracy, opening })
      })
      .catch((err: unknown) => {
        if (signal.aborted || isAbortError(err)) return
        setState({ status: 'error', message: errorMessage(err) })
      })
      .finally(() => {
        // The engine is only needed for one run; free the worker once done.
        if (!signal.aborted) engine.terminate()
      })

    return () => {
      controller.abort()
      engine.terminate()
    }
  }, [game, depth, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const positions =
    state.status === 'done' ? state.analysis.positions : state.status === 'running' ? state.partial : NO_POSITIONS

  return { state, positions, retry }
}
