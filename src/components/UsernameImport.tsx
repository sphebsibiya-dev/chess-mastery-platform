import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isAbortError } from '../import/http'
import { summaryToGame } from '../import/summary'
import { TIME_CLASS_LABELS, filterByTimeClass, presentTimeClasses } from '../import/timeControl'
import {
  SourceError,
  type GameSource,
  type GameSummary,
  type ImportedGame,
  type OnlineSourceId,
  type TimeClass,
} from '../import/types'
import GameList from './GameList'

/** A loaded online game list, kept by the parent so "back" restores it. */
export interface OnlineSession {
  source: OnlineSourceId
  username: string
  games: GameSummary[]
  cursor?: string
  hasMore: boolean
  filter: TimeClass | 'all'
  /** Games left out so far (variants, aborted games). */
  skipped: number
}

interface UsernameImportProps {
  source: GameSource
  /** The list for this source, if one was loaded before. */
  state: OnlineSession | undefined
  /** Functional update, so a slow fetch never overwrites newer changes (e.g. the filter). */
  onStateChange: (update: (prev: OnlineSession | undefined) => OnlineSession | undefined) => void
  onOpen: (game: ImportedGame, state: OnlineSession) => void
}

function skippedNote(count: number): string | null {
  if (count === 0) return null
  return `${count} game${count === 1 ? '' : 's'} not shown (variants or aborted).`
}

function errorMessage(err: unknown): string {
  if (err instanceof SourceError) return err.message
  return 'Something went wrong loading games. Try again.'
}

/** Username form plus game list for one online source. Knows nothing source-specific. */
export default function UsernameImport({ source, state, onStateChange, onOpen }: UsernameImportProps) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const [username, setUsername] = useState(state?.username ?? '')
  const [loading, setLoading] = useState<'first' | 'more' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  const cancel = () => {
    controller.current?.abort()
    controller.current = null
  }

  useEffect(() => cancel, [])

  const run = async (kind: 'first' | 'more') => {
    cancel()
    const ctrl = new AbortController()
    controller.current = ctrl
    setLoading(kind)
    setError(null)
    const name = kind === 'more' && state ? state.username : username.trim()
    try {
      const page = await source.fetchGames(name, {
        signal: ctrl.signal,
        cursor: kind === 'more' ? state?.cursor : undefined,
      })
      if (ctrl.signal.aborted) return
      onStateChange((prev) => {
        const base: OnlineSession =
          kind === 'more' && prev
            ? prev
            : { source: source.id, username: name, games: [], hasMore: false, filter: 'all', skipped: 0 }
        const seen = new Set(base.games.map((g) => g.id))
        return {
          ...base,
          games: [...base.games, ...page.games.filter((g) => !seen.has(g.id))],
          hasMore: page.hasMore,
          cursor: page.cursor,
          skipped: base.skipped + page.skipped,
        }
      })
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return
      setError(errorMessage(err))
      if (kind === 'first') onStateChange(() => undefined)
    } finally {
      if (controller.current === ctrl) {
        controller.current = null
        setLoading(null)
      }
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const invalid = source.validateUsername(username)
    if (invalid) {
      setError(invalid)
      return
    }
    void run('first')
  }

  const onUsernameChange = (value: string) => {
    setUsername(value)
    // A new name makes any in-flight request for the old one pointless.
    if (controller.current) {
      cancel()
      setLoading(null)
    }
  }

  const pick = (summary: GameSummary) => {
    if (!state) return
    try {
      onOpen(summaryToGame(summary), state)
    } catch (err) {
      setError(err instanceof Error ? `Couldn't open this game: ${err.message}` : "Couldn't open this game.")
    }
  }

  const classes = state ? presentTimeClasses(state.games) : []
  const filter = state && (state.filter === 'all' || classes.includes(state.filter)) ? state.filter : 'all'
  const shown = state ? filterByTimeClass(state.games, filter) : []
  const note = state ? skippedNote(state.skipped) : null

  return (
    <div className="username-import">
      <form onSubmit={onSubmit} className="username-form">
        <label htmlFor={inputId} className="label">
          {source.label} username
        </label>
        <div className="username-row">
          <input
            id={inputId}
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button type="submit" className="primary" disabled={loading === 'first'}>
            {loading === 'first' ? 'Loading…' : 'Find games'}
          </button>
        </div>
      </form>

      {error && (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      )}
      {loading === 'first' && (
        <p className="muted" role="status">
          Loading games from {source.label}…
        </p>
      )}

      {state && loading !== 'first' && (
        <div className="online-results">
          <h2>
            {state.games.length === 0
              ? `No games found for ${state.username}.`
              : `${state.games.length} game${state.games.length === 1 ? '' : 's'} for ${state.username}`}
          </h2>
          {note && <p className="notice">{note}</p>}

          {classes.length > 1 && (
            <div className="chips" role="group" aria-label="Filter by time control">
              {(['all', ...classes] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={filter === c}
                  onClick={() => onStateChange((prev) => (prev ? { ...prev, filter: c } : prev))}
                >
                  {c === 'all' ? 'All' : TIME_CLASS_LABELS[c]}
                </button>
              ))}
            </div>
          )}

          {shown.length > 0 ? (
            <GameList games={shown} onPick={pick} />
          ) : (
            state.games.length > 0 && <p className="muted">No {filter} games loaded yet.</p>
          )}

          {state.hasMore && (
            <button type="button" className="load-more" onClick={() => void run('more')} disabled={loading === 'more'}>
              {loading === 'more' ? 'Loading…' : 'Load older games'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
