import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { terminalEval, toWhitePov } from '../engine/evaluate'
import type { Eval } from '../engine/types'
import type { ImportedGame } from '../import/types'
import { acceptsRetry } from '../review/explain'
import { applyFreeMove } from '../review/freeMove'
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
import { playMoveSound, setSoundMuted } from '../sound/moveSound'

interface GameViewerProps {
  game: ImportedGame
}

/**
 * Returns the board orientation the game should start in.
 * Games imported from chess.com or Lichess default to the user's side;
 * pasted PGN (where `userColor` is undefined) defaults to white.
 */
export function initialOrientation(game: ImportedGame): 'white' | 'black' {
  return game.userColor === 'b' ? 'black' : 'white'
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
  const [muted, setMuted] = useState(() => {
    try { return window.localStorage.getItem('mogfish-sounds-muted') === 'true' } catch { return false }
  })

  useEffect(() => { setSoundMuted(muted) }, [muted])

  // Navigation is the single move-application path for step-through review.
  // Replaying the move from its FEN gives us chess.js flags and post-move check state.
  useEffect(() => {
    if (nav.ply === 0) return
    const imported = game.moves[nav.ply - 1]
    if (!imported) return
    const chess = new Chess(imported.fenBefore)
    try {
      const move = chess.move({ from: imported.from, to: imported.to, promotion: imported.promotion })
      playMoveSound(move, chess.inCheck())
    } catch { /* malformed imported games are already handled by the importer */ }
  }, [game.moves, nav.ply])

  const toggleMuted = useCallback(() => {
    setMuted((value) => {
      const next = !value
      setSoundMuted(next)
      try { window.localStorage.setItem('mogfish-sounds-muted', String(next)) } catch { /* storage is optional */ }
      return next
    })
  }, [])

  // Board orientation: auto-sets to the user's side for online games, white for pasted PGN.
  const [orientation, setOrientation] = useState<'white' | 'black'>(initialOrientation(game))
  const toggleOrientation = useCallback(
    () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
    [],
  )

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
   * Unscored free-move exploration state. Dragging the side-to-move piece is
   * always allowed (not gated behind Retry); the resulting position is held in
   * `previewFen`, its SAN shown in the status line, and a fresh on-demand eval
   * (White POV) stored in `freeEval` while `freeEvalPending` gates the EvalBar.
   */
  const [freeMoveSan, setFreeMoveSan] = useState<string | null>(null)
  const [freeEval, setFreeEval] = useState<Eval | null>(null)
  const [freeEvalPending, setFreeEvalPending] = useState(false)
  /**
   * Arrows to draw once the preview position has been applied to the board
   * (they are stored here to avoid a timing race with useBoardDrawing's reset).
   */
  const pendingArrowsRef = useRef<ReviewCoachArrow[] | null>(null)
  /**
   * Always holds the latest ply value so IIFE closures can read it after an
   * async gap without depending on a stale captured value.
   * Initialized to 0; updated synchronously after `ply` is derived below.
   */
  const plyRef = useRef(0)
  /**
   * Generation counter incremented whenever the guided-review context is fully
   * invalidated (ply change or explicit clear). An async Retry IIFE captures
   * the generation at drop-time and bails out if it has changed by the time the
   * engine responds, so a stale result never lands on the wrong move's card.
   */
  const retryGenRef = useRef(0)
  /**
   * Always holds the currently displayed board FEN (`previewFen ?? position`)
   * so the free-move drop handler can chain successive moves from whatever is on
   * the board without listing `boardPosition` (declared later) as a dependency.
   */
  const boardPositionRef = useRef(game.startFen)
  /**
   * Aborts the in-flight free-move engine search when it is superseded (a newer
   * drag) or abandoned (ply change / preview clear), so the serialised engine
   * queue does not run stale searches to full depth.
   */
  const freeEvalAbortRef = useRef<AbortController | null>(null)
  const abortFreeEval = useCallback(() => {
    freeEvalAbortRef.current?.abort()
    freeEvalAbortRef.current = null
  }, [])

  // Clear guided-review state whenever the ply changes; also bump the
  // generation so any in-flight eval resolves as a no-op.
  useEffect(() => {
    retryGenRef.current++
    abortFreeEval()
    setPreviewFen(null)
    setRetryActive(false)
    setRetryMessage(null)
    setFreeMoveSan(null)
    setFreeEval(null)
    setFreeEvalPending(false)
  }, [nav.ply, abortFreeEval])

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
  // Keep the ref in sync so IIFE closures always see the current ply.
  plyRef.current = ply

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
  // Keep the ref in sync so the free-move drop handler always reads the
  // position currently on the board (enabling chained free moves).
  boardPositionRef.current = boardPosition

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
      // A coach preview or explicit clear supersedes any in-flight free eval.
      abortFreeEval()
      if (fen === null) {
        // Explicit clear (e.g. tab switch): invalidate any in-flight eval.
        retryGenRef.current++
        pendingArrowsRef.current = null
        setPreviewFen(null)
        setRetryActive(false)
        setRetryMessage(null)
        setFreeMoveSan(null)
        setFreeEval(null)
        setFreeEvalPending(false)
      } else {
        pendingArrowsRef.current = arrows ?? null
        setPreviewFen(fen)
        setRetryActive(false)
        setFreeMoveSan(null)
        setFreeEval(null)
        setFreeEvalPending(false)
      }
    },
    [abortFreeEval],
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
   * Free-move drop handler, always active on every position.
   *
   * Any legal move for the side to move is accepted (unscored): the resulting
   * position is held transiently in `previewFen`, its SAN shown in the status
   * line, and a fresh on-demand Stockfish eval of the new FEN drives the EvalBar.
   * Illegal moves return false so react-chessboard snaps the piece back. The
   * game's recorded line is never mutated, so step-through stays intact.
   *
   * When a scored Coach "Retry" is active (`retryActive` at a real ply), the same
   * eval additionally feeds the Coach accept/reject message — that feature is an
   * additive layer on top of the always-available free move.
   */
  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece?: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (targetSquare === null) return false

      // Source = the position currently on the board, so free moves chain.
      const sourceFen = boardPositionRef.current
      const free = applyFreeMove(sourceFen, sourceSquare, targetSquare)
      if (!free) return false // illegal move: snap back

      // Recreate the accepted move with chess.js to get its flags and check state.
      const moveChess = new Chess(sourceFen)
      const played = moveChess.move({ from: sourceSquare, to: targetSquare })
      playMoveSound(played, moveChess.inCheck())

      // Scored Coach Retry only applies to the move actually under review, i.e.
      // the free move was played from the ply's "before" position.
      const scoredRetry = retryActive && ply > 0 && sourceFen === game.moves[ply - 1]?.fenBefore
      const posB = scoredRetry ? analysis.positions[ply - 1] : undefined
      const gMove = scoredRetry ? game.moves[ply - 1] : undefined

      // Scoring helper for a scored Retry: compare the mover's win% before and
      // after the attempt and accept small losses.
      const scoreRetry = (evalAfter: Eval) => {
        if (!posB || !gMove) return
        const wpBefore = moverWinPercent(posB.eval, gMove.color)
        const wpAfterRetry = moverWinPercent(evalAfter, gMove.color)
        const loss = Math.max(0, wpBefore - wpAfterRetry)
        setRetryMessage(acceptsRetry(loss) ? null : 'Not quite, try again.')
      }

      // A newer drop supersedes any in-flight free-move search.
      abortFreeEval()

      // Show the resulting position. Suppress the "Free move" label during a
      // scored Retry so the Coach accept/reject messaging reads cleanly.
      pendingArrowsRef.current = null
      setPreviewFen(free.fen)
      setFreeMoveSan(scoredRetry ? null : free.san)
      // Disable the scored Retry so a second drop cannot start another scored
      // eval; dragging itself stays available for further free exploration.
      setRetryActive(false)
      setRetryMessage(null)

      // Scored-retry fast path: a move that is the engine best or in the stored
      // top lines is accepted instantly from the stored eval (no engine call).
      if (scoredRetry && posB) {
        const lineEval = posB.lines.find((l) => l.move === free.lan)?.eval
        if (lineEval) {
          setFreeEval(lineEval)
          setFreeEvalPending(false)
          scoreRetry(lineEval)
          return true
        }
      }

      // Terminal position (checkmate / stalemate / dead draw): score without the
      // engine, which has no move to search and would otherwise error.
      const terminal = terminalEval(free.fen)
      if (terminal) {
        setFreeEval(terminal)
        setFreeEvalPending(false)
        if (scoredRetry) scoreRetry(terminal)
        return true
      }

      // Non-terminal move: fresh on-demand eval, abortable and generation-guarded.
      setFreeEval(null)
      setFreeEvalPending(true)
      const controller = new AbortController()
      freeEvalAbortRef.current = controller

      // Capture ply + generation so a stale async result is discarded if the
      // user navigates or clears the preview before the engine responds.
      const dropPly = plyRef.current
      const dropGen = ++retryGenRef.current

      void (async () => {
        try {
          const result = await retryEngine.evaluate(free.fen, { signal: controller.signal })
          if (plyRef.current !== dropPly || retryGenRef.current !== dropGen) return
          const evalAfter = toWhitePov(result.score, free.stm)
          setFreeEval(evalAfter)
          setFreeEvalPending(false)
          if (scoredRetry) scoreRetry(evalAfter)
        } catch {
          // Aborted or engine error: clear the pending state only if still current.
          if (plyRef.current === dropPly && retryGenRef.current === dropGen) {
            setFreeEvalPending(false)
          }
        } finally {
          if (freeEvalAbortRef.current === controller) freeEvalAbortRef.current = null
        }
      })()

      return true
    },
    [retryActive, ply, game.moves, analysis.positions, retryEngine, abortFreeEval],
  )

  const { headers } = game
  const status = current
    ? `${current.moveNumber}${current.color === 'w' ? '.' : '...'} ${current.san}`
    : 'Start position'

  // Eval shown beside the board. While exploring a free move, show its fresh
  // eval (or the EvalBar's pending state until it resolves); otherwise show the
  // recorded eval for the current ply.
  const recordedEval = analysis.positions[ply]?.eval
  const evalForBar = previewFen
    ? freeEvalPending
      ? undefined
      : freeEval ?? recordedEval
    : recordedEval

  return (
    <section className="viewer" aria-label="Game viewer">
      <div className="viewer-board">
        <div className="players">
          <span>
            {orientation === 'black'
              ? <>{player(headers.black, headers.blackElo)} vs {player(headers.white, headers.whiteElo)}</>
              : <>{player(headers.white, headers.whiteElo)} vs {player(headers.black, headers.blackElo)}</>}
          </span>
          <span className="result">{headers.result ?? '*'}</span>
        </div>
        <div className="board-row">
          {analysis.state.status !== 'error' && (
            <EvalBar evaluation={evalForBar} orientation={orientation} />
          )}
          <div className="board-wrap">
            <Chessboard
              options={{
                id: 'viewer-board',
                position: boardPosition,
                boardOrientation: orientation,
                allowDragging: true,
                onPieceDrop: handlePieceDrop,
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
          {freeMoveSan ? `Free move: ${freeMoveSan}` : status}
        </div>
        <NavControls ply={ply} total={nav.total} onNavigate={navigate} />
        <div className="board-flip-row">
          <button type="button" className="flip-board-btn" onClick={toggleOrientation} aria-label="Flip board">
            ⇅ Flip board
          </button>
          <button type="button" className="sound-toggle" onClick={toggleMuted} aria-pressed={muted}>
            {muted ? '🔇 Sound off' : '🔊 Sound on'}
          </button>
        </div>
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
      </div>
      <div className="viewer-side">
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
