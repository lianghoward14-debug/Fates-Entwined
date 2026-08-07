# Phase 4 landscape classification

All 20 landscapes are now implemented in the isolated authoritative-v3
registry. Match creation still rejects any unknown landscape ID and never
falls back to legacy execution.

## Authoritative rule families

- **igb1, igb6, igb10, igb11, igb12:** no-effect baseline, one-time set Fate
  bonuses, reinforcement modification, and player-only hand reveal.
- **igb2 and igb8:** turn-14 consolidation and turn-10 seeded-zone control
  resolution. Ties resolve immediately; winners receive a recoverable,
  server-owned zone prompt before the interrupted end-turn transition resumes.
- **igb3, igb4, igb5, igb7:** seeded consolidation bonus, complete discard
  recovery denial, live total-Fate leader sampling, and once-per-turn Eventide
  movement.
- **igb9, igb13, igb15, igb18, igb19:** optional outside-draw prompts,
  alternating draw-phase skips, one resolved Supporter effect per turn,
  draw-phase Expanded Worlds Character gains, and three-owner-turn hidden-hand
  expiry.
- **igb14:** a server-owned 30-second turn timeout that submits the same
  validated `END_TURN` command as a player. No client clock can mutate state.
- **igb16 and igb17:** atomic player-facing landscape commands. Santa Anna
  discards one hand card for +4 Fate on the player's side. Concrete Roads
  pays its Coordinator plus two-hand-card cost, creates one 5-Fate Shizuku,
  copies only eligible Coordinator rules, applies copied auras field-wide,
  and records its once-per-game use.
- **igb20:** canonical 20/35/50 total-Fate claims, deterministic winner
  priority, optional mutable field-card discard, decline recording, and
  ignored thresholds when the landscape is entered after they were reached.

Random zones consume the match RNG. Landscape counters, claims, turn
continuations, prompts, generated tokens, geometry, and timer policy survive
canonical replay and projection.

## Landscape-changing card

Card 82 is eligible only because the complete 20-landscape registry is now
authoritative. Its modal continuation offers all 20 choices. Timed landscapes
cannot be entered or left during their protected final-four-turn window, and
choosing the current landscape does not reset its accumulated state.

Dedicated gates:

- `npm run smoke:authority-v3-phase4-landscapes`
- `npm run smoke:authority-v3-phase4-landscapes-deterministic`
- `npm run smoke:authority-v3-phase4-landscapes-interactive`
- `npm run smoke:authority-v3-phase4-landscapes-triggered`
- `npm run smoke:authority-v3-phase4-landscape-change`
