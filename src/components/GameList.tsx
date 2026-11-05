import { TIME_CLASS_LABELS } from '../import/timeControl'
import type { GameSummary } from '../import/types'

interface GameListProps {
  games: GameSummary[]
  onPick: (game: GameSummary) => void
  /** Id of the row that is being opened, to show it as busy. */
  opening?: string | null
}

const OUTCOME_LABEL: Record<GameSummary['outcome'], { short: string; long: string }> = {
  win: { short: 'W', long: 'Won' },
  loss: { short: 'L', long: 'Lost' },
  draw: { short: 'D', long: 'Drew' },
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(ms: number): string {
  return ms > 0 ? dateFormat.format(new Date(ms)) : ''
}

function withRating(name: string, rating: number | undefined): string {
  return rating === undefined ? name : `${name} (${rating})`
}

/** Online games for one user, newest first. Each row opens the game. */
export default function GameList({ games, onPick, opening }: GameListProps) {
  return (
    <ul className="game-list">
      {games.map((game) => {
        const outcome = OUTCOME_LABEL[game.outcome]
        const color = game.userColor === 'w' ? 'White' : 'Black'
        const date = formatDate(game.endedAt)
        const meta = [`${game.timeControl} ${TIME_CLASS_LABELS[game.timeClass]}`, game.rated ? null : 'Casual', date]
          .filter(Boolean)
          .join(' · ')
        return (
          <li key={game.id}>
            <button
              type="button"
              className="game-row"
              onClick={() => onPick(game)}
              aria-busy={opening === game.id || undefined}
              aria-label={`${outcome.long} as ${color} vs ${withRating(game.opponent, game.opponentRating)}, ${meta}`}
            >
              <span className={`outcome outcome-${game.outcome}`} aria-hidden="true">
                {outcome.short}
              </span>
              <span className="game-row-main" aria-hidden="true">
                <span className="game-row-opponent">
                  <span className={`side-dot side-${game.userColor}`} title={`You played ${color}`} />
                  vs {withRating(game.opponent, game.opponentRating)}
                </span>
                <span className="game-row-meta">{meta}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
