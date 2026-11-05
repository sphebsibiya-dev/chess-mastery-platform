import { DRAW_COLOR_ORDER, DRAW_COLORS, type DrawColor } from './drawing'

interface DrawToolbarProps {
  drawMode: boolean
  onDrawModeChange: (on: boolean) => void
  drawColor: DrawColor
  onDrawColorChange: (c: DrawColor) => void
  canClear: boolean
  onClear: () => void
}

const COLOR_NAMES: Record<DrawColor, string> = {
  green: 'Green',
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
}

export default function DrawToolbar({
  drawMode,
  onDrawModeChange,
  drawColor,
  onDrawColorChange,
  canClear,
  onClear,
}: DrawToolbarProps) {
  return (
    <div className="draw-toolbar" role="group" aria-label="Board drawing">
      <button
        type="button"
        className="draw-toggle"
        aria-pressed={drawMode}
        title="Tap a square, then another square for an arrow, or the same square again to highlight it"
        onClick={() => onDrawModeChange(!drawMode)}
      >
        ✎ Draw
      </button>
      {drawMode && (
        <div className="draw-swatches" role="group" aria-label="Drawing colour">
          {DRAW_COLOR_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              className="draw-swatch"
              aria-label={COLOR_NAMES[c]}
              aria-pressed={drawColor === c}
              onClick={() => onDrawColorChange(c)}
            >
              <span className="draw-swatch-dot" style={{ backgroundColor: DRAW_COLORS[c] }} />
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="draw-clear"
        aria-disabled={canClear ? undefined : true}
        onClick={() => {
          if (canClear) onClear()
        }}
      >
        Clear
      </button>
    </div>
  )
}
