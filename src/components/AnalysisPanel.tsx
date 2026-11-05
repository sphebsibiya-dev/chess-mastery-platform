import { uciToSan } from '../chess/uci'
import type { ImportedGame } from '../import/types'
import type { KeyMoment } from '../review/keyMoments'
import { CLASS_INFO, formatEval, showsBestMove } from './analysisView'
import ClassificationBadge from './ClassificationBadge'
import KeyMoments, { type TimeTroubleEntry } from './KeyMoments'
import type { GameAnalysisHandle } from './useGameAnalysis'

interface AnalysisPanelProps {
  analysis: GameAnalysisHandle
  game: ImportedGame
  ply: number
  /** Undefined until analysis is done. */
  moments: readonly KeyMoment[] | undefined
  /** First time-trouble move per side (empty without clocks). */
  trouble: readonly TimeTroubleEntry[]
  /** 'Clock 0:12 · took 1s' for the current move, when the game has clocks. */
  clockText: string | undefined
  onSelectPly: (ply: number) => void
}

const fmtAccuracy = (a: number | undefined) => (a === undefined ? '–' : a.toFixed(1))

export default function AnalysisPanel({
  analysis,
  game,
  ply,
  moments,
  trouble,
  clockText,
  onSelectPly,
}: AnalysisPanelProps) {
  const { state, positions, retry } = analysis
  const position = positions[ply]
  const bestSan = position?.bestMove ? uciToSan(position.fen, position.bestMove) : undefined
  const move = ply > 0 ? game.moves[ply - 1] : undefined
  const review = state.status === 'done' && ply > 0 ? state.reviews[ply - 1] : undefined

  return (
    <section className="analysis-panel" aria-label="Engine analysis">
      {state.status === 'loading' && (
        <div className="analysis-progress">
          <progress aria-label="Starting engine" />
          <span className="muted">Starting engine…</span>
        </div>
      )}
      {state.status === 'running' && (
        <div className="analysis-progress">
          <progress value={state.done} max={state.total} aria-label="Analysis progress" />
          <span className="muted">
            Analysing {state.done}/{state.total}
          </span>
        </div>
      )}
      {state.status === 'error' && (
        <div className="analysis-error" role="alert">
          <p className="error">{state.message}</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {state.status === 'done' && (
        <p className="analysis-accuracy" role="status">
          Accuracy: White <strong>{fmtAccuracy(state.accuracy.w)}</strong> · Black{' '}
          <strong>{fmtAccuracy(state.accuracy.b)}</strong>
        </p>
      )}

      <p className="analysis-line">
        <span className="analysis-eval">{position ? formatEval(position.eval) : '…'}</span>
        {bestSan && (
          <span>
            Best: <strong>{bestSan}</strong>
          </span>
        )}
        {position?.eval.kind === 'mate' && position.eval.in === 0 && <span>Checkmate</span>}
      </p>

      {review && move && (
        <p className="analysis-review">
          <ClassificationBadge cls={review.cls} />
          <span>
            {move.moveNumber}
            {move.color === 'w' ? '.' : '...'} {move.san} is {CLASS_INFO[review.cls].phrase}
            {showsBestMove(review.cls) && review.bestMoveSan
              ? `, best was ${review.bestMoveSan}`
              : ''}
          </span>
        </p>
      )}

      {clockText && <p className="analysis-clock muted">{clockText}</p>}

      {state.status !== 'error' && game.moves.length > 0 && (
        <KeyMoments moments={moments} trouble={trouble} moves={game.moves} ply={ply} onSelectPly={onSelectPly} />
      )}
    </section>
  )
}
