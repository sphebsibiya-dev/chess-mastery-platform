import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { toWhitePov } from '../engine/evaluate'
import type { ImportedGame } from '../import/types'
import { acceptsRetry } from '../review/explain'
import { findKeyMoments } from '../review/keyMoments'
import { moveTimes } from '../review/timeTrouble'
import { moverWinPercent, winPercent } from '../review/winProbability'
import { engineArrows, graphValueText, moveClockText, timeBadges } from './analysisView'
import { classIconFor } from './boardClassIcon'
import type { ReviewCoachArrow } from './ReviewCoach'
import type { DrawColor } from './drawing'
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
import { useReviewEngine } from './useReviewEngine'

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
  const retryEngine = useReviewEngine()

  // --- Guided-review state ---
  /**
   * FEN to preview on the board (Show best / Show follow-up / Retry).
   * null = show the game's current position.
   * Never mutates game.moves; nav remains index-based.
   */
  const [previewFen, setPreviewFen] = useState<string | null>(null)
  /** True while Retry mode is active: the board is draggable from fenBefore. */
  const [retryActive, setRetryActive] = useState(false)
  /** Feedback shown after a Retry attempt. */
  const [retryMessage, setRetryMessage] = useState<string | null>(null)
  /**
   * Arrows to draw once the preview position has been applied to the board
   * (they are stored here to avoid a timing race with useBoardDrawing's reset).
   */
  const pendingArrowsRef = useRef<ReviewCoachArrow[] | null>(null)

  // Clear guided-review state whenever the ply changes.
  useEffect(() => {
    setPreviewFen(null)
    setRetryActive(false)
    setRetryMessage(null)
  }, [nav.ply])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isEditable(event.target)) return
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
  const reviews = analysis.state.status === 'done' ? analysis.state.reviews : undefined
  const classes = reviews?.map((r) => r.cls)
  const whiteWp = useMemo(() => analysis.positions.map((p) => winPercent(p.eval)), [analysis.positions])
  const moments = useMemo(
    () => (reviews ? findKeyMoments(game.moves, reviews, whiteWp) : undefined),
    [game.moves, reviews, whiteWp],
  )
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

  // Board position: show the preview FEN when active, otherwise the game position.
  const boardPosition = previewFen ?? position

  const squareStyles: Record<string, CSSProperties> = current
    ? { [current.from]: HIGHLIGHT, [current.to]: HIGHLIGHT }
    : {}

  // Pass boardPosition so drawings belong to the preview position when active.
  const drawing = useBoardDrawing(boardPosition)

  // Apply pending coach arrows after the board-drawing state has reset for the
  // new preview position (useEffect fires after the render that caused the reset).
  useEffect(() => {
    const arrows = pendingArrowsRef.current
    pendingArrowsRef.current = null
    if (previewFen && arrows?.length) {
      drawing.set(
        arrows.map((a) => ({ from: a.from, to: a.to, color: (a.color ?? 'green') as DrawColor })),
        {},
        previewFen,
      )
    }
  }, [previewFen, drawing])

  // Suppress the automatic engine arrow when a preview is active so it does not
  // show moves from a position that is no longer on the board.
  const bestArrows = useMemo(
    () => (previewFen === null ? engineArrows(analysis.positions, ply) : []),
    [previewFen, analysis.positions, ply],
  )

  const boardSquareStyles = mergeSquareStyles(squareStyles, drawing.squareStyles)
  const icon = classIconFor(current, classes?.[ply - 1])
  const squareRenderer = useClassIconRenderer(icon, boardSquareStyles)

  // --- Coach interaction callbacks ---

  const handlePreviewFen = useCallback(
    (fen: string | null, arrows?: ReviewCoachArrow[]) => {
      pendingArrowsRef.current = arrows ?? null
      setPreviewFen(fen)
      setRetryActive(false)
    },
    [],
  )

  const handleRetry = useCallback(() => {
    if (ply === 0) return
    const gMove = game.moves[ply - 1]
    if (!gMove) return
    pendingArrowsRef.current = null
    setPreviewFen(gMove.fenBefore)
    setRetryActive(true)
    setRetryMessage(null)
  }, [ply, game.moves])

  /**
   * Synchronous drop handler: accepts or rejects the dropped piece.
   * Async engine evaluation for non-trivial moves is started via an IIFE.
   * The function returns true immediately in both cases so the piece is not
   * snapped back; feedback comes via retryMessage once evaluation finishes.
   */
  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece?: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!retryActive || ply === 0 || targetSquare === null) return false
      const gMove = game.moves[ply - 1]
      if (!gMove) return false

      const chess = new Chess(gMove.fenBefore)
      let played: { lan: string } | undefined
      try {
        played = chess.move({ from: sourceSquare, to: targetSquare as string, promotion: 'q' })
      } catch {
        return false
      }

      const resultFen = chess.fen()
      const { lan } = played
      const posB = analysis.positions[ply - 1]
      if (!posB) return false

      // Show the result regardless; we decide acceptance asynchronously when needed.
      setPreviewFen(resultFen)

      // Immediate acceptance: best move or in the stored top lines.
      const isInLines = posB.bestMove === lan || posB.lines.some((l) => l.move === lan)
      if (isInLines) {
        setRetryActive(false)
        setRetryMessage(null)
        return true
      }

      // Async evaluation path.
      void (async () => {
        try {
          const stm = chess.turn() as 'w' | 'b'
          const result = await retryEngine.evaluate(resultFen)
          const evalAfter = toWhitePov(result.score, stm)
          const wpBefore = moverWinPercent(posB.eval, gMove.color)
          const wpAfterRetry = moverWinPercent(evalAfter, gMove.color)
          const loss = Math.max(0, wpBefore - wpAfterRetry)
          if (acceptsRetry(loss)) {
            setRetryActive(false)
            setRetryMessage(null)
          } else {
            setRetryActive(false)
            setRetryMessage('Not quite, try again.')
          }
        } catch {
          // Engine error – accept gracefully so the user is not stuck.
          setRetryActive(false)
        }
      })()

      return true
    },
    [retryActive, ply, game.moves, analysis.positions, retryEngine],
  )

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
                position: boardPosition,
                allowDragging: retryActive,
                onPieceDrop: retryActive ? handlePieceDrop : undefined,
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
          onPreviewFen={handlePreviewFen}
          onRetry={handleRetry}
          retryActive={retryActive}
          retryMessage={retryMessage}
        />
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
