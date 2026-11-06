import { useCallback, useEffect, useMemo, useReducer, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import type { ImportedGame } from '../import/types'
import { findKeyMoments } from '../review/keyMoments'
import { moveTimes } from '../review/timeTrouble'
import { winPercent } from '../review/winProbability'
import { engineArrows, graphValueText, moveClockText, timeBadges } from './analysisView'
import { classIconFor } from './boardClassIcon'
import { mergeArrows, mergeSquareStyles } from './drawing'
import DrawToolbar from './DrawToolbar'
import EvalBar from './EvalBar'
import EvalGraph from './EvalGraph'
import type { TimeTroubleEntry } from './KeyMoments'
import MoveList from './MoveList'
import NavControls from './NavControls'
import { navActionForKey, navReducer, type NavAction } from './navigation'
import ReviewSidePanel from './ReviewSidePanel'
import { useBoardDrawing } from './useBoardDrawing'
import { useClassIconRenderer } from './useClassIconRenderer'
import { useGameAnalysis } from './useGameAnalysis'

interface GameViewerProps {
  game: ImportedGame
}

const HIGHLIGHT: CSSProperties = { backgroundColor: 'rgba(255, 214, 10, 0.45)' }

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function player(name: string | undefined, elo: number | undefined): string {
  const who = name ?? '?'
  return elo !== undefined ? `${who} (${elo})` : who
}

export default function GameViewer({ game }: GameViewerProps) {
  // The parent keys this component by game id, so state starts fresh per game.
  const [nav, dispatch] = useReducer(navReducer, { ply: 0, total: game.moves.length })
  const navigate = useCallback((action: NavAction) => dispatch(action), [])
  const analysis = useGameAnalysis(game)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isEditable(event.target)) return
      // The eval graph is a slider with no key handler of its own; this single
      // handler gives it slider semantics (Up/Down step) so nothing double-steps.
      const onSlider = event.target instanceof HTMLElement && event.target.getAttribute('role') === 'slider'
      const action = navActionForKey(event.key, onSlider)
      if (!action) return
      event.preventDefault()
      dispatch(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const { ply } = nav
  // Engine best-move arrow; the user's drawings are merged on top of it below.
  const bestArrows = useMemo(() => engineArrows(analysis.positions, ply), [analysis.positions, ply])
  const reviews = analysis.state.status === 'done' ? analysis.state.reviews : undefined
  const classes = reviews?.map((r) => r.cls)
  const whiteWp = useMemo(() => analysis.positions.map((p) => winPercent(p.eval)), [analysis.positions])
  const moments = useMemo(
    () => (reviews ? findKeyMoments(game.moves, reviews, whiteWp) : undefined),
    [game.moves, reviews, whiteWp],
  )
  // Clocks are known as soon as the game opens; too-fast flags need the reviews.
  const times = useMemo(() => moveTimes(game, reviews), [game, reviews])
  const timeFlags = useMemo(
    () => (times.hasClocks ? timeBadges(times, game.moves) : undefined),
    [times, game.moves],
  )
  const trouble = useMemo(() => {
    const entries: TimeTroubleEntry[] = []
    for (const start of [times.troubleStart.w, times.troubleStart.b]) {
      const clock = start !== undefined ? times.moves[start - 1]?.clockSeconds : undefined
      if (start !== undefined && clock !== undefined) entries.push({ ply: start, clockSeconds: clock })
    }
    return entries
  }, [times])
  const selectPly = useCallback((p: number) => dispatch({ type: 'goto', ply: p }), [])
  const current = ply > 0 ? game.moves[ply - 1] : undefined
  const position = current ? current.fenAfter : game.startFen
  const squareStyles: Record<string, CSSProperties> = current
    ? { [current.from]: HIGHLIGHT, [current.to]: HIGHLIGHT }
    : {}
  const drawing = useBoardDrawing(position)
  const boardSquareStyles = mergeSquareStyles(squareStyles, drawing.squareStyles)
  const icon = classIconFor(current, classes?.[ply - 1])
  const squareRenderer = useClassIconRenderer(icon, boardSquareStyles)

  const { headers } = game
  const status = current
    ? `${current.moveNumber}${current.color === 'w' ? '.' : '...'} ${current.san}`
    : 'Start position'

  return (
    <section className="viewer" aria-label="Game viewer">
      <div className="viewer-board">
        <div className="players">
          <span>
            {player(headers.white, headers.whiteElo)} vs {player(headers.black, headers.blackElo)}
          </span>
          <span className="result">{headers.result ?? '*'}</span>
        </div>
        <div className="board-row">
          {analysis.state.status !== 'error' && <EvalBar evaluation={analysis.positions[ply]?.eval} />}
          <div className="board-wrap">
            <Chessboard
              options={{
                id: 'viewer-board',
                position,
                allowDragging: false,
                squareStyles: boardSquareStyles,
                squareRenderer,
                arrows: mergeArrows(bestArrows, drawing.arrows),
                ...drawing.boardOptions,
                animationDurationInMs: 150,
              }}
            />
          </div>
        </div>
        <div className="viewer-status" aria-live="polite">
          {status}
        </div>
        <NavControls ply={ply} total={nav.total} onNavigate={navigate} />
        <DrawToolbar
          drawMode={drawing.drawMode}
          onDrawModeChange={drawing.setDrawMode}
          drawColor={drawing.drawColor}
          onDrawColorChange={drawing.setDrawColor}
          canClear={drawing.hasDrawings}
          onClear={drawing.clear}
        />
        {game.moves.length > 0 && analysis.state.status !== 'error' && (
          <EvalGraph
            whiteWp={whiteWp}
            totalPlies={game.moves.length}
            ply={ply}
            moments={moments ?? []}
            onSelectPly={selectPly}
            valueText={graphValueText(current, analysis.positions[ply]?.eval)}
            pending={analysis.state.status !== 'done'}
          />
        )}
        <ReviewSidePanel
          analysis={analysis}
          whiteWp={whiteWp}
          game={game}
          ply={ply}
          moments={moments}
          trouble={trouble}
          clockText={times.hasClocks ? moveClockText(times.moves[ply - 1]) : undefined}
          onSelectPly={selectPly}
        />
        {/* Below the controls so a long comment never moves the buttons. */}
        <p className="move-comment" aria-live="polite">
          {current?.comment ?? ''}
        </p>
      </div>
      <div className="viewer-moves">
        {game.moves.length > 0 ? (
          <MoveList
            moves={game.moves}
            ply={ply}
            onSelect={selectPly}
            classes={classes}
            timeFlags={timeFlags}
          />
        ) : (
          <p className="muted">No moves.</p>
        )}
        {(headers.event || headers.date) && (
          <p className="muted game-meta">{[headers.event, headers.date].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    </section>
  )
}
