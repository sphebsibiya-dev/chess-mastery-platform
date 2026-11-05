# Mogfish

*Working name. Domain and handles are not confirmed yet; the repo keeps its original name for now.*

A chess platform that imports your games, reviews them with Stockfish, coaches you in plain language, lets you play rated games against the computer, and teaches you what your own mistakes show you need.

The edge over chess.com and Lichess is the combination: game review, a coach you can switch off, and a learning path built from your own games.

## Status

Building version 1, the game review loop.

- Done: PGN paste and upload, and a board you can step through (#1).
- Next: Stockfish analysis with move classification and accuracy (#2), chess.com and Lichess import (#3), board arrows and square highlights, then key moments and the evaluation graph (#4).

See [the full plan](Chess%20Mastery%20Platform.md) for the feature list, build order and open questions. Work is tracked on the GitHub project board.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm test` runs the unit tests and `npm run build` makes a production build.
