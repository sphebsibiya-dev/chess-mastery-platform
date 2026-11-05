import type { NavAction } from './navigation'

interface NavControlsProps {
  ply: number
  total: number
  onNavigate: (action: NavAction) => void
}

interface NavButtonProps {
  label: string
  symbol: string
  disabled: boolean
  onClick: () => void
}

// Uses aria-disabled rather than `disabled`, so a button that becomes inactive
// (e.g. "Last move" after pressing it) keeps keyboard focus instead of dropping it to <body>.
function NavButton({ label, symbol, disabled, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled ? true : undefined}
      onClick={() => {
        if (!disabled) onClick()
      }}
    >
      {symbol}
    </button>
  )
}

export default function NavControls({ ply, total, onNavigate }: NavControlsProps) {
  const atStart = ply <= 0
  const atEnd = ply >= total
  return (
    <div className="nav-controls" role="group" aria-label="Move navigation">
      <NavButton label="First move" symbol="⏮" disabled={atStart} onClick={() => onNavigate({ type: 'first' })} />
      <NavButton label="Previous move" symbol="◀" disabled={atStart} onClick={() => onNavigate({ type: 'prev' })} />
      <NavButton label="Next move" symbol="▶" disabled={atEnd} onClick={() => onNavigate({ type: 'next' })} />
      <NavButton label="Last move" symbol="⏭" disabled={atEnd} onClick={() => onNavigate({ type: 'last' })} />
    </div>
  )
}
