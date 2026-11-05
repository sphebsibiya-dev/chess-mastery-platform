/**
 * Trimmed chess.com public API payloads, shaped like the real
 * `/pub/player/{u}/games/archives` and `/pub/player/{u}/games/{YYYY}/{MM}` responses
 * (fields as documented in the issue #3 plan). PGNs are short but complete.
 */

const header = (tags: Record<string, string>) =>
  Object.entries(tags)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join('\n')

export const HIKARU_WIN_PGN = `${header({
  Event: 'Live Chess',
  Site: 'Chess.com',
  Date: '2026.11.03',
  Round: '-',
  White: 'Hikaru',
  Black: 'carokannlover213',
  Result: '1-0',
  CurrentPosition: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
  Timezone: 'UTC',
  ECO: 'C23',
  UTCDate: '2026.11.03',
  UTCTime: '15:18:31',
  WhiteElo: '3350',
  BlackElo: '3099',
  TimeControl: '180',
  Termination: 'Hikaru won by checkmate',
  StartTime: '15:18:31',
  EndDate: '2026.11.03',
  EndTime: '15:19:20',
  Link: 'https://www.chess.com/game/live/150000000001',
})}

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:02:59.9]} 2. Bc4 {[%clk 0:02:59.1]} 2... Nc6 {[%clk 0:02:58.5]} 3. Qh5 {[%clk 0:02:58.4]} 3... Nf6 {[%clk 0:02:56.2]} 4. Qxf7# {[%clk 0:02:57.9]} 1-0
`

export const HIKARU_WIN = {
  url: 'https://www.chess.com/game/live/150000000001',
  pgn: HIKARU_WIN_PGN,
  time_control: '180',
  end_time: 1793719160,
  rated: true,
  tcn: 'mC0Kgv5Qbs!Tcj',
  uuid: '8f0b6a2e-b9a1-11f1-8000-000000000001',
  initial_setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
  time_class: 'blitz',
  rules: 'chess',
  white: {
    rating: 3350,
    result: 'win',
    '@id': 'https://api.chess.com/pub/player/hikaru',
    username: 'Hikaru',
    uuid: 'ab0ed2a4-0000-0000-0000-000000000001',
  },
  black: {
    rating: 3099,
    result: 'checkmated',
    '@id': 'https://api.chess.com/pub/player/carokannlover213',
    username: 'carokannlover213',
    uuid: 'ab0ed2a4-0000-0000-0000-000000000002',
  },
  eco: 'https://www.chess.com/openings/Bishops-Opening-Berlin-Defense',
}

/** Hikaru as Black, loses on time. */
export const HIKARU_TIMEOUT_LOSS = {
  url: 'https://www.chess.com/game/live/150000000002',
  pgn: `${header({
    Event: 'Live Chess',
    Site: 'Chess.com',
    Date: '2026.11.02',
    White: 'FruityPebbles',
    Black: 'Hikaru',
    Result: '1-0',
    WhiteElo: '3010',
    BlackElo: '3345',
    TimeControl: '180+2',
    Termination: 'FruityPebbles won on time',
  })}

1. d4 {[%clk 0:03:02]} 1... d5 {[%clk 0:03:01.5]} 2. c4 {[%clk 0:03:00.1]} 2... e6 {[%clk 0:00:00]} 1-0
`,
  time_control: '180+2',
  end_time: 1793630000,
  rated: true,
  uuid: '8f0b6a2e-b9a1-11f1-8000-000000000002',
  time_class: 'blitz',
  rules: 'chess',
  white: { rating: 3010, result: 'win', username: 'FruityPebbles' },
  black: { rating: 3345, result: 'timeout', username: 'Hikaru' },
}

/** Agreed draw, rapid. */
export const HIKARU_DRAW = {
  url: 'https://www.chess.com/game/live/150000000003',
  pgn: `${header({
    Event: 'Live Chess',
    Site: 'Chess.com',
    Date: '2026.11.01',
    White: 'Hikaru',
    Black: 'MagnusCarlsen',
    Result: '1/2-1/2',
    WhiteElo: '2900',
    BlackElo: '2950',
    TimeControl: '600+5',
    Termination: 'Game drawn by agreement',
  })}

1. e4 {[%clk 0:10:00]} 1... e5 {[%clk 0:10:03]} 2. Nf3 {[%clk 0:10:01]} 2... Nc6 {[%clk 0:10:05]} 1/2-1/2
`,
  time_control: '600+5',
  end_time: 1793540000,
  rated: true,
  uuid: '8f0b6a2e-b9a1-11f1-8000-000000000003',
  time_class: 'rapid',
  rules: 'chess',
  white: { rating: 2900, result: 'agreed', username: 'Hikaru' },
  black: { rating: 2950, result: 'agreed', username: 'MagnusCarlsen' },
}

/** Chess960: skipped. */
export const HIKARU_960 = {
  url: 'https://www.chess.com/game/live/150000000004',
  pgn: `${header({
    Event: 'Live Chess - Chess960',
    White: 'Hikaru',
    Black: 'someone',
    Result: '1-0',
    SetUp: '1',
    FEN: 'bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9',
  })}

9. g3 1-0
`,
  time_control: '180',
  end_time: 1793500000,
  rated: true,
  uuid: '8f0b6a2e-b9a1-11f1-8000-000000000004',
  time_class: 'blitz',
  rules: 'chess960',
  white: { rating: 3000, result: 'win', username: 'Hikaru' },
  black: { rating: 2800, result: 'resigned', username: 'someone' },
}

/** Daily game, Hikaru as Black wins. */
export const HIKARU_DAILY_WIN = {
  url: 'https://www.chess.com/game/daily/150000000005',
  pgn: `${header({
    Event: "Let's Play!",
    Site: 'Chess.com',
    Date: '2026.10.20',
    White: 'dailyfan',
    Black: 'Hikaru',
    Result: '0-1',
    TimeControl: '1/86400',
    Termination: 'Hikaru won by checkmate',
  })}

1. f3 1... e5 2. g4 2... Qh4# 0-1
`,
  time_control: '1/86400',
  end_time: 1792500000,
  rated: false,
  uuid: '8f0b6a2e-b9a1-11f1-8000-000000000005',
  time_class: 'daily',
  rules: 'chess',
  white: { rating: 1200, result: 'checkmated', username: 'dailyfan' },
  black: { rating: 2400, result: 'win', username: 'Hikaru' },
}

/** Archive list as chess.com sends it: oldest first. */
export function archivesFor(user: string, months: string[]): { archives: string[] } {
  return { archives: months.map((m) => `https://api.chess.com/pub/player/${user}/games/${m}`) }
}

/** A monthly archive payload; chess.com lists games oldest first. */
export function monthPayload(games: unknown[]): { games: unknown[] } {
  return { games }
}

/** `n` copies of a standard game with distinct ids/end times, oldest first. */
export function manyGames(n: number, baseEnd: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    ...HIKARU_WIN,
    uuid: `${HIKARU_WIN.uuid}-${baseEnd}-${i}`,
    url: `${HIKARU_WIN.url}${i}`,
    end_time: baseEnd + i,
  }))
}
