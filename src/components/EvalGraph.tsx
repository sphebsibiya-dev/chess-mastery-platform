import type { PointerEvent } from 'react'
import type { KeyMoment } from '../review/keyMoments'
import { MOMENT_KIND_LABELS, momentKindsText } from './analysisView'
import { GRAPH_SIZE, graphLinePath, graphPath, plyFromX, plyX, wpY } from './evalGraphGeometry'

interface EvalGraphProps {
  /** White win% per analysed position (may be shorter than the game while analysing). */
  whiteWp: readonly number[]
  totalPlies: number
  ply: number
  moments: readonly KeyMoment[]
  onSelectPly: (ply: number) => void
  /** Screen-reader text for the current ply, e.g. '21. Qxb2, -3.40'. */
  valueText: string
  /** True while the engine is still working; the line covers what is ready. */
  pending: boolean
}

/**
 * White's win% over the game. Click, tap or drag sideways to jump to a move.
 * Arrow keys/Home/End are handled by the viewer's window key handler, so the
 * slider has no key handler of its own (it would step twice).
 */
export default function EvalGraph({
  whiteWp,
  totalPlies,
  ply,
  moments,
  onSelectPly,
  valueText,
  pending,
}: EvalGraphProps) {
  const select = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onSelectPly(plyFromX(event.clientX - rect.left, rect.width, totalPlies))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    select(event)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) select(event)
  }

  const area = graphPath(whiteWp, totalPlies)
  const line = graphLinePath(whiteWp, totalPlies)
  const markerX = plyX(ply, totalPlies)

  return (
    <div className="eval-graph-wrap">
      <div
        className="eval-graph"
        role="slider"
        tabIndex={0}
        aria-label="Evaluation graph"
        aria-valuemin={0}
        aria-valuemax={totalPlies}
        aria-valuenow={ply}
        aria-valuetext={valueText}
        aria-busy={pending || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <svg viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`} preserveAspectRatio="none" aria-hidden="true">
          {area && <path className="eval-graph-area" d={area} />}
          <line className="eval-graph-mid" x1={0} y1={50} x2={GRAPH_SIZE} y2={50} vectorEffect="non-scaling-stroke" />
          {line && <path className="eval-graph-line" d={line} vectorEffect="non-scaling-stroke" />}
          <line
            className="eval-graph-marker"
            x1={markerX}
            y1={0}
            x2={markerX}
            y2={GRAPH_SIZE}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Dots are HTML so they stay round while the SVG stretches. */}
        {moments.map((m) => (
          <span
            key={m.ply}
            className={`eval-graph-dot dot-${m.kinds[0]}`}
            style={{ left: `${plyX(m.ply, totalPlies)}%`, top: `${wpY(m.whiteWpAfter)}%` }}
            title={momentKindsText(m.kinds)}
            aria-hidden="true"
          />
        ))}
        {pending && whiteWp.length < 2 && <span className="eval-graph-pending muted">Analysing…</span>}
      </div>
      {moments.length > 0 && (
        <p className="eval-graph-legend muted" aria-hidden="true">
          {(['blunder', 'missed-tactic', 'turning-point'] as const)
            .filter((k) => moments.some((m) => m.kinds[0] === k))
            .map((k) => (
              <span key={k}>
                <span className={`eval-graph-dot legend dot-${k}`} /> {MOMENT_KIND_LABELS[k]}
              </span>
            ))}
        </p>
      )}
    </div>
  )
}
