import { useEffect, useMemo, useState } from 'react'
import { pvToLine } from '../chess/pvLine'
import { uciToSquares } from '../chess/uci'
import type { PositionAnalysis } from '../engine/types'
import type { ImportedMove } from '../import/types'
import { explainMove } from '../review/explain'
import type { Opening } from '../review/openings/book'
import type { MoveReview } from '../review/types'
import { CLASS_INFO, showsBestMove } from './analysisView'
import ClassificationBadge from './ClassificationBadge'

export interface ReviewCoachArrow {
  from: string
  to: string
  color?: string
}

export interface ReviewCoachProps {
  review: MoveReview
  move: ImportedMove
  /** Engine analysis of the position before the reviewed move. */
  posBefore: PositionAnalysis
  /** Engine analysis of the position after the reviewed move. */
  posAfter: PositionAnalysis
  /** Named opening, only set when the move is classified as book. */
  opening?: Opening
  /** Whether Retry mode is currently active (board is draggable). */
  retryActive: boolean
  /**
   * Feedback message shown after a Retry attempt:
   * null = no message, 'Not quite, try again.' = failed attempt.
   */
  retryMessage: string | null
  /**
   * Ask the parent to show a preview FEN. Pass null to clear the preview.
   * The optional `arrows` are drawn on `fen`'s position key; they are
   * applied after the preview state settles to avoid a timing race with the
   * board-drawing reset.
   */
  onPreviewFen(fen: string | null, arrows?: ReviewCoachArrow[]): void
  /** Ask the parent to enter Retry mode (board set to fenBefore, dragging on). */
  onRetry(): void
  onSelectPly(ply: number): void
  ply: number
  total: number
}

export default function ReviewCoach({
  review,
  move,
  posBefore,
  posAfter,
  opening,
  retryActive,
  retryMessage,
  onPreviewFen,
  onRetry,
  onSelectPly,
  ply,
  total,
}: ReviewCoachProps) {
  const explanation = useMemo(
    () => explainMove(review, { move, posBefore, posAfter, opening }),
    [review, move, posBefore, posAfter, opening],
  )

  // PV line from the position after the reviewed move (opponent's best continuation).
  const pvLine = useMemo(() => pvToLine(posAfter.fen, posAfter.pv), [posAfter.fen, posAfter.pv])

  // Which step of the follow-up PV we have shown so far.
  const [pvStep, setPvStep] = useState(0)

  // Reset pv step when the move changes (ply changes).
  useEffect(() => {
    setPvStep(0)
  }, [ply])

  const handleShowBest = () => {
    if (!posBefore.bestMove) return
    const squares = uciToSquares(posBefore.bestMove)
    if (!squares) return
    // Show fenBefore so the arrow makes visual sense on the board.
    onPreviewFen(move.fenBefore, [{ from: squares.from, to: squares.to }])
  }

  const handleShowFollowUp = () => {
    const step = pvStep
    if (step >= pvLine.length) return

    const pvMove = pvLine[step]
    const uciMove = posAfter.pv[step]
    const squares = uciToSquares(uciMove)

    onPreviewFen(pvMove.fen, squares ? [{ from: squares.from, to: squares.to }] : undefined)
    setPvStep(step + 1)
  }

  const { cls } = review
  const moveLabel = `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`
  const hasFollowUp = pvStep < pvLine.length

  return (
    <div className="review-coach">
      <div className="review-coach-header">
        <ClassificationBadge cls={cls} />
        <span className="review-coach-title">
          {moveLabel} is {CLASS_INFO[cls].label.toLowerCase()}
        </span>
      </div>
      <p className="review-coach-explain">{explanation}</p>

      <div className="review-coach-actions">
        {showsBestMove(cls) && posBefore.bestMove && (
          <button type="button" className="review-coach-btn" onClick={handleShowBest}>
            Show best
          </button>
        )}

        <button
          type="button"
          className="review-coach-btn"
          aria-pressed={retryActive}
          onClick={onRetry}
        >
          {retryActive ? 'Retrying…' : 'Retry'}
        </button>

        {hasFollowUp && (
          <button type="button" className="review-coach-btn" onClick={handleShowFollowUp}>
            {pvStep === 0 ? 'Show follow-up' : 'Next step'}
          </button>
        )}
      </div>

      {retryMessage && (
        <p className="review-coach-retry" role="alert">
          {retryMessage}
        </p>
      )}

      <div className="review-coach-nav">
        <button
          type="button"
          className="review-coach-btn"
          onClick={() => onSelectPly(ply - 1)}
          disabled={ply <= 1}
          aria-label="Previous move"
        >
          ◀ Previous
        </button>
        <button
          type="button"
          className="review-coach-btn"
          onClick={() => onSelectPly(ply + 1)}
          disabled={ply >= total}
          aria-label="Next move"
        >
          Next ▶
        </button>
      </div>
    </div>
  )
}
