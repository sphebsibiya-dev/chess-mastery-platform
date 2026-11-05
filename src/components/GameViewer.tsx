import { useCallback, useEffect, useReducer, type CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import type { ImportedGame } from '../import/types'
import { mergeArrows, mergeSquareStyles } from './drawing'
import DrawToolbar from './DrawToolbar'
import MoveList from './MoveList'
import NavControls from './NavControls'
import { navReducer, type NavAction } from './navigation'
import { useBoardDrawing } from './useBoardDrawing'

interface GameViewerProps {
  game: ImportedGame
}

const HIGHLIGHT: CSSProperties = { backgroundColor: 'rgba(255, 214, 10, 0.45)' }

const KEY_ACTIONS: Record<string, NavAction> = {
  ArrowLeft: { type: 'prev' },
  ArrowRight: { type: 'next' },
  ArrowUp: { type: 'first' },
  ArrowDown: { type: 'last' },
  Home: { type: 'first' },
  End: { type: 'last' },
}

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isEditable(event.target)) return
      const action = KEY_ACTIONS[event.key]
      if (!action) return
      event.preventDefault()
      dispatch(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const { ply } = nav
  const current = ply > 0 ? game.moves[ply - 1] : undefined
  const position = current ? current.fenAfter : game.startFen
  const squareStyles: Record<string, CSSProperties> = current
    ? { [current.from]: HIGHLIGHT, [current.to]: HIGHLIGHT }
    : {}
  const drawing = useBoardDrawing(position)

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
        <div className="board-wrap">
          <Chessboard
            options={{
              id: 'viewer-board',
              position,
              allowDragging: false,
              squareStyles: mergeSquareStyles(squareStyles, drawing.squareStyles),
              arrows: mergeArrows(drawing.arrows),
              ...drawing.boardOptions,
              animationDurationInMs: 150,
            }}
          />
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
        {/* Below the controls so a long comment never moves the buttons. */}
        <p className="move-comment" aria-live="polite">
          {current?.comment ?? ''}
        </p>
      </div>
      <div className="viewer-moves">
        {game.moves.length > 0 ? (
          <MoveList moves={game.moves} ply={ply} onSelect={(p) => dispatch({ type: 'goto', ply: p })} />
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
