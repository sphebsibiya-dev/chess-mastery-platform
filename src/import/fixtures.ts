/** PGN strings shared by tests and the "Load sample game" button. */

export const RUY_LOPEZ = `[Event "Sample game"]
[Site "?"]
[Date "2024.01.15"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`

export const CASTLING = `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d6 5. d3 Be6 6. Nc3 Qd7 7. a3 O-O-O *`

export const CASTLING_ZEROS = `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. 0-0 d6 *`

export const PROMOTION = `[SetUp "1"]
[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]

1. a8=Q+ *`

export const UNDERPROMOTION = `[SetUp "1"]
[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]

1. a8=N *`

export const EN_PASSANT = `1. e4 a6 2. e5 d5 3. exd6 *`

export const COMMENTS_NAGS_VARIATIONS = `1. e4 $1 e5!? (1... c5 2. Nf3) 2. Nf3 {good} Nc6 *`

export const CHESSCOM_CLOCKS = `[Event "Live Chess"]
[Site "Chess.com"]
[White "alice"]
[Black "bob"]
[Result "*"]

1. e4 {[%clk 0:09:58.1]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:50] [%eval 0.3]} *`

export const LICHESS_CLOCKS = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcdefgh"]
[White "carol"]
[Black "dave"]
[Result "*"]

1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:02:59] } 2. Nf3 { [%clk 0:02:58] } *`

export const REPEATED_POSITIONS = `1. Nf3 {[%clk 0:05:00]} Nf6 {[%clk 0:04:59]} 2. Ng1 {[%clk 0:04:58]} Ng8 {[%clk 0:04:57]} 3. Nf3 {[%clk 0:04:56]} Nf6 {[%clk 0:04:55]} 4. Ng1 {[%clk 0:04:54]} Ng8 {[%clk 0:04:53]} *`

export const TWO_GAMES = `[Event "Game one"]
[White "First"]
[Black "X"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0

[Event "Game two"]
[White "Second"]
[Black "Y"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`

export const TWO_GAMES_SECOND_BROKEN = `[White "Good"]
[Black "X"]
[Result "1-0"]

1. e4 e5 1-0

[White "Broken"]
[Black "Y"]
[Result "0-1"]

1. e4 e5 2. Ke3 0-1
`
