import { useState } from 'react'
import GameViewer from './components/GameViewer'
import ImportPanel from './components/ImportPanel'
import type { ImportedGame } from './import/types'

export default function App() {
  const [game, setGame] = useState<ImportedGame | null>(null)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Mastery</h1>
        <p>Review your games, learn from your own mistakes.</p>
      </header>
      <main>
        {game ? (
          <>
            <GameViewer key={game.id} game={game} />
            <button type="button" className="import-another" onClick={() => setGame(null)}>
              Import another game
            </button>
          </>
        ) : (
          <ImportPanel onGame={setGame} />
        )}
      </main>
    </div>
  )
}
