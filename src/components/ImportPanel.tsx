import { useId, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { browserStorage } from '../import/cache'
import { createChesscomSource } from '../import/chesscom'
import { RUY_LOPEZ } from '../import/fixtures'
import { createLichessSource } from '../import/lichess'
import { parsePgn } from '../import/pgn'
import type { GameSource, ImportedGame, OnlineSourceId } from '../import/types'
import UsernameImport, { type OnlineSession } from './UsernameImport'

export type { OnlineSession }

/** The last successful import, kept by the parent so the user can come back to it. */
export interface ImportSession {
  text: string
  games: ImportedGame[]
  /** e.g. "1 game could not be read and was skipped." */
  notice: string | null
  /** Set when the game was opened from an online list; "back" restores that list. */
  online?: OnlineSession
}

type TabId = 'pgn' | OnlineSourceId

const TABS: { id: TabId; label: string }[] = [
  { id: 'pgn', label: 'PGN' },
  { id: 'chesscom', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
]

let sources: Record<OnlineSourceId, GameSource> | null = null

/** Created on first use; shared for the page's lifetime so the in-memory cache survives tab switches. */
function getSources(): Record<OnlineSourceId, GameSource> {
  if (!sources) {
    const fetchFn = (url: string, init?: RequestInit) => fetch(url, init)
    sources = {
      chesscom: createChesscomSource({ fetch: fetchFn, storage: browserStorage() }),
      lichess: createLichessSource({ fetch: fetchFn }),
    }
  }
  return sources
}

interface ImportPanelProps {
  /** Restores the previous paste and game picker when the user comes back. */
  session: ImportSession | null
  onGame: (game: ImportedGame, session: ImportSession) => void
}

interface ErrorState {
  message: string
  detail?: string
}

function describeGame(game: ImportedGame): string {
  const { white, black, result, date } = game.headers
  const parts = [`${white ?? '?'} vs ${black ?? '?'}`, result ?? '*']
  if (date) parts.push(date)
  return parts.join(', ')
}

function skippedNotice(count: number): string | null {
  if (count === 0) return null
  return `${count} game${count === 1 ? '' : 's'} could not be read and ${count === 1 ? 'was' : 'were'} skipped.`
}

export default function ImportPanel({ session, onGame }: ImportPanelProps) {
  const textareaId = useId()
  const fileId = useId()
  const [text, setText] = useState(session?.text ?? '')
  const [error, setError] = useState<ErrorState | null>(null)
  const [loaded, setLoaded] = useState<ImportSession | null>(session && { ...session, online: undefined })
  const choices = loaded && loaded.games.length > 1 ? loaded.games : null
  const tabsId = useId()
  const [tab, setTab] = useState<TabId>(session?.online?.source ?? 'pgn')
  const [online, setOnline] = useState<Partial<Record<OnlineSourceId, OnlineSession>>>(
    session?.online ? { [session.online.source]: session.online } : {},
  )

  const openOnline = (game: ImportedGame, state: OnlineSession) => {
    onGame(game, { text, games: loaded?.games ?? [], notice: null, online: state })
  }

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.id === tab)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    setTab(TABS[next].id)
    document.getElementById(`${tabsId}-tab-${TABS[next].id}`)?.focus()
  }

  const load = (pgn: string) => {
    const result = parsePgn(pgn)
    if (!result.ok) {
      setLoaded(null)
      setError({ message: result.error, detail: result.detail })
      return
    }
    setError(null)
    const next: ImportSession = { text: pgn, games: result.games, notice: skippedNotice(result.skipped.length) }
    setLoaded(next)
    if (result.games.length === 1) onGame(result.games[0], next)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    load(text)
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const contents = await file.text()
      setText(contents)
      load(contents)
    } catch {
      setLoaded(null)
      setError({ message: `Couldn't read the file "${file.name}".` })
    } finally {
      input.value = '' // allow picking the same file again
    }
  }

  const errorId = `${textareaId}-error`

  return (
    <section className="import-panel" aria-label="Import a game">
      <div className="source-tabs" role="tablist" aria-label="Game source">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${tabsId}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${tab}`} className="source-panel">
        {tab === 'pgn' ? (
          <>
            <form onSubmit={onSubmit}>
              <label htmlFor={textareaId} className="label">
                Paste a PGN
              </label>
              <textarea
                id={textareaId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={'[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 ...'}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              {error && (
                <div className="error-box">
                  <p id={errorId} className="error" role="alert">
                    {error.message}
                  </p>
                  {error.detail && error.detail !== error.message && (
                    <details className="error-detail">
                      <summary>Details</summary>
                      <code>{error.detail}</code>
                    </details>
                  )}
                </div>
              )}
              {loaded?.notice && <p className="notice">{loaded.notice}</p>}
              <div className="import-actions">
                <button type="submit" className="primary">
                  Load
                </button>
                <label htmlFor={fileId} className="button">
                  Upload .pgn
                </label>
                <input id={fileId} type="file" accept=".pgn,text/plain" className="visually-hidden" onChange={onFile} />
                <button
                  type="button"
                  onClick={() => {
                    setText(RUY_LOPEZ)
                    load(RUY_LOPEZ)
                  }}
                >
                  Load sample game
                </button>
              </div>
            </form>

            {loaded && choices && (
              <div className="game-picker">
                <h2>{choices.length} games found. Pick one:</h2>
                <ul>
                  {choices.map((game, i) => (
                    <li key={`${game.id}-${i}`}>
                      <button type="button" onClick={() => onGame(game, loaded)}>
                        {describeGame(game)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <UsernameImport
            key={tab}
            source={getSources()[tab]}
            state={online[tab]}
            onStateChange={(update) => setOnline((prev) => ({ ...prev, [tab]: update(prev[tab]) }))}
            onOpen={openOnline}
          />
        )}
      </div>
    </section>
  )
}
