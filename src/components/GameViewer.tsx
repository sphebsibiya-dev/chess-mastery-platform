import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import { terminalEval, toWhitePov } from '../engine/evaluate'
import type { Eval } from '../engine/types'
import type { ImportedGame } from '../import/types'
import { acceptsRetry } from '../review/explain'
import { applyFreeMove } from '../review/freeMove'
import { childId, nodeAt, rootParentId } from '../review/variationTree'
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
import { type NavAction } from './navigation'
import { initialTreeState, navActionForKey, treeNavReducer } from './treeNav'
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
  // `tree` holds the index-based main line (`nav`), a persistent variation-tree
  // overlay (`branches`), and a `cursor` that is either on the main line or a
  // branch node. On the main line every navigation is identical to before.
  const [tree, dispatch] = useReducer(treeNavReducer, game.moves.length, initialTreeState)
  const { nav, cursor, branches } = tree
  const navigate = useCallback((action: NavAction) => dispatch({ type: 'nav', action }), [])
  const analysis = useGameAnalysis(game)
  const retryEngine = useReviewEngine()
  const [muted, setMuted] = useState(() => {
    try { return window.localStorage.getItem('mogfish-sounds-muted') === 'true' } catch { return false }
  })

  useEffect(() => { setSoundMuted(muted) }, [muted])

  // Single move-sound driver. After #39 the main line advances inside the reducer
  // (there is no longer one drop-site meaning "a move was played"), so the sound
  // is derived from where the viewer now is: `main:<ply>` on the recorded line,
  // `branch:<path>` on a variation node, `start` at the opening position. The
  // token changes exactly once per move or navigation step — recorded-move
  // advance (nav.ply), branch creation/entry (cursor), and plain stepping — so
  // each plays exactly one sound and plain navigation never double-plays. The
  // move is replayed from its FEN to get chess.js flags + post-move check state.
  const soundToken =
    cursor.kind === 'branch'
      ? `branch:${cursor.departPly}:${cursor.path.join('/')}`
      : nav.ply > 0
        ? `main:${nav.ply}`
        : 'start'
  useEffect(() => {
    if (soundToken === 'start') return
    const node = cursor.kind === 'branch' ? nodeAt(branches, cursor.departPly, cursor.path) : undefined
    const src = node ?? (nav.ply > 0 ? game.moves[nav.ply - 1] : undefined)
    if (!src) return
    const promotion =
      'promotion' in src ? src.promotion : src.lan.length > 4 ? (src.lan[4] as 'q' | 'r' | 'b' | 'n') : undefined
    const chess = new Chess(src.fenBefore)
    try {
      const move = chess.move({ from: src.from, to: src.to, promotion })
      playMoveSound(move, chess.inCheck())
    } catch { /* malformed imported games are already handled by the importer */ }
    // Keyed on `soundToken` only: it already encodes every input that should
    // retrigger a sound, so unrelated re-renders (e.g. a branch eval resolving)
    // do not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundToken])

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
      dispatch({ type: 'nav', action })
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
  const selectPly = useCallback((p: number) => dispatch({ type: 'selectMain', ply: p }), [])
  const selectNode = useCallback(
    (departPly: number, path: string[]) => dispatch({ type: 'selectNode', departPly, path }),
    [],
  )
  const current = ply > 0 ? game.moves[ply - 1] : undefined
  const position = current ? current.fenAfter : game.startFen

  // Active variation node (when the cursor is on a branch), and the position it
  // puts on the board. A coach/retry preview (`previewFen`) still wins over both.
  const branchNode = cursor.kind === 'branch' ? nodeAt(branches, cursor.departPly, cursor.path) : undefined
  const treePosition = branchNode ? branchNode.fenAfter : position

  // Board position: coach preview wins, then the active branch node, then the
  // recorded main-line position.
  const boardPosition = previewFen ?? treePosition
  // Keep the ref in sync so the free-move drop handler always reads the
  // position currently on the board (enabling chained free moves).
  boardPositionRef.current = boardPosition

  // Highlight the last move's squares: the branch node's when on a branch,
  // otherwise the recorded move's.
  const highlighted = branchNode ?? current
  const squareStyles: Record<string, CSSProperties> = highlighted
    ? { [highlighted.from]: HIGHLIGHT, [highlighted.to]: HIGHLIGHT }
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
    () => (previewFen === null && !branchNode ? engineArrows(analysis.positions, ply) : []),
    [previewFen, branchNode, analysis.positions, ply],
  )

  const boardSquareStyles = mergeSquareStyles(squareStyles, drawing.squareStyles)
  // Branch nodes are unclassified, so no class icon while a branch is active.
  const icon = branchNode ? undefined : classIconFor(current, classes?.[ply - 1])
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
   * Drop handler, always active on every position. Moving a piece IS the action.
   *
   * Two paths:
   * - **Coach/retry preview on the board** (`previewFen` set): keep #38's
   *   transient behavior — the move previews in `previewFen`, a scored Retry is
   *   scored, and no persistent branch is created from a preview position.
   * - **Clean position** (main line or an existing branch node): a move that
   *   matches the recorded next move advances the main line; any other legal move
   *   opens/enters a persistent variation branch that carries its own live eval.
   *
   * Illegal moves return false so react-chessboard snaps the piece back. The
   * recorded line (`game.moves`) is never mutated, so step-through stays intact.
   */
  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece?: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (targetSquare === null) return false

      // Source = the position currently on the board, so moves chain.
      const sourceFen = boardPositionRef.current
      const free = applyFreeMove(sourceFen, sourceSquare, targetSquare)
      if (!free) return false // illegal move: snap back

      // --- Path A: a coach/retry preview is on the board (transient, as in #38) ---
      if (previewFen !== null) {
        // A transient preview move changes neither nav.ply nor the cursor, so the
        // move-sound effect below never fires for it: play its sound directly here
        // (recreate with chess.js for flags + check). Path B moves are sounded by
        // the effect instead, so there is no double-play.
        const moveChess = new Chess(sourceFen)
        playMoveSound(moveChess.move({ from: sourceSquare, to: targetSquare }), moveChess.inCheck())

        // Scored Coach Retry only applies to the move actually under review, i.e.
        // the free move was played from the ply's "before" position.
        const scoredRetry = retryActive && ply > 0 && sourceFen === game.moves[ply - 1]?.fenBefore
        const posB = scoredRetry ? analysis.positions[ply - 1] : undefined
        const gMove = scoredRetry ? game.moves[ply - 1] : undefined

        // Compare the mover's win% before/after the attempt and accept small losses.
        const scoreRetry = (evalAfter: Eval) => {
          if (!posB || !gMove) return
          const wpBefore = moverWinPercent(posB.eval, gMove.color)
          const wpAfterRetry = moverWinPercent(evalAfter, gMove.color)
          const loss = Math.max(0, wpBefore - wpAfterRetry)
          setRetryMessage(acceptsRetry(loss) ? null : 'Not quite, try again.')
        }

        abortFreeEval()
        pendingArrowsRef.current = null
        setPreviewFen(free.fen)
        setFreeMoveSan(scoredRetry ? null : free.san)
        setRetryActive(false)
        setRetryMessage(null)

        // Scored-retry fast path: a move in the stored top lines is accepted instantly.
        if (scoredRetry && posB) {
          const lineEval = posB.lines.find((l) => l.move === free.lan)?.eval
          if (lineEval) {
            setFreeEval(lineEval)
            setFreeEvalPending(false)
            scoreRetry(lineEval)
            return true
          }
        }

        const terminalA = terminalEval(free.fen)
        if (terminalA) {
          setFreeEval(terminalA)
          setFreeEvalPending(false)
          if (scoredRetry) scoreRetry(terminalA)
          return true
        }

        setFreeEval(null)
        setFreeEvalPending(true)
        const controllerA = new AbortController()
        freeEvalAbortRef.current = controllerA
        // Capture ply + generation so a stale async result is discarded.
        const dropPly = plyRef.current
        const dropGen = ++retryGenRef.current
        void (async () => {
          try {
            const result = await retryEngine.evaluate(free.fen, { signal: controllerA.signal })
            if (plyRef.current !== dropPly || retryGenRef.current !== dropGen) return
            const evalAfter = toWhitePov(result.score, free.stm)
            setFreeEval(evalAfter)
            setFreeEvalPending(false)
            if (scoredRetry) scoreRetry(evalAfter)
          } catch {
            if (plyRef.current === dropPly && retryGenRef.current === dropGen) setFreeEvalPending(false)
          } finally {
            if (freeEvalAbortRef.current === controllerA) freeEvalAbortRef.current = null
          }
        })()
        return true
      }

      // --- Path B: clean position — create/enter a persistent branch ---
      const onMain = cursor.kind === 'main'
      const recordedNextLan = onMain ? game.moves[ply]?.lan : undefined
      dispatch({ type: 'play', fenBefore: sourceFen, from: sourceSquare, to: targetSquare, recordedNextLan })

      // Recorded-move match: the main line advanced; its recorded eval drives the bar.
      if (onMain && recordedNextLan !== undefined && free.lan === recordedNextLan) return true

      // A branch node was created/entered. Its path is deterministic from the id
      // scheme, so compute it here to target the async eval (no post-dispatch read).
      const departPly = cursor.kind === 'branch' ? cursor.departPly : ply
      const parentPath = cursor.kind === 'branch' ? cursor.path : []
      const parentId = parentPath.length ? parentPath[parentPath.length - 1] : rootParentId(departPly)
      const path = [...parentPath, childId(parentId, free.lan)]

      // Terminal branch position: score without the engine.
      const terminal = terminalEval(free.fen)
      if (terminal) {
        dispatch({ type: 'setNodeEval', departPly, path, eval: terminal, evalPending: false })
        return true
      }

      // Non-terminal: fresh on-demand eval, abortable. A stale result is a no-op —
      // `setNodeEval` ignores a vanished node and the value is position-deterministic.
      abortFreeEval()
      dispatch({ type: 'setNodeEval', departPly, path, evalPending: true })
      const controller = new AbortController()
      freeEvalAbortRef.current = controller
      void (async () => {
        try {
          const result = await retryEngine.evaluate(free.fen, { signal: controller.signal })
          dispatch({
            type: 'setNodeEval',
            departPly,
            path,
            eval: toWhitePov(result.score, free.stm),
            evalPending: false,
          })
        } catch {
          dispatch({ type: 'setNodeEval', departPly, path, evalPending: false })
        } finally {
          if (freeEvalAbortRef.current === controller) freeEvalAbortRef.current = null
        }
      })()
      return true
    },
    [previewFen, retryActive, ply, cursor, game.moves, analysis.positions, retryEngine, abortFreeEval],
  )

  const { headers } = game
  const mainStatus = current
    ? `${current.moveNumber}${current.color === 'w' ? '.' : '...'} ${current.san}`
    : 'Start position'
  // On a branch node, the status names the branch move instead of the main-line move.
  const status = branchNode
    ? `Branch: ${branchNode.moveNumber}${branchNode.color === 'w' ? '.' : '…'} ${branchNode.san}`
    : mainStatus

  // Eval shown beside the board. Priority mirrors `boardPosition`: a coach/retry
  // preview's fresh eval, then the active branch node's live eval, then the
  // recorded eval for the current ply.
  const recordedEval = analysis.positions[ply]?.eval
  const evalForBar = previewFen
    ? freeEvalPending
      ? undefined
      : freeEval ?? recordedEval
    : branchNode
      ? branchNode.evalPending
        ? undefined
        : branchNode.eval ?? recordedEval
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
            branches={branches}
            cursor={cursor}
            onSelectNode={selectNode}
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
