# AI planner and tactical benchmarks

The authoritative planner keeps a 2–4 action own-turn horizon. It now evaluates
up to two opponent actions, including prompted reactions and turn-end resolution,
using the real reducer. Counterplay is bounded to 48 simulated commands per
finalist and six resolution steps. Easy searches one opponent action.

Hidden opponent hands and unknown future draws use vanilla one-Fate Supporter
placeholders. Hidden opponent board identities are masked for the reply search.
This is a conservative development model, not a calibrated distribution over
possible hands; it cannot forecast unseen card-specific combos. Own-turn planning
still uses the existing canonical-state simulator. This change is not a complete
information-set search implementation.

Candidate and beam selection preserve different card/action families so repeated
placements of one card cannot occupy every slot. The legacy AI also retains
representative card/action candidates through pruning. Guaranteed terminal wins
prefer shorter sequences. The planner's simulated command envelope strips UI
metadata, and manual effect templates carry explicit activation intent. Cached
continuations are invalidated when an unexpected revision intervenes.

## Run

- `npm run smoke:ai-intelligence`: existing intelligence, morale and planner checks.
- `npm run smoke:ai-tactics`: deterministic tactical fixtures with assertions.
- `npm run benchmark:ai`: those fixtures plus four short paired-seat matches.
- For a custom count: `node server/authoritative-v3/ai-tactical-benchmark.mjs --games 12`.

Fixtures cover guaranteed lethal without extra spending, protecting against lethal
on the opponent's next turn, a reinforcement/consolidation sequence, reaction
search, hidden-hand independence in reply evaluation, and candidate diversity.
Every executed tactical sequence uses the actual reducer.

The match benchmark uses three small decks in two matchups with seats swapped,
fixed seeds, an eight-turn limit, and a greedy command-score baseline. A ten-command
turn cap applies to both policies; unfinished matches are reported as TIMEOUT.
It measures a repeatable short-game comparison, not human Elo or full-game strength.

During implementation all five fixtures passed, and the planner won four of four
short matches. Existing AI intelligence, morale, turn planning, card-update and
Warfront takeover checks passed. The historical Phase 5 action-family imitation
calibration failed with both the changed and HEAD policy against the current
engine; that existing calibration mismatch was not relaxed.

Training code and stored learned weights are unchanged.
