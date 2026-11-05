import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isAbortError } from '../import/http'
import { LIST_CHUNK, listHeading, mergePage, type OnlineSession } from '../import/onlineSession'
import { summaryToGame } from '../import/summary'
import { TIME_CLASS_LABELS, filterByTimeClass, presentTimeClasses } from '../import/timeControl'
import { SourceError, type GameSource, type GameSummary, type ImportedGame } from '../import/types'
import GameList from './GameList'

export type { OnlineSession }

/** What the user typed and the last error, kept by the parent so switching tabs keeps them. */
export interface UsernameDraft {
  username: string
  error: string | null
}

interface UsernameImportProps {
  source: GameSource
  /** The list for this source, if one was loaded before. */
  list: OnlineSession | undefined
  /** Functional update, so a slow fetch never overwrites newer changes (e.g. the filter). */
  onListChange: (update: (prev: OnlineSession | undefined) => OnlineSession | undefined) => void
  draft: UsernameDraft
  onDraftChange: (update: Partial<UsernameDraft>) => void
  onOpen: (game: ImportedGame) => void
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
export default function UsernameImport({ source, list, onListChange, draft, onDraftChange, onOpen }: UsernameImportProps) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const { username, error } = draft
  const [loading, setLoading] = useState<'first' | 'more' | null>(null)
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
    onDraftChange({ error: null })
    const name = kind === 'more' && list ? list.username : username.trim()
    try {
      const page = await source.fetchGames(name, {
        signal: ctrl.signal,
        cursor: kind === 'more' ? list?.cursor : undefined,
      })
      if (ctrl.signal.aborted) return
      onListChange((prev) => mergePage(kind === 'more' ? prev : undefined, page, { source: source.id, username: name }))
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return
      onDraftChange({ error: errorMessage(err) })
      if (kind === 'first') onListChange(() => undefined)
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
      onDraftChange({ error: invalid })
      return
    }
    void run('first')
  }

  const onUsernameChange = (value: string) => {
    onDraftChange({ username: value })
    // A new name makes any in-flight request for the old one pointless.
    if (controller.current) {
      cancel()
      setLoading(null)
    }
  }

  const pick = (summary: GameSummary) => {
    try {
      onOpen(summaryToGame(summary))
    } catch (err) {
      onDraftChange({ error: err instanceof Error ? `Couldn't open this game: ${err.message}` : "Couldn't open this game." })
    }
  }

  const classes = list ? presentTimeClasses(list.games) : []
  const filter = list && (list.filter === 'all' || classes.includes(list.filter)) ? list.filter : 'all'
  const shown = list ? filterByTimeClass(list.games, filter) : []
  const visible = list ? shown.slice(0, Math.max(list.visible, LIST_CHUNK)) : []
  const hidden = shown.length - visible.length
  const note = list ? skippedNote(list.skipped) : null

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

      {list && loading !== 'first' && (
        <div className="online-results">
          <h2 aria-live="polite">{listHeading({ ...list, filter }, shown.length)}</h2>
          {note && <p className="notice">{note}</p>}

          {classes.length > 1 && (
            <div className="chips" role="group" aria-label="Filter by time control">
              {(['all', ...classes] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={filter === c}
                  onClick={() => onListChange((prev) => (prev ? { ...prev, filter: c, visible: LIST_CHUNK } : prev))}
                >
                  {c === 'all' ? 'All' : TIME_CLASS_LABELS[c]}
                </button>
              ))}
            </div>
          )}

          {/* The filter only offers classes that are present, so a non-empty list always shows rows. */}
          {visible.length > 0 && <GameList games={visible} onPick={pick} />}

          {hidden > 0 ? (
            <button
              type="button"
              className="load-more"
              onClick={() => onListChange((prev) => (prev ? { ...prev, visible: Math.max(prev.visible, LIST_CHUNK) + LIST_CHUNK } : prev))}
            >
              Show {Math.min(hidden, LIST_CHUNK)} more ({hidden} not shown)
            </button>
          ) : (
            list.hasMore && (
              <button type="button" className="load-more" onClick={() => void run('more')} disabled={loading === 'more'}>
                {loading === 'more' ? 'Loading…' : 'Load older games'}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
