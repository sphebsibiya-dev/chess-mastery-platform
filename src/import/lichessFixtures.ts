/**
 * Lichess game-export objects, shaped like `GET /api/games/user/{u}` NDJSON lines
 * with `pgnInJson=true&clocks=true&opening=true` (each line has the same shape as
 * the single-game JSON export). PGNs are short but complete.
 */

export const LICHESS_WIN_PGN = `[Event "Rated blitz game"]
[Site "https://lichess.org/AbCd1234"]
[Date "2026.11.04"]
[White "thibault"]
[Black "DrNykterstein"]
[Result "1-0"]
[UTCDate "2026.11.04"]
[UTCTime "10:00:00"]
[WhiteElo "1950"]
[BlackElo "2010"]
[WhiteRatingDiff "+7"]
[BlackRatingDiff "-7"]
[Variant "Standard"]
[TimeControl "180+2"]
[ECO "C23"]
[Opening "Bishop's Opening"]
[Termination "Normal"]

1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:03:00] } 2. Bc4 { [%clk 0:03:01] } 2... Nc6 { [%clk 0:03:00] } 3. Qh5 { [%clk 0:03:02] } 3... Nf6 { [%clk 0:02:58] } 4. Qxf7# { [%clk 0:03:03] } 1-0


`

/** thibault (white) beats DrNykterstein by mate. */
export const LICHESS_WIN = {
  id: 'AbCd1234',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  perf: 'blitz',
  createdAt: 1793786400000,
  lastMoveAt: 1793786460000,
  status: 'mate',
  source: 'pool',
  players: {
    white: { user: { name: 'thibault', id: 'thibault' }, rating: 1950, ratingDiff: 7 },
    black: { user: { name: 'DrNykterstein', id: 'drnykterstein', title: 'GM' }, rating: 2010, ratingDiff: -7 },
  },
  winner: 'white',
  opening: { eco: 'C23', name: "Bishop's Opening", ply: 3 },
  moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
  clock: { initial: 180, increment: 2, totalTime: 260 },
  pgn: LICHESS_WIN_PGN,
}

/** thibault (white) loses: black wins on resignation. */
export const LICHESS_LOSS = {
  id: 'Loss0001',
  rated: true,
  variant: 'standard',
  speed: 'rapid',
  perf: 'rapid',
  createdAt: 1793700000000,
  lastMoveAt: 1793700600000,
  status: 'resign',
  players: {
    white: { user: { name: 'thibault', id: 'thibault' }, rating: 1940 },
    black: { user: { name: 'opponent1', id: 'opponent1' }, rating: 1990 },
  },
  winner: 'black',
  clock: { initial: 600, increment: 0, totalTime: 600 },
  pgn: `[Event "Rated rapid game"]
[White "thibault"]
[Black "opponent1"]
[Result "0-1"]

1. f3 { [%clk 0:10:00] } 1... e5 { [%clk 0:10:00] } 2. g4 { [%clk 0:09:58] } 2... Qh4# { [%clk 0:09:55] } 0-1
`,
}

/** Draw by agreement, no `winner`. */
export const LICHESS_DRAW = {
  id: 'Draw0001',
  rated: false,
  variant: 'standard',
  speed: 'classical',
  createdAt: 1793600000000,
  lastMoveAt: 1793603000000,
  status: 'draw',
  players: {
    white: { user: { name: 'opponent2', id: 'opponent2' }, rating: 2100 },
    black: { user: { name: 'thibault', id: 'thibault' }, rating: 1960 },
  },
  clock: { initial: 1800, increment: 20, totalTime: 2600 },
  pgn: `[Event "Casual classical game"]
[White "opponent2"]
[Black "thibault"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2
`,
}

/** Stalemate, user is black. No ratings (casual vs anonymous). */
export const LICHESS_STALEMATE_ANON = {
  id: 'Stal0001',
  rated: false,
  variant: 'standard',
  speed: 'blitz',
  createdAt: 1793500000000,
  lastMoveAt: 1793500300000,
  status: 'stalemate',
  players: {
    white: {},
    black: { user: { name: 'thibault', id: 'thibault' } },
  },
  clock: { initial: 300, increment: 0, totalTime: 300 },
  pgn: `[Event "Casual blitz game"]
[White "Anonymous"]
[Black "thibault"]
[Result "1/2-1/2"]

1. e4 e5 1/2-1/2
`,
}

/** vs the Lichess AI. */
export const LICHESS_VS_AI = {
  id: 'Ai000001',
  rated: false,
  variant: 'standard',
  speed: 'correspondence',
  createdAt: 1793400000000,
  lastMoveAt: 1793450000000,
  status: 'resign',
  players: {
    white: { user: { name: 'thibault', id: 'thibault' } },
    black: { aiLevel: 3 },
  },
  winner: 'white',
  daysPerTurn: 2,
  pgn: `[Event "Casual correspondence game"]
[White "thibault"]
[Black "lichess AI level 3"]
[Result "1-0"]

1. e4 e5 1-0
`,
}

export const LICHESS_ABORTED = {
  id: 'Abrt0001',
  rated: true,
  variant: 'standard',
  speed: 'bullet',
  createdAt: 1793300000000,
  lastMoveAt: 1793300001000,
  status: 'aborted',
  players: {
    white: { user: { name: 'thibault', id: 'thibault' }, rating: 1900 },
    black: { user: { name: 'x', id: 'x' }, rating: 1900 },
  },
  clock: { initial: 60, increment: 0, totalTime: 60 },
  pgn: `[White "thibault"]
[Black "x"]
[Result "*"]

1. e4 *
`,
}

export const LICHESS_960 = {
  ...LICHESS_WIN,
  id: 'C960aaaa',
  variant: 'chess960',
  createdAt: 1793200000000,
  lastMoveAt: 1793200100000,
}

export function toNdjson(games: unknown[], eol = '\n'): string {
  return games.map((g) => JSON.stringify(g)).join(eol) + eol
}
