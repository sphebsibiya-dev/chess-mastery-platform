import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'
import { summarizeReview } from '../review/summary'
import AnalysisPanel from './AnalysisPanel'
import ReviewCoach, { type ReviewCoachArrow } from './ReviewCoach'
import ReviewSummary from './ReviewSummary'
import { activeTab, tabForKey, type ReviewTab, type ReviewTabKey } from './reviewTabs'

type ReviewSidePanelProps = ComponentProps<typeof AnalysisPanel> & {
  /** White's win% for every position analysed so far. */
  whiteWp: readonly number[]
  /**
   * Ask the board to show a preview FEN (Show best / Show follow-up / Retry).
   * The optional arrows are drawn on `fen`'s position key once the preview
   * settles; pass null to clear the preview.
   */
  onPreviewFen(fen: string | null, arrows?: ReviewCoachArrow[]): void
  /** Ask the board to enter Retry mode. */
  onRetry(): void
  /** True while the board is in Retry mode (dragging enabled). */
  retryActive: boolean
  /** Feedback message after a Retry attempt, or null for none. */
  retryMessage: string | null
}

/**
 * Summary | Review tabs under the board.
 * Summary is the default once analysis is done; until then only Review
 * (progress, errors, guided coach) is available.
 */
export default function ReviewSidePanel({
  whiteWp,
  onPreviewFen,
  onRetry,
  retryActive,
  retryMessage,
  ...panelProps
}: ReviewSidePanelProps) {
  const { analysis, game, ply, onSelectPly } = panelProps
  const { state } = analysis
  const [chosen, setChosen] = useState<ReviewTab | null>(null)
  const tab = activeTab(state.status, chosen)
  const id = useId()

  const reviews = state.status === 'done' ? state.reviews : undefined
  const report = useMemo(
    () => (reviews ? summarizeReview(game, reviews, whiteWp) : undefined),
    [game, reviews, whiteWp],
  )

  const startReview = () => {
    onSelectPly(1)
    setChosen('analysis')
  }

  // The 'analysis' tab is now labelled 'Review' in the UI.
  const tabs: { key: ReviewTab; label: string; disabled: boolean }[] = [
    { key: 'summary', label: 'Summary', disabled: state.status !== 'done' },
    { key: 'analysis', label: 'Review', disabled: false },
  ]

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ReviewTab) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const target = tabForKey(current, event.key as ReviewTabKey, state.status === 'done')
    setChosen(state.status === 'done' ? target : null)
    document.getElementById(`${id}-tab-${target}`)?.focus()
  }

  // Current move and its review (for the coach card).
  const currentMove = ply > 0 ? game.moves[ply - 1] : undefined
  const currentReview = reviews?.[ply - 1]
  const positions = analysis.positions
  const posBefore = positions[ply - 1]
  const posAfter = positions[ply]
  const opening = state.status === 'done' ? state.opening : undefined

  const showCoach =
    tab === 'analysis' &&
    state.status === 'done' &&
    ply > 0 &&
    currentMove !== undefined &&
    currentReview !== undefined &&
    posBefore !== undefined &&
    posAfter !== undefined

  // FIX #2: When the coach transitions from visible to hidden (tab switch to
  // Summary, ply → 0, or analysis reset), clear all guided-review board state so
  // the board does not stay at a stale preview FEN and dragging is disabled.
  const prevShowCoachRef = useRef(showCoach)
  useEffect(() => {
    const wasShown = prevShowCoachRef.current
    prevShowCoachRef.current = showCoach
    if (wasShown && !showCoach) {
      onPreviewFen(null)
    }
  }, [showCoach, onPreviewFen])

  return (
    <div className="review-side">
      <div className="review-tabs" role="tablist" aria-label="Review">
        {tabs.map(({ key, label, disabled }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-tab-${key}`}
            aria-controls={`${id}-panel`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            disabled={disabled}
            onClick={() => setChosen(state.status === 'done' ? key : null)}
            onKeyDown={(event) => onTabKeyDown(event, key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'summary' && state.status === 'done' && report ? (
          <ReviewSummary
            game={game}
            accuracy={state.accuracy}
            opening={state.opening}
            report={report}
            onSelectPly={onSelectPly}
            onStartReview={startReview}
          />
        ) : (
          <>
            <AnalysisPanel {...panelProps} />
            {showCoach && (
              <ReviewCoach
                key={ply}
                review={currentReview}
                move={currentMove}
                posBefore={posBefore}
                posAfter={posAfter}
                opening={opening}
                retryActive={retryActive}
                retryMessage={retryMessage}
                onPreviewFen={onPreviewFen}
                onRetry={onRetry}
                onSelectPly={onSelectPly}
                ply={ply}
                total={game.moves.length}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
