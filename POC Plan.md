# POC Plan (Mogfish.chess)

Status: new doc, added Fri 6 Nov 2026. This sits alongside the standing master plan (`Chess Mastery Platform.md`) and the `claude/Brainstorm.md` doc — it does not replace either. Those stay as-is; this doc narrows them into a concrete, phased proof-of-concept sequence.

**Name/domain (decided Fri 6 Nov 2026):** final working name and domain is **Mogfish.chess**.

## POC sequencing (decided)

| Phase | Scope | Status |
| --- | --- | --- |
| POC v1 | Game review only | **Scoped below** |
| POC v2 | Add Coach (bring-your-own-LLM) | Scoped below, not started |
| POC v3 | Self-trained/personalised model (Maia-style) for coaching | Prospective only — not scoped, future direction |

## POC v1: Game review only

Maps to combined build order steps 1-2 (PGN import + board, Stockfish analysis + classification + accuracy), with three additions beyond what those steps originally called for: the review board becomes fully interactive rather than a read-only step-through, game sounds are in scope from the start, and each move gets an Explain button.

### New requirement: interactive review board

- **Move either side, any time.** On any position in the review, the player can move the piece whose turn it is — White or Black — not just step through the recorded game.
- **Auto-branching.** The moment the player makes a move that deviates from the original game, a branch opens in the move list marking the departure from the main line. No "retry" or "reset" button needs to be pressed first — moving a piece *is* the action that starts a branch.
- **Live evaluation.** Every move made in the board — original-game or branched — triggers a fresh Stockfish evaluation update, not just a lookup of the precomputed original-game eval.

This is a UX upgrade to step 1's "a board you can step through," not new scope outside game review — it stays entirely within reviewing a single game's position tree. Doesn't require accounts, coach, or anything from later steps.

### New requirement: game sounds

- Move/capture/castle/check sounds added for POC v1, not deferred.
- The standing master plan already notes a **themed sound-pack concept** (e.g. knight move → horse neigh, long capture → sniper-rifle chamber, castling → rock sliding) as cosmetic polish separate from a plain/neutral default set, previously flagged as "revisit once the review loop and board UI exist" rather than core v1 build order. That condition is now met by POC v1 scope, so: ship at least a plain/neutral sound set for v1; the themed pack remains optional polish that can land in v1 or slip to right after, player's call when it's being built.

### New requirement: Explain button on each move

- In the move-by-move review, an **Explain** button tells the player why the move played was good or bad.
- **Decided (Fri 6 Nov 2026): template/rule-based, not LLM-generated.** Built entirely from data v1 already produces — Stockfish eval swing, move classification (best/excellent/good/inaccuracy/mistake/blunder/brilliant/missed win), and what was threatened or hung — turned into templated sentences (e.g. "this move hangs your knight", "this misses a fork on move 14"). No LLM call, no Coach dependency.
- This deliberately stays out of Coach's territory: Coach (POC v2) is the plain-language, LLM-driven version of this same idea, with hint tiers and a bring-your-own-key model. The v1 Explain button is the template-based sibling the Brainstorm doc's cost-mitigation section already anticipated ("template-based explanations... covers the bulk of feedback"), just arriving earlier — in v1 rather than waiting on Coach.

### Still in v1, per the original build order

- PGN import, chess.com username import.
- Stockfish analysis, move classification (best/excellent/good/inaccuracy/mistake/blunder/brilliant/missed win), accuracy score.
- Evaluation graph, key moments / biggest blunders.

### Explicitly out of v1

- Coach (any form, including LLM-generated explanations) — moved to POC v2.
- Versus AI, time controls, accounts, learning section, weakness report — unchanged from the standing plan, still later versions.

## POC v2: Coach (bring-your-own-LLM)

Not started. Captured here so the architecture decision isn't lost before v1 ships.

- **Bring your own key.** Coach doesn't call a Mogfish-run LLM — the player supplies their own login or API key for the LLM they want (Claude, ChatGPT, or others), and Coach uses that as its "brain."
- **A built instruction set / skill for Coach.** Rather than ad hoc prompting, Coach runs on a defined instruction set (a skill) that tells whichever LLM is plugged in how to behave as a chess coach — tone, hint tiers, when to explain vs. nudge, etc. (consistent with the hint-tier approach already in the standing plan's Coach mode section).
- **Why this matters beyond the feature itself:** this directly answers the open Claude-API-cost-mitigation question raised in `claude/Brainstorm.md` — if the player brings their own key, Mogfish isn't carrying the LLM cost at all. Worth cross-referencing that doc's "Claude API cost mitigation" section when this phase is scoped in detail; several of the mitigation ideas there (template-based explanations, selective explaining) may become optional rather than necessary once BYOK is the model.
- **Relationship to v1's Explain button:** Coach can likely reuse the same trigger points (per-move, on request) but swaps the templated sentence for an LLM-generated one, with hint tiers on top.

### Open questions for v2 (not yet resolved)

- [ ] Which providers to support first — Claude, ChatGPT, others, or a generic "OpenAI-compatible" endpoint field?
- [ ] Login flow vs. raw API key entry — one, or both?
- [ ] Where/how is the key stored (client-side only vs. backend), given the standing plan's privacy stance of keeping analysis local by default?
- [ ] Does the instruction set/skill live as a system prompt template, a more structured tool-use setup, or something else?
- [ ] Fallback behaviour if a player has no key — Coach simply unavailable, or a limited built-in default?

## POC v3: Self-trained / personalised model — prospective only

Noted as the eventual direction, not scoped or started. The idea: replace or complement the BYOK Coach with a model trained specifically for chess coaching — in the spirit of Maia (which the standing plan already lists as an option for human-like *play*, not coaching explanations). Whether this is a fine-tuned open-weight model, a from-scratch model, or something else is entirely open; this phase has no build order, no architecture decisions, and no open-questions list yet. Revisit once v1 and v2 exist and real usage data/cost pressure makes the case for it.
