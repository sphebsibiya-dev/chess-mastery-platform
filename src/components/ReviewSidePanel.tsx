import { useId, useMemo, useState, type ComponentProps } from 'react'
import { summarizeReview } from '../review/summary'
import AnalysisPanel from './AnalysisPanel'
import ReviewSummary from './ReviewSummary'
import { activeTab, type ReviewTab } from './reviewTabs'

type ReviewSidePanelProps = ComponentProps<typeof AnalysisPanel> & {
  /** White's win% for every position analysed so far. */
  whiteWp: readonly number[]
}

/**
 * Summary | Analysis tabs under the board. Summary is the default once the
 * analysis is done; until then only Analysis (progress, errors) is available.
 */
export default function ReviewSidePanel({ whiteWp, ...panelProps }: ReviewSidePanelProps) {
  const { analysis, game, onSelectPly } = panelProps
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

  const tabs: { key: ReviewTab; label: string; disabled: boolean }[] = [
    { key: 'summary', label: 'Summary', disabled: state.status !== 'done' },
    { key: 'analysis', label: 'Analysis', disabled: false },
  ]

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
            disabled={disabled}
            // Before completion Analysis is the only available view, not a
            // preference that should suppress the automatic Summary switch.
            onClick={() => setChosen(state.status === 'done' ? key : null)}
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
          <AnalysisPanel {...panelProps} />
        )}
      </div>
    </div>
  )
}
