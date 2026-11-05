import type { ImportedMove } from '../import/types'
import type { KeyMoment } from '../review/keyMoments'
import { momentText, timeTroubleText } from './analysisView'

export interface TimeTroubleEntry {
  ply: number
  clockSeconds: number
}

interface KeyMomentsProps {
  /** Undefined while analysis is running. */
  moments: readonly KeyMoment[] | undefined
  /** First time-trouble move per side; shown as soon as the game opens. */
  trouble: readonly TimeTroubleEntry[]
  moves: readonly ImportedMove[]
  ply: number
  onSelectPly: (ply: number) => void
}

type Item = { ply: number; key: string; text: string; className: string }

export default function KeyMoments({ moments, trouble, moves, ply, onSelectPly }: KeyMomentsProps) {
  const items: Item[] = []
  for (const m of moments ?? []) {
    const move = moves[m.ply - 1]
    if (move) items.push({ ply: m.ply, key: `m${m.ply}`, text: momentText(m, move), className: `moment-${m.kinds[0]}` })
  }
  for (const t of trouble) {
    const move = moves[t.ply - 1]
    if (move) {
      items.push({ ply: t.ply, key: `t${t.ply}`, text: timeTroubleText(move, t.clockSeconds), className: 'moment-time' })
    }
  }
  items.sort((a, b) => a.ply - b.ply)

  return (
    <section className="key-moments" aria-label="Key moments">
      <h3>Key moments</h3>
      {items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={`moment ${item.className}`}
                aria-current={item.ply === ply ? 'true' : undefined}
                onClick={() => onSelectPly(item.ply)}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {moments === undefined ? (
        <p className="muted">Key moments appear when analysis finishes.</p>
      ) : (
        moments.length === 0 && <p className="muted">No big swings in this game.</p>
      )}
    </section>
  )
}
