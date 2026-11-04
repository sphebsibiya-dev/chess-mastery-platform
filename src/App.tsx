import { Chessboard } from 'react-chessboard'
import { START_FEN } from './chess/constants'

// Placeholder shell. Issue #1 replaces this with PGN import and a steppable board.
export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Mastery</h1>
        <p>Review your games, learn from your own mistakes.</p>
      </header>
      <main className="board-wrap">
        <Chessboard options={{ id: 'main-board', position: START_FEN, allowDragging: false }} />
      </main>
    </div>
  )
}
