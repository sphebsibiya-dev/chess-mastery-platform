import type { NavAction } from './navigation'

interface NavControlsProps {
  ply: number
  total: number
  onNavigate: (action: NavAction) => void
}

export default function NavControls({ ply, total, onNavigate }: NavControlsProps) {
  const atStart = ply <= 0
  const atEnd = ply >= total
  return (
    <div className="nav-controls" role="group" aria-label="Move navigation">
      <button type="button" aria-label="First move" disabled={atStart} onClick={() => onNavigate({ type: 'first' })}>
        ⏮
      </button>
      <button type="button" aria-label="Previous move" disabled={atStart} onClick={() => onNavigate({ type: 'prev' })}>
        ◀
      </button>
      <button type="button" aria-label="Next move" disabled={atEnd} onClick={() => onNavigate({ type: 'next' })}>
        ▶
      </button>
      <button type="button" aria-label="Last move" disabled={atEnd} onClick={() => onNavigate({ type: 'last' })}>
        ⏭
      </button>
    </div>
  )
}
