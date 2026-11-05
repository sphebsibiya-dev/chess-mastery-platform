# Mogfish

**Mogfish** (working name; repo and board still say "Chess Mastery Platform") is a chess review, coach and learning platform built on the player's own games. Product plan, feature list and build order: `Chess Mastery Platform.md`. Work is tracked as GitHub issues on the project board.

## Stack
- Vite 8 + React 19 + TypeScript 7 (strict). Mobile-first: everything must work on a ~375px-wide screen.
- `chess.js` for rules, move validation, PGN/FEN. Never hand-roll chess rules.
- `react-chessboard` v5: props go in one `options` object, e.g. `<Chessboard options={{ position, onPieceDrop }} />`.
- Stockfish 19 WASM (`stockfish` npm package, files in `node_modules/stockfish/bin/`) running in a Web Worker. Analysis stays in the browser; games are never sent to a server.
- Vitest for unit tests (`src/**/*.test.ts`). Test pure logic (parsing, classification, accuracy, ratings) thoroughly.

## Commands
- `npm run dev`: dev server on http://localhost:5173 (also `.claude/launch.json` → `dev`)
- `npm run build`: typecheck + production build. Must pass before any PR.
- `npm test`: run unit tests. Must pass before any PR.

## Layout
- `src/chess/`: shared chess helpers and constants
- `src/import/`: game sources (PGN paste/upload, chess.com, Lichess). Each source returns the same `ImportedGame` shape so new sources plug in easily.
- `src/engine/`: Stockfish worker wrapper and position analysis
- `src/review/`: move classification, accuracy, key moments
- `src/components/`: React UI

## Workflow (agent team)
Agents: `issue-planner` → `builder` → `reviewer` + `tester`. Agents **open PRs; the user merges**.

- One issue = one branch `feat/<issue>-<short-slug>` = one PR whose body contains `Closes #<issue>`.
- Branch from up-to-date `origin/main`. Never stack an issue on another unmerged branch; if a dependency isn't merged, stop and report it.
- Dependency order: #1 → (#2, #3, #16) → #4. #16 (board drawing) depends only on #1; keep it in its own component/hook so it does not clash with #2 in `GameViewer`. v2 issues (#5–#7) wait for v1 to be merged; v3/v4 likewise.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- PR descriptions end with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

### Hard rules
- Never merge a PR, never push to `main`, never force-push, never delete branches you didn't create.
- Never commit secrets or `.env` files.
- Stay inside the issue's scope. Note unrelated problems in the PR description instead of fixing them.

### Project board (GitHub Projects v2, owner `sphebsibiya-dev`, number 1)
- Project ID: `PVT_kwHOEjq-ws4BqJxn`
- Status field ID: `PVTSSF_lAHOEjq-ws4BqJxnzhoiIQ4`
- Status option IDs: Todo `f75ad846`, In Progress `47fc9ee4`, In Review `3b6ad025`, Done `98236657`
- Find an issue's item ID: `gh project item-list 1 --owner sphebsibiya-dev --format json --jq '.items[] | select(.content.number==<N>) | .id'`
- Set status: `gh project item-edit --id <ITEM_ID> --project-id PVT_kwHOEjq-ws4BqJxn --field-id PVTSSF_lAHOEjq-ws4BqJxnzhoiIQ4 --single-select-option-id <OPTION_ID>`
- Builder sets **In Progress** on start and **In Review** once the PR is open. GitHub moves items to **Done** when the PR merges.
