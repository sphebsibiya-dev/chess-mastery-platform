import type { ImportedGame } from '../import/types'
import type { Opening } from '../review/openings/book'
import { SUMMARY_CLASS_ORDER, type PhaseName, type ReviewReport } from '../review/summary'
import type { SideAccuracy } from '../review/types'
import { CLASS_INFO } from './analysisView'
import ClassificationBadge from './ClassificationBadge'
import { countButtonLabel } from './reviewTabs'

interface ReviewSummaryProps {
  game: ImportedGame
  accuracy: SideAccuracy
  opening: Opening | undefined
  report: ReviewReport
  onSelectPly: (ply: number) => void
  onStartReview: () => void
}

type Color = 'w' | 'b'
const COLORS: readonly Color[] = ['w', 'b']
const SIDE: Record<Color, string> = { w: 'White', b: 'Black' }
const PHASE_LABEL: Record<PhaseName, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }
const RATING_TOOLTIP = 'Estimated from this game’s accuracy only; not a real rating.'

const fmtAccuracy = (a: number | undefined) => (a === undefined ? '–' : a.toFixed(1))

export default function ReviewSummary({
  game,
  accuracy,
  opening,
  report,
  onSelectPly,
  onStartReview,
}: ReviewSummaryProps) {
  const { headers } = game
  const names: Record<Color, string | undefined> = { w: headers.white, b: headers.black }
  const elos: Record<Color, number | undefined> = { w: headers.whiteElo, b: headers.blackElo }

  return (
    <div className="review-summary">
      <ul className="summary-players">
        {COLORS.map((color) => {
          const rating = report.rating[color]
          return (
            <li key={color}>
              <span className="summary-player-name">
                <span className={`side-dot side-${color}`} aria-hidden="true" />
                {names[color] ?? SIDE[color]}
                {elos[color] !== undefined && <span className="muted"> ({elos[color]})</span>}
              </span>
              <span className="summary-player-stats">
                <span>
                  Accuracy <strong>{fmtAccuracy(accuracy[color])}</strong>
                </span>
                <span title={RATING_TOOLTIP}>
                  Est. rating{' '}
                  {rating !== undefined ? (
                    <>
                      <strong>~{rating}</strong> <span className="muted">(estimate)</span>
                    </>
                  ) : (
                    <>
                      <strong>–</strong> <span className="muted">(too few moves)</span>
                    </>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      {opening && (
        <p className="summary-opening">
          <span className="muted">{opening.eco}</span> {opening.name}
        </p>
      )}

      <table className="summary-table">
        <caption className="visually-hidden">Moves by class</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Class</span>
            </th>
            <th scope="col">White</th>
            <th scope="col">Black</th>
          </tr>
        </thead>
        <tbody>
          {SUMMARY_CLASS_ORDER.map((cls) => (
            <tr key={cls}>
              <th scope="row">
                <ClassificationBadge cls={cls} /> <span>{CLASS_INFO[cls].label}</span>
              </th>
              {COLORS.map((color) => {
                const { count, firstPly } = report.counts[cls][color]
                return (
                  <td key={color}>
                    {count > 0 && firstPly !== undefined ? (
                      <button
                        type="button"
                        className={`summary-count count-${cls}`}
                        aria-label={countButtonLabel(color, cls, count)}
                        title={countButtonLabel(color, cls, count)}
                        onClick={() => onSelectPly(firstPly)}
                      >
                        {count}
                      </button>
                    ) : (
                      <span className="summary-zero">0</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="summary-phases" aria-label="Game phases">
        {report.phases.map(({ phase, range, accuracy: phaseAcc, grade }) => (
          <li key={phase}>
            <span className="summary-phase-name">{PHASE_LABEL[phase]}</span>
            {range ? (
              COLORS.map((color) => {
                const g = grade[color]
                return (
                  <span key={color} className="summary-phase-side">
                    {SIDE[color]}{' '}
                    {g ? (
                      <>
                        <span className={`grade grade-${g}`}>{g}</span>{' '}
                        <span className="muted">({fmtAccuracy(phaseAcc[color])})</span>
                      </>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </span>
                )
              })
            ) : (
              <span className="muted">– not reached</span>
            )}
          </li>
        ))}
      </ul>

      <button type="button" className="primary summary-start" onClick={onStartReview} disabled={game.moves.length === 0}>
        Start review
      </button>
    </div>
  )
}
