import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { RUY_LOPEZ } from '../import/fixtures'
import { parsePgn } from '../import/pgn'
import type { ImportedGame } from '../import/types'

interface ImportPanelProps {
  onGame: (game: ImportedGame) => void
}

function describeGame(game: ImportedGame): string {
  const { white, black, result, date } = game.headers
  const parts = [`${white ?? '?'} vs ${black ?? '?'}`, result ?? '*']
  if (date) parts.push(date)
  return parts.join(', ')
}

export default function ImportPanel({ onGame }: ImportPanelProps) {
  const textareaId = useId()
  const fileId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<ImportedGame[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = (pgn: string) => {
    const result = parsePgn(pgn)
    setChoices(null)
    setNotice(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    if (result.skipped.length > 0) {
      const n = result.skipped.length
      setNotice(`${n} game${n === 1 ? '' : 's'} could not be read and ${n === 1 ? 'was' : 'were'} skipped.`)
    }
    if (result.games.length === 1) onGame(result.games[0])
    else setChoices(result.games)
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
      setError(`Couldn't read the file "${file.name}"`)
    } finally {
      input.value = '' // allow picking the same file again
    }
  }

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
          aria-describedby={error ? `${textareaId}-error` : undefined}
        />
        {error && (
          <p id={`${textareaId}-error`} className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="notice">{notice}</p>}
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

      {choices && (
        <div className="game-picker">
          <h2>{choices.length} games found. Pick one:</h2>
          <ul>
            {choices.map((game, i) => (
              <li key={`${game.id}-${i}`}>
                <button type="button" onClick={() => onGame(game)}>
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
