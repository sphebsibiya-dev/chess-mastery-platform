import { useCallback, useEffect, useRef } from 'react'
import { createStockfishWorker, StockfishEngine } from '../engine/stockfish'
import type { EngineResult } from '../engine/types'

/** Engine depth for Retry evaluation: shallow enough to respond quickly. */
export const RETRY_DEPTH = 12

export interface ReviewEngineOptions {
  depth?: number
  multiPv?: number
}

export interface ReviewEngineHandle {
  /**
   * Evaluate a FEN with Stockfish. The engine is created lazily on the first
   * call and reused afterwards. The returned result is side-to-move POV (same as
   * StockfishEngine.analyse).
   */
  evaluate(fen: string, opts?: ReviewEngineOptions): Promise<EngineResult>
}

/**
 * Lazy Stockfish engine for one-off evaluations (Retry mode).
 *
 * This hook creates a **separate** engine instance from the one useGameAnalysis
 * uses. useGameAnalysis terminates its worker when analysis completes, so this
 * hook keeps its own engine alive until the component unmounts.
 */
export function useReviewEngine(): ReviewEngineHandle {
  const engineRef = useRef<StockfishEngine | null>(null)

  // Terminate the engine when the component that holds the hook unmounts.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate()
      engineRef.current = null
    }
  }, [])

  const evaluate = useCallback(
    async (fen: string, opts: ReviewEngineOptions = {}): Promise<EngineResult> => {
      // Create lazily on first use.
      if (!engineRef.current) {
        engineRef.current = new StockfishEngine(createStockfishWorker())
      }
      const engine = engineRef.current
      await engine.ready()
      return engine.analyse(fen, {
        depth: opts.depth ?? RETRY_DEPTH,
        multiPv: opts.multiPv ?? 1,
      })
    },
    [],
  )

  return { evaluate }
}
