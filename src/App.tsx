import { useState } from 'react'
import GameViewer from './components/GameViewer'
import ImportPanel, { type ImportSession } from './components/ImportPanel'
import type { ImportedGame } from './import/types'

export default function App() {
  const [game, setGame] = useState<ImportedGame | null>(null)
  // Kept while a game is open so "back" restores the paste and the game picker.
  const [session, setSession] = useState<ImportSession | null>(null)

  const openGame = (next: ImportedGame, from: ImportSession) => {
    setSession(from)
    setGame(next)
  }

  const hasMoreGames = (session?.games.length ?? 0) > 1

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Mastery</h1>
        <p>Review your games, learn from your own mistakes.</p>
      </header>
      <main>
        {game ? (
          <>
            {session?.notice && (
              <p className="notice viewer-notice" role="status">
                {session.notice}
              </p>
            )}
            <GameViewer key={game.id} game={game} />
            <button type="button" className="import-another" onClick={() => setGame(null)}>
              {hasMoreGames ? 'Back to game list' : 'Import another game'}
            </button>
          </>
        ) : (
          <ImportPanel session={session} onGame={openGame} />
        )}
      </main>
    </div>
  )
}
