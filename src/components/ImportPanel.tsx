import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { RUY_LOPEZ } from '../import/fixtures'
import { parsePgn } from '../import/pgn'
import type { ImportedGame } from '../import/types'

/** The last successful import, kept by the parent so the user can come back to it. */
export interface ImportSession {
  text: string
  games: ImportedGame[]
  /** e.g. "1 game could not be read and was skipped." */
  notice: string | null
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
  const [loaded, setLoaded] = useState<ImportSession | null>(session)
  const choices = loaded && loaded.games.length > 1 ? loaded.games : null

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
    </section>
  )
}
