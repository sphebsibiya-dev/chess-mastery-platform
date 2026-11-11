# Idea 6: Chess Review and Coach Platform

Status: **new idea, added Fri 30 Oct 2026 (voice chat).** Review feature chosen as the starting point. Working name: **Mogfish** (added Thu 5 Nov 2026).

## Master plan

A chess platform that imports your games, reviews them with Stockfish, coaches you in plain language, lets you play rated games against the computer, and teaches you what your own mistakes show you need. The edge over chess.com and Lichess is the combination: review, a coach you can switch off, and a learning path built from your own games. Everything below this master plan is the detailed reference, kept in full.

> **Active sequencing (added Fri 6 Nov 2026):** `POC Plan.md` narrows this master plan into a phased proof-of-concept — **POC v1** (game review only, now including an interactive auto-branching review board, game sounds, and a template-based Explain button), **POC v2** (Coach as bring-your-own-LLM), **POC v3** (self-trained/personalised model, prospective). This master plan stays as the full reference; where the two differ on ordering, `POC Plan.md` is the working sequence. The POC additions are tracked as issues #38–#42.

## Master feature list

| Feature | What it does | Version | Detail section |
| --- | --- | --- | --- |
| Game import | chess.com username, PGN paste or upload, Lichess later | 1 | The idea |
| Game review | Stockfish analysis, move classes, accuracy, eval graph, key moments | 1 | Core features |
| Chess.com-style review | Brilliant, Great, Miss and Book classes; summary report with game rating and phases; guided move-by-move review with retry; board icons and eval bar | 1.5 | Core features |
| Versus AI | Play Stockfish at a chosen, random or progressive ranked level | 2 | Versus AI mode |
| Time controls | Bullet, blitz, rapid up to 30 minutes, ratings per format | 2 | Time controls |
| Coach mode | On or off tips, three hint tiers, Claude explanations | 3 | Coach mode |
| Weakness report and blunder trainer | Patterns across games, your mistakes as puzzles | 3 | Ideas to help players improve |
| Learning section | Rating-based curriculum, puzzles, openings, endgames | 4 | Learning Section |
| Accounts and progress | Saved games, ratings, dashboard, sharing | 4 | Foundations below |

## Foundations added in review

These were missing from the earlier sections and affect every feature.

- **Accounts and saved progress:** sign in so games, ratings per format, lesson progress and weakness data persist. Allow a no-account guest mode that stores data on the device only.
- **Data and privacy:** store only what is needed (games, ratings, progress). Say plainly what is kept, allow export and deletion, and keep Stockfish analysis in the browser so games are not sent anywhere by default.
- **Cost and monetisation:** Stockfish in the browser is free to run. The real cost is Claude explanations, which scale with use. Options: free review and play with a limit on AI explanations per day, and a paid tier for unlimited coaching and personalised learning.
- **Mobile first:** most chess is played on phones, so the board, clocks and review must work well on a small screen, ideally as an installable web app.

## New feature ideas from review

- **Over-the-board game entry:** record a real-life game by tapping moves on a board, or later by photographing the scoresheet, then review it like any other game.
- **Daily puzzle:** one puzzle a day from the Lichess database, with a streak, to build a habit.
- **Board themes and sound:** piece sets, board colours and move sounds, which make a big difference to how the app feels. Specific idea (added Wed 4 Nov 2026): themed, characterful sound effects per move type rather than generic clicks — e.g. a horse neigh for a knight move, a sniper rifle chambering sound for a long cross-board capture, a rock sliding across stone for castling. Treat as a sound-pack concept (move type → sound), separate from the default/neutral sound set; could ship as a selectable fun theme alongside a plain one. This is cosmetic polish, not in the core build order — revisit once the review loop (steps 1-2) and board UI exist. **Update (Fri 6 Nov 2026):** that condition is now met, so a plain/neutral sound set is pulled into **POC v1** (issue #40); the themed pack remains optional polish, a possible immediate follow-up.
- **Board drawing and square highlighting:** chess.com-style annotation on the board (added Thu 5 Nov 2026) — right-click-drag draws an arrow between squares, right-click a single square highlights it, clicking an existing arrow/highlight again removes it, a normal left click clears everything; modifier keys (shift/ctrl/alt) switch colour; mobile needs its own input (long-press or a draw-mode toggle, since there's no right-click). `react-chessboard` already supports arrows and highlights natively, so it's mostly wiring up input events. **Decision: not saved for now** — drawings stay temporary, live only while viewing a position, and clear on navigating away. No storage or backend needed. Saving annotations with a game review (so they're shareable, or a coach can annotate in a different colour) was considered and set aside as a possible future extension, not planned now. This is board UI work with no dependency on Stockfish, accounts or storage — it sits on the interactive board itself (step 1), with no build-order step of its own yet. Also useful later for coach mode (step 8), which could draw its own arrows to highlight a threat or the engine's suggested move, reusing the same drawing layer.
- **Game review sharing:** a link to a review so friends or a coach can step through it.
- **Post-game quick summary:** three sentences after every game, written by Claude: what went well, the main mistake, and one thing to practise.

## Risks and success measure

Success for version 1 is simple: you use it every week to review your own games. If that holds for a month, it is worth growing.

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| chess.com API limits and terms | Imports could be throttled or restricted at scale | Cache games, fetch monthly archives only, add Lichess early |
| Stockfish rating calibration | A "1200 AI" may not feel like a real 1200 | Test against real accounts, tune depth and randomness, evaluate Maia |
| Claude cost at scale | Explanations on every move would get expensive | Explain only on request or for key moments, daily limit on free tier |
| Scope creep | Five big features before a working review | Ship the tiny version one first |
| Lesson content accuracy | Wrong chess advice damages trust | Review every lesson, lean on Lichess open data |

## Combined build order

One order across every feature, replacing the separate build orders below.

1. PGN import and a board you can step through.
2. Stockfish analysis with move classification and accuracy score.
3. Chess.com username import, then Lichess import.
4. Key moments, evaluation graph, and time-trouble flags.
4a. Multi-line analysis and the missing move classes: Brilliant, Great, Miss, Book (with an opening book).
4b. Board class icons and an evaluation bar.
4c. Review summary report: accuracy, class counts, estimated game rating, opening/middlegame/endgame ratings.
4d. Guided move-by-move review: plain-language reasons, show best, retry, show follow-up.
5. Playable board against Stockfish at a fixed level, with time controls.
6. Strength slider, random mode, and calibration testing.
7. Ranked AI with separate ratings per format.
8. Coach mode with the on and off toggle and hint tiers.
9. Weakness report and blunder trainer from your own games.
10. Accounts, saved progress, and sharing.
11. Learning section: puzzles first, then openings, endgames, and the rest.
12. Personalised lessons, spaced repetition, daily puzzle, and over-the-board entry.

## Open questions, grouped

**Product**

- [x] Name and domain for the platform. Working name: **Mogfish** (added Thu 5 Nov 2026). Domain/handle availability not yet confirmed.
- [ ] Free for everyone, or a paid tier later?
- [ ] Who writes and checks the lesson content?

**Technical**

- [ ] Browser-only Stockfish, or a backend for deeper analysis?
- [ ] Stockfish with tuned settings, or Maia for lower levels?
- [ ] Lichess puzzle database directly, or puzzles generated from players' own games?
- [ ] Build with Claude Code, Cowork, or a CLI?

**Rules and limits**

- [ ] What rating range for the AI, for example 400 to 2800?
- [ ] How wide is the opponent window in ranked mode, and are take-backs and hints banned there?
- [ ] Coach mode off by default in bullet?
- [ ] Allow fully custom clocks within the 30 minute limit?

**Cost and scale**

- [ ] Claude for every coach tip, or only on request?
- [ ] Do chess.com's API limits fit the plan at scale?

The detailed open questions under each section below still apply.

## The idea

A chess platform where you can record your own games and import your chess.com games, then get a game review similar to chess.com's Game Review, without having to use chess.com. It also has a **coach mode**: tips that can be switched on or off while you play, with a coach nudging you in the right direction. Built for you first, then for anyone who wants to improve.

## Important note on approach

The original thought was to reverse engineer chess.com's game review (using the reverse-engineer-everything GitHub project). Reverse engineering chess.com's private review feature could breach their terms of service, and it is not needed:

- Chess.com has a **free public API** (Published Data API) that returns a player's monthly game archives, including PGN.
- The **Stockfish** open-source engine does the actual analysis. Most game reviews, chess.com's included, are built on engine evaluation.
- Move classification (best, excellent, good, inaccuracy, mistake, blunder, brilliant, missed win) is just the change in evaluation between the best move and the move played.

## Core features (version 1: game review)

1. Enter a chess.com username and pull recent games via the public API.
2. Also allow pasting or uploading a PGN, and later recording games played directly on the platform.
3. Run Stockfish on every position (in the browser via WebAssembly, or on a small backend).
4. Classify each move by evaluation swing (centipawn loss or win-probability loss).
5. Show an accuracy score for each side, an evaluation graph, and a list of key moments (biggest blunders, missed tactics, turning points).
6. Interactive board to step through the game with the engine's suggested move. **POC v1 (Fri 6 Nov 2026)** upgrades this from read-only step-through to fully interactive: move either side on any position, auto-branch into a variation tree on any deviation, with live Stockfish eval on every move (issues #38 board moves + live eval, #39 variation tree).

### Version 1.5: chess.com-style review (added Thu 5 Nov 2026)

Decided after v1 merged: make the review feel like chess.com's Game Review before starting play vs Stockfish (#5 waits until 4a–4d are merged). chess.com's algorithm is private, so every rule is our own documented approximation with tunable thresholds.

- **More move classes:** Brilliant (a good move that sacrifices material), Great (the only good move, every alternative is clearly worse), Miss (failed to punish the opponent's mistake), Book (opening theory, from the Lichess open opening list). Needs the engine's top two lines per position.
- **Board icons and eval bar:** the move's class icon on its destination square, and a vertical evaluation bar beside the board.
- **Summary report:** both players' accuracy, the opening name, a count of each move class, an estimated game rating per side, and a rating for each phase (opening, middlegame, endgame).
- **Guided review:** step through move by move with a coach card that says why (hangs a piece, misses mate, only move), and buttons to show the best move, retry the position yourself, and show the engine's follow-up line. Explanations are template-based; Claude explanations stay in coach mode. **POC v1 (Fri 6 Nov 2026)** surfaces the same template-based explanation as a per-move **Explain button** in the main move-by-move review, outside the guided-review card (issue #41) — still no LLM. The LLM version is Coach, now **POC v2 (bring-your-own-key)** rather than v3 Mogfish-run — see below.

## Coach mode (version 2)

> **POC v2 reframing (Fri 6 Nov 2026):** Coach is **bring-your-own-LLM** — the player supplies their own login or API key (Claude, ChatGPT, or others) and Coach uses that as its brain, running a defined coach instruction set/skill. This means Mogfish carries no LLM cost, which supersedes the earlier "Claude explanations on a daily free-tier limit" cost model for coaching. Architecture and open questions are tracked in issue #42 and `POC Plan.md` §POC v2; the existing issue #8 stays as the earlier Mogfish-run framing. Waits for POC v1 to merge.

- Toggle for tips: **on or off** at any time during a game.
- Light nudges rather than answers: for example "check what your opponent threatens" before revealing the best move. Tiers of hints (nudge, then idea, then the move).
- Stockfish provides the evaluation and best lines; **Claude explains the idea in plain language** (why the move works, what plan it supports).
- Option for tips only after the move (review-as-you-go) versus before the move (live coaching).

## Suggested tech stack (not yet decided)

- Frontend: React or Next.js with a chessboard component (chessboard.js or react-chessboard) and chess.js for rules and PGN handling.
- Engine: Stockfish compiled to WebAssembly, running in a web worker so analysis is free and private. A server option can come later for deeper analysis.
- Data: chess.com public API for imports; a database (Supabase or SQLite) for saved games and progress.
- AI explanations: Claude API for the coach's plain-language commentary.
- Hosting: Vercel or Netlify.

## Ideas to help players improve (for everyone, not just you)

- **Personal weakness report:** across many games, find patterns such as hanging pieces, missing forks, weak endgames, or opening mistakes.
- **Blunder trainer:** turn your own mistakes into puzzles. Replay the exact position and try to find the better move.
- **Opening repertoire tracker:** show which openings you play, your results in each, and where you leave theory and start losing.
- **Spaced repetition:** resurface positions you got wrong until you get them right.
- **Time management insights:** show where you burn clock or move too fast.
- **Progress dashboard:** accuracy trend, rating trend, and blunders per game over time.
- **Thinking-process checklist:** a pre-move prompt (checks, captures, threats) that coach mode can enforce for beginners.
- **Opponent-style practice:** play against Stockfish set to a human-like level with adjustable strength.
- **Endgame and tactics drills** targeted at the themes you miss most.
- **Shareable game review links** so friends and coaches can look at a game.
- **Lichess integration** as well as chess.com, since Lichess has an open API too.

## Suggested build order

1. PGN import and a board you can step through.
2. Stockfish analysis with move classification and accuracy score.
3. Chess.com username import.
4. Key moments and evaluation graph.
5. Coach mode with the on/off toggle and hint tiers.
6. Weakness report and blunder trainer.
7. Accounts, progress tracking, and sharing.

## Open questions

- [x] Name and domain for the platform. Working name: **Mogfish** (added Thu 5 Nov 2026). Domain/handle availability not yet confirmed.
- [ ] Browser-only (Stockfish WASM) or a backend for deeper analysis?
- [ ] Recording games: manual move entry, an on-screen board, or photo and scan of a scoresheet?
- [ ] Should the coach use Claude for every tip, or only for explanations on request, to manage cost?
- [ ] Free for everyone, or a paid tier later?
- [ ] Do the chess.com public API's rate limits and terms fit the plan at scale?
- [ ] Build with Claude Code, Cowork, or a CLI?

# Addition: Learning Section (rating-based chess theory)

Added Fri 30 Oct 2026. The learning section teaches chess theory (openings, middlegame, endgame, attack, defence, how to win) and adapts what it recommends to the player's current rating.

## Core principle

Every source I checked agrees on the same idea: **the study plan should change as the player's rating changes.** Beginners need rules, basic checkmates and simple tactics. Club players need middlegame strategy, endgames, calculation and game analysis. So the platform should read the player's rating (from chess.com or Lichess, or a self-reported or estimated one) and serve the right content, not one fixed course.

## Recommended content by rating band

| Rating band | Main focus | Openings | Middlegame and endgame | Daily practice |
| --- | --- | --- | --- | --- |
| Under 800 | Rules, piece safety, basic checkmates, simple tactics | Opening principles only: control the centre, develop pieces, castle early | King and queen mates, king and rook mates, basic pawn endings | 10 to 20 easy puzzles, play and review games |
| 800 to 1200 | Tactics patterns (pins, forks, skewers, discovered attacks), not hanging pieces | One simple setup as White and one reply each to 1.e4 and 1.d4, about 8 to 10 moves deep | Attacking a castled king, piece activity, basic rook endings | 20 to 30 puzzles, review every loss for blunders |
| 1200 to 1600 | Faster tactics, spotting opponent threats, simple plans | A small repertoire; learn the ideas and typical plans, not just move order | Minority attack, outposts, open files, king and pawn endings, Lucena and Philidor positions | 30 to 50 puzzles, deeper game analysis |
| 1600 to 2000 | Calculation, candidate moves, prophylaxis, pawn structures | Deeper targeted lines, move orders, an improving repertoire | Strategic patterns, piece activity and restriction, rook and minor-piece endgames | Long calculation exercises, spaced repetition on your own mistakes |
| 2000 and above | Specialisation, deep preparation, practical decisions | Sharp prepared lines and surprise weapons | Complex endgames, converting small advantages | Targeted weakness work and serious analysis |

The thresholds are guidelines. Different coaches draw the lines slightly differently, so the platform should let the player move up or down a level manually.

## Learning topics (the full curriculum)

1. **Basics and rules:** board setup, piece movement, castling, en passant, promotion, check, checkmate, stalemate, notation.
2. **Tactics:** pin, fork, skewer, discovered attack, double check, deflection, decoy, back-rank mates, removing the defender.
3. **Openings:** principles first, then a repertoire built one opening at a time. Teach the ideas and plans behind the moves, since understanding why matters more than memorising lines. Around 8 to 12 moves deep is enough for most players.
4. **Middlegame strategy:** pawn structures, outposts, open files, weak squares, piece coordination, trading when ahead, minority attack.
5. **Attack:** attacking a castled king, sacrifices, piece pressure, opening lines.
6. **Defence:** spotting threats, prophylaxis, trading attackers, counterattack, the art of resisting.
7. **Endgames:** king activity, opposition, pawn endings first, then rook endings, then minor pieces; core positions such as Lucena and Philidor.
8. **How to win:** converting an advantage, simplifying when ahead, technique, not letting a won game slip.
9. **Thinking process:** a pre-move routine (checks, captures, threats, then candidate moves) and calculation training.

## How the learning section should work

- **Placement:** on sign-up, import the player's rating from chess.com or Lichess. If none, a short placement test (a few puzzles) estimates the level.
- **Personalised path:** the app picks the lessons for the player's band, then adjusts them using the **game review data**. If the player keeps hanging pieces, it serves piece-safety and tactics lessons. If they lose won endgames, it serves endgame technique.
- **Short lesson format:** a brief explanation, an interactive board example, then 3 to 5 exercises. Short and practical beats long and theoretical.
- **Learn from your own games:** use positions from the player's real games as lesson examples and puzzles, so the theory feels relevant.
- **Opening explorer tied to results:** show how the player actually scores in each opening and link to the matching lesson.
- **Spaced repetition:** bring back concepts and positions the player got wrong.
- **Progress tracking:** show lessons completed, puzzle accuracy by theme, and suggest moving up a band when ready.
- **Coach mode link:** when coach mode spots a pattern during play, it can point to the matching lesson (for example "you missed a fork, here is a 2-minute lesson").
- **Explanations by Claude:** the AI can explain any lesson or position in plain language and answer questions, at the player's level.

## Content sources to consider

- Write the lessons ourselves with Claude's help, reviewed for accuracy.
- Lichess has open data: its puzzle database and opening explorer are free to use, which gives a large puzzle set and opening statistics with no licensing worry. Check licence terms before using any other source.
- Standard teaching material to use as a guide for the structure (not copy): books such as Silman's *The Amateur's Mind* for the 1200 to 1600 range.

## Build order for the learning section

1. Rating-band model and a simple lesson viewer.
2. Tactics puzzles by theme using the Lichess puzzle database.
3. Opening principles plus a small starter repertoire per band.
4. Endgame lessons in the order above.
5. Middlegame, attack and defence lessons.
6. Personalisation from game review data and the weakness report.
7. Spaced repetition and progress tracking.

## Open questions for the learning section

- [ ] Where does the rating come from if the player has no chess.com or Lichess account?
- [ ] Who writes and checks the lesson content, and in what order do we build it?
- [ ] How many lessons per band for version 1?
- [ ] Should lessons be free, with premium personalisation later?
- [ ] Use the Lichess puzzle database directly, or generate puzzles from players' own games?

## Sources

- [Chess Improvement Roadmap: What to Study at 400, 800, 1200, 1600+ (Chess.com)](https://www.chess.com/blog/EverythingChessPlusMore/chess-improvement-roadmap-what-to-study-at-400-800-1200-1600)
- [How to Get Better at Chess: Study Plan for Different Rating Levels (The Chess World)](https://thechessworld.com/articles/chess-how-tos/how-to-get-better-at-chess-study-plan-for-different-rating-levels/)
- [Chess Learning for Different Skill Levels (CircleChess)](https://circlechess.com/blog/chess-learning-for-different-skill-levels-beginner-to-master-2026)
- [CM Can Kabadayi's Study Guide for 1400 to 1800 (Chess.com)](https://www.chess.com/article/view/cm-can-kabadayis-intermediate-advanced-study-guide-1400-1800-elo)
- [Opening Repertoire: Options for Intermediate Players (Chess.com)](https://www.chess.com/blog/maafernan/openings-for-intermediates)
- [Chess Curriculum (Chess Gaja)](https://chessgaja.com/curriculum/)

Note: the band-by-band table blends these sources with general chess teaching practice, so treat the specifics as a starting point, not a standard. Search snippets only were reviewed; full pages were not opened.

# Addition: Claude's suggestions for the platform

Added Fri 30 Oct 2026, from the voice chat.

1. **Pick a clear angle and a name.** Chess.com and Lichess already offer game reviews. The edge here is the combination of review, a coach that can be switched on or off, and a learning path that adapts to the player's own mistakes. Lean on that in the name, the pitch and the design.
2. **Explain ideas in plain language.** Most players do not learn from an evaluation like "plus 1.3"; they learn from "you left your knight undefended". Stockfish finds the move, and Claude explains why it works, at the player's level.
3. **Keep version 1 tiny.** Import a game, run Stockfish, show the blunders and an accuracy score. A working first version in a weekend teaches more than more planning.
4. **Support Lichess early.** Its API is fully open and it would bring in players who do not use chess.com. Design the import layer so adding sources is easy.
5. **Make the coach a teacher, not an answer machine.** Hint tiers (nudge, then idea, then the move) keep players thinking, which is where the learning happens.
6. **Tie everything back to the player's own games.** Lessons, puzzles and the weakness report built from real mistakes feel far more relevant than generic content.

# Addition: Versus AI mode

Added Fri 30 Oct 2026, from the voice chat. Players can play full games against the computer, choosing the opponent's strength as a rating instead of a vague easy, medium or hard.

## The three modes

1. **Pick your level:** the player chooses an exact rating to face, for example 1350 or 1800, using a slider or number input.
2. **Random mode:** the app automatically pits the player against a random AI level. The range can be limited, for example within a few hundred points of the player's rating, or fully random for variety.
3. **Ranked AI (progressive):** the AI opponent is based on the player's current rating, close to it or somewhat higher, picked at random within that window. Win and the player's rating goes up and the next opponents get tougher. Lose and it drops, so the matches stay challenging but fair.

## How it works technically

- **Engine:** Stockfish, running in the browser through WebAssembly. It has built-in strength settings (a skill level and an Elo-limiting option), so the chosen rating maps to engine settings.
- **Calibration:** the Elo setting in Stockfish is only approximate and is calibrated against engine-versus-engine play, not real human ratings. Plan to test and adjust the mapping so a "1200 AI" feels like a 1200 player on chess.com or Lichess.
- **Human-like play:** at low ratings, plain Stockfish can play oddly, sometimes finding brilliant moves and then blundering badly. Options to make it feel more human: limit search depth, add controlled randomness, or look at a human-like engine such as Maia (trained on real human games from Lichess), which is built for exactly this. Worth evaluating.
- **Time controls:** let the player choose (untimed, 10 minutes, 5+3 and so on). The AI's thinking time should scale with its level.

## Ranked AI details

- **Starting rating:** imported from chess.com or Lichess, or a provisional rating from the first few games if the player has no account.
- **Separate rating:** keep an in-app AI rating that is independent of the player's online rating, so results here do not get confused with real-opponent ratings.
- **Rating updates:** an Elo-style system, with larger swings in the first games (provisional period) and smaller ones later.
- **Opponent selection:** random within a window around the player's rating, with a bias toward slightly stronger opponents so the player keeps growing.
- **Anti-grinding:** avoid letting players farm rating off weak opponents by keeping the window tight.

## How it connects to the rest of the platform

- Every AI game is saved and gets the **same game review** as imported games, so playing and learning feed each other.
- **Coach mode** can be toggled on or off during an AI game.
- Mistakes made against the AI feed the **weakness report, blunder trainer and personalised lessons**.
- Optional extras: take-back for casual games, resign and draw offers, choose colour or random colour, and start from a chosen opening or a position to practise (for example a specific endgame).

## Build order for versus AI

1. Playable board against Stockfish at a fixed level.
2. Strength slider mapped to rating, plus calibration testing.
3. Random mode.
4. Ranked AI mode with its own rating and updates.
5. Human-like play tuning (depth limits, randomness, or Maia).
6. Hook finished games into the review and learning features.

## Open questions for versus AI

- [ ] Stockfish with tuned settings or a human-like engine such as Maia for lower levels?
- [ ] What rating range to offer (for example 400 to 2800)?
- [ ] How wide should the opponent window be in ranked mode?
- [ ] Should take-backs and hints be allowed in ranked games? (Suggested: no.)
- [ ] Do AI games count toward any public leaderboard later?

# Addition: Time controls (match types)

Added Fri 30 Oct 2026, from the voice chat. Games can be played at different time controls, up to a **30 minute maximum**. Classical games (an hour or more) are out of scope for now.

## Formats and presets

| Format | Typical time | Suggested presets (minutes + increment in seconds) |
| --- | --- | --- |
| Bullet | Under 3 minutes | 1+0, 1+1, 2+1 |
| Blitz | 3 to 10 minutes | 3+0, 3+2, 5+0, 5+3 |
| Rapid | 10 to 30 minutes | 10+0, 10+5, 15+10, 30+0 |
| Untimed or custom | Player's choice | Untimed practice, or a custom clock |

A time control written as 5+3 means 5 minutes on the clock plus 3 seconds added after every move (the increment).

## How it fits the platform

- **Versus AI:** the player picks the time control. The AI's thinking time scales with its rating and the clock, so a fast game does not make the AI play unrealistically well or badly.
- **Separate ratings per format:** keep an in-app rating for each of bullet, blitz and rapid, since players are usually stronger or weaker at different speeds. Ranked AI uses the rating of the format being played.
- **Game review:** record the time control and the clock time used on each move. The review can then flag time trouble, moves played too fast, and positions where the player burned too much clock.
- **Importing games:** chess.com and Lichess games carry their time control, so imported games can be filtered and rated by format.
- **Learning section:** time management tips belong in the lessons, especially for blitz and bullet players.
- **Coach mode:** tips can be adjusted by format, for example lighter nudges in bullet where there is little time to read them.

## Open questions for time controls

- [ ] Offer daily or correspondence games later, or keep everything live?
- [ ] Allow fully custom clocks within the 30 minute maximum?
- [ ] Should coach mode be disabled in bullet by default?
- [ ] Show the clock graph in the game review from version 1 or later?
