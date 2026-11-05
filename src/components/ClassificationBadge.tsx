import type { MoveClass } from '../review/types'
import { CLASS_INFO } from './analysisView'

export default function ClassificationBadge({ cls }: { cls: MoveClass }) {
  const { symbol, label } = CLASS_INFO[cls]
  return (
    <span className={`badge badge-${cls}`} role="img" aria-label={label} title={label}>
      {symbol}
    </span>
  )
}
