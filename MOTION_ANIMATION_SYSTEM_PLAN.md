# Motion Animation System Plan

## Goal

Build a full, professional-feeling animation set for Fates Entwined using the current render-v2 canvas VFX system only.

The animation language should feel fast, readable, and premium: cards travel with clean arcs, decisive impacts, subtle scale and rotation, crisp pauses, and short settle motions. The goal is closer to Pokemon TCG style card motion than magical particle spectacle.

## Hard Rules

- No DOM animation for match/gameplay motion.
- No CSS animation for match/gameplay motion.
- No cloned card elements.
- No temporary HTML overlays for card movement.
- No sparkles, particle-heavy effects, large flashes, or decorative visual noise as the default.
- No layout-dependent animation path that queries card DOM nodes.
- Use render-v2 hit-map rectangles and canvas drawing for all motion.
- Keep VFX layer redraws isolated from full board redraws whenever possible.
- Every recipe must have low-effects and reduced-motion behavior.

## Current System To Build On

The current architecture already has the right foundations:

- `src/scripts/render-v2/10-card-motion-fx.js`
  - Gameplay-facing motion helper.
  - Resolves hand, board, pile, and target rectangles through render-v2 hit maps.
  - Should become the single gameplay API for motion events.

- `src/scripts/render-v2/11-vfx-director.js`
  - Owns VFX scheduling, primitive execution, active effect budgets, low-effects mode, reduced-motion mode, and canvas drawing.
  - Already reports performance and active primitive counts.
  - Should remain the single runtime for event-based motion.

- `src/scripts/render-v2/12-vfx-primitives.js`
  - Defines primitive motion building blocks.
  - Already includes `cardMove`, `cardLift`, `cardFlip`, `cardGlow`, `cardShake`, `cardDissolve`, `cardSummon`, `cardTrail`, and sound cues.
  - Should be expanded toward motion control, not particle control.

- `src/scripts/render-v2/13-vfx-recipes.js`
  - Maps game events to primitive sequences.
  - Currently owns core recipes such as `PLAY_CARD`, `DRAW_CARD`, `DISCARD_CARD`, `DESTROY_CARD`, `FATE_GAIN`, `FATE_LOSS`, `CONSOLIDATE`, `SUPPORTER_ACTIVATE`, `LANDSCAPE_TRIGGER`, `TURN_START`, and `TURN_END`.
  - Should become the main library of all game motion recipes.

- `src/scripts/render-v2/04-match-renderer-adapter.js`
  - Owns layered canvas rendering.
  - Already supports VFX-only redraw when the dirty mask is only effects/particles.
  - Already has automatic card relocation smoothing through `FateMatchAnimationTimeline`.

## Design Direction

Motion should communicate game state through card behavior:

- A card played from hand should feel physically placed.
- A card drawn should feel pulled from the deck into the hand.
- A card discarded should leave the board cleanly and resolve into the discard pile.
- A card destroyed should feel interrupted, then removed.
- A supporter effect should feel like the source card asserting influence.
- Fate gain/loss should make the affected card react.
- Turn changes should shift attention, not cover the screen.
- Consolidation should be the most dramatic motion sequence in regular play.

The system should use:

- Fast start, smooth middle, decisive end.
- Short arcs rather than straight-line slides.
- Small rotations that imply weight.
- Scale changes for depth.
- Impact holds of 30 to 90 ms.
- Staggering for multi-card actions.
- Optional very light trails only if they are canvas-drawn, low-priority, and disabled in low-effects mode.

The system should avoid:

- Repeated glowing rings.
- Continuous pulsing.
- Large full-screen overlays.
- Text labels as the main effect.
- Anything that requires DOM measurement after the hit map already exists.
- Effects that continue after the game state is visually settled.

## Core Architecture Plan

### 1. Make `FateV2CardMotionFx` The Single Motion Entry Point

Expand `src/scripts/render-v2/10-card-motion-fx.js` into a complete gameplay motion API.

Existing helpers to keep:

- `fly`
- `flyBoardCard`
- `flipBoardCard`
- `boardNotice`
- `drawFromPile`
- `queuePlacementFromHand`
- `crashTributes`

New helpers to add:

- `moveBoardCard(card, from, to, opts)`
- `swapBoardCards(a, b, opts)`
- `returnBoardCardToHand(card, z, r, c, owner, opts)`
- `sendHandCardToDiscard(card, owner, handIndex, opts)`
- `sendBoardCardToDeck(card, z, r, c, owner, opts)`
- `sendDeckCardToBoard(card, owner, z, r, c, opts)`
- `sendDeckCardToHand(card, owner, handIndex, opts)`
- `transferHandCard(card, fromOwner, toOwner, opts)`
- `revealCard(card, rectSource, rectTarget, opts)`
- `fateChange(card, z, r, c, before, after, opts)`
- `supporterEffect(sourceCard, sourcePos, targets, opts)`
- `zoneMotion(zoneIndex, kind, opts)`
- `turnHandoff(fromPlayer, toPlayer, opts)`
- `scoreResolve(zoneIndex, winner, opts)`

Each helper should:

- Resolve rectangles from the hit map.
- Build a compact payload.
- Call `FateVfxEventBridge.onAcceptedGameEvent`.
- Return `true` when it successfully queued canvas motion.
- Return `false` without side effects when required rectangles are unavailable.

### 2. Keep `FateMatchAnimationTimeline` For Automatic Board Relocation Only

`FateMatchAnimationTimeline` should remain useful for cards whose board position changes because state changed. This covers ordinary board interpolation and avoids needing explicit hooks for every possible move.

Do not use it for event-level animations such as draw, discard, consolidation, reveal, or effect activation. Those should go through the VFX director recipes.

### 3. Expand Motion Primitives, Not Visual Noise

Add options to `cardMove` rather than adding new flashy primitives.

Recommended `cardMove` fields:

- `path`: `arc`, `snap`, `overshoot`, `direct`, `drop`, `withdraw`
- `arc`: normalized height control
- `lift`: normalized vertical lift control
- `rotate`: peak rotation in degrees
- `endRotate`: final rotation if needed
- `scale`: peak scale
- `endScale`: final scale
- `overshoot`: 0 to 1 target overshoot amount
- `settleMs`: optional post-impact settle duration
- `holdMs`: optional pause at impact or peak
- `fadeIn`: fade while entering
- `fadeOut`: fade while leaving
- `hideSourceUntil`: source visibility coordination token
- `hideTargetUntil`: target visibility coordination token
- `priority`: budget priority

Add one new primitive only if needed:

- `cardImpact`
  - Draws a short card-local squash/settle pulse on the target card.
  - No particles.
  - No glow dependency.
  - Duration 90 to 180 ms.

### 4. Add A Motion Profile Table

Create a central motion constants table in the recipe file or a new small module:

- `quick`: 180 to 260 ms
- `normal`: 320 to 460 ms
- `heavy`: 520 to 760 ms
- `marquee`: 850 to 1150 ms

Use consistent easing:

- `out-cubic` for normal travel.
- `in-out-cubic` for deliberate transitions.
- `out-back-soft` only for settle motions, not every movement.

## Special Case: Consolidation Animation

Consolidation should be the signature motion sequence.

### Desired Feel

The reinforcement cards should collide quickly and dramatically into the chosen board spot. The motion should feel like the selected supporters are being spent as force, momentum, and material for the consolidated card.

The collision should happen before the final card reveal/settle animation.

### Sequence

1. **Lock Target**
   - Resolve `targetRect` from the selected target board card or target cell.
   - Resolve every reinforcement card rect from the hit map.
   - If any reinforcement rect is missing, still animate the ones available.

2. **Micro Anticipation**
   - Duration: 60 to 90 ms.
   - Reinforcement cards lift or pull back slightly away from the target.
   - Use a tiny scale-up, around `1.03`.
   - Alternate rotations by index.

3. **Fast Collision**
   - Duration: 220 to 340 ms.
   - All reinforcement cards fly into an inset of `targetRect`.
   - Stagger: 25 to 45 ms per card, capped so the whole collision remains quick.
   - Use aggressive arc and rotation:
     - `arc`: around `.24` to `.36`
     - `lift`: around `.30` to `.45`
     - `rotate`: alternating `-8` to `8`
     - `scale`: from `1.0` to `.68`
   - End with `fadeOut:true`.
   - The last 20 percent should overshoot slightly, then snap into the target.

4. **Impact Hold**
   - Duration: 60 to 100 ms.
   - Target card/cell does a short compression or impact bump.
   - No sparkles.
   - No full-screen flash.
   - Optional sound cue: `consolidate_impact`.

5. **Result Card Reveal**
   - Duration: 260 to 420 ms.
   - The consolidated card appears from the collision point.
   - Use `cardSummon` or a new `cardSettle`/`cardImpact` primitive.
   - Start slightly smaller, snap to real board rect, then settle.
   - If the card is face down, use a restrained face-down drop instead of cinematic reveal.

6. **Post-Consolidation Handling**
   - After the collision and reveal, handle any card-specific animation:
     - Fate bonuses: small card-local bump.
     - Face-down placement: short downward set motion.
     - Boleslaw/Rivera/Ballad bonuses: compact fate-change motion.
     - No separate full-screen cinematic unless explicitly enabled as a non-default cosmetic mode.

### Consolidation Payload

Update `crashTributes` to send:

- `targetRect`
- `targetIid`
- `targetCard`
- `resultCard`
- `resultCardIid`
- `faceDown`
- `tributes`
  - `iid`
  - `card`
  - `rect`
  - `reinforcementValue`
  - `index`

### Consolidation Recipe

Update the `CONSOLIDATE` recipe to produce only canvas primitives:

- `cardMove` for each reinforcement collision.
- `cardImpact` or short `cardShake` on target.
- `cardSummon` for the result.
- `soundCue` for charge, impact, and settle.

Remove or disable:

- DOM consolidation overlays.
- CSS consolidation burst.
- Full-screen consolidation cinematic as default behavior.
- Particle spans.
- Text-heavy effect overlays.

## Animation Coverage Plan

### Card Flow

- Draw from deck to hand.
- Draw multiple cards with staggered timing.
- Add card from deck to hand after search.
- Add card from discard to hand.
- Return board card to hand.
- Discard hand card.
- Discard board card.
- Destroy board card.
- Shuffle card into deck.
- Move card from hand to opponent hand.
- Reveal card from deck before adding to hand.
- Reveal top card.
- Mulligan or opening draw sequence, if present.

### Board Placement

- Play Character from hand to board.
- Set Supporter from hand to board.
- Place face-down card.
- Free placement from deck.
- Free placement from discard.
- Card enters with modified Fate.
- Card enters immune/no-bonus/no-consolidate state.

### Board Movement

- Move within same zone.
- Move to adjacent zone.
- Move to any open square.
- Swap two cards.
- Steal/move opponent card.
- Push card out of a zone.
- Return moved card to original owner.
- Cards moved by landscape effects.

### Consolidation

- Start consolidation mode should stay mostly highlight-only, not animation-heavy.
- Selecting reinforcement can use very small card lift motion in the hover layer.
- Deselecting reinforcement can use reverse lift.
- Completing consolidation uses the special collision sequence.
- Invalid consolidation should use a short local card shake, not global warning effects.

### Card State

- Flip face-down card face up.
- Set face up to face down if any card effect does this.
- Card suppressed/negated.
- Card immune status gained.
- Card lock/no-consolidate status gained.
- Card marked for delayed effect.
- Uses-left change for activated cards.

### Effects

- Supporter activation.
- Copied supporter effect.
- Reaction/negation.
- Targeted effect from one card to another.
- Zone-wide buff.
- Zone-wide debuff.
- Effect that affects hand.
- Effect that affects deck.
- Effect that affects discard.

### Fate And Scoring

- Fate gain on one card.
- Fate loss on one card.
- Fate set to a new value.
- Fate doubled/halved.
- Fate moved from one card to another.
- Zone total changes.
- Zone contested flip.
- End-game zone scoring.
- Win/loss reveal.

### Turn And Phase

- Turn end.
- Turn start.
- Draw phase.
- Main phase ready.
- Timer warning should remain UI-level, not VFX-heavy.
- Pass-turn overlay should not depend on motion VFX.

## Recipe Naming Plan

Keep existing recipe names:

- `PLAY_CARD`
- `DRAW_CARD`
- `DISCARD_CARD`
- `DESTROY_CARD`
- `CARD_FLIP`
- `FATE_GAIN`
- `FATE_LOSS`
- `CONSOLIDATE`
- `SUPPORTER_ACTIVATE`
- `LANDSCAPE_TRIGGER`
- `TURN_START`
- `TURN_END`

Add new recipe names:

- `MOVE_CARD`
- `SWAP_CARDS`
- `RETURN_TO_HAND`
- `HAND_DISCARD`
- `DECK_TO_BOARD`
- `DECK_TO_HAND`
- `DISCARD_TO_HAND`
- `CARD_REVEAL`
- `CARD_SUPPRESS`
- `CARD_NEGATE`
- `CARD_IMMUNE`
- `ZONE_SHIFT`
- `ZONE_SCORE`
- `ZONE_WIN_FLIP`
- `MATCH_START`
- `MATCH_RESULT`
- `INVALID_ACTION`

## Hooking Plan

### First Pass Hooks

Wire the most common actions first:

1. Draw card.
2. Play card.
3. Set supporter.
4. Discard board card.
5. Discard hand card.
6. Flip face-down card.
7. Consolidate.
8. Move board card.
9. Supporter activation.
10. Fate gain/loss.

### Second Pass Hooks

Wire uncommon but visible actions:

1. Search deck to hand.
2. Search deck to board.
3. Return to hand.
4. Steal/transfer to opponent hand.
5. Copy supporter effect.
6. Multi-card discard.
7. Multi-card draw.
8. Zone scoring.

### Third Pass Hooks

Wire card-specific special cases:

1. Cards that move other cards.
2. Cards that discard adjacent cards.
3. Cards that manipulate Fate heavily.
4. Cards that flip or suppress.
5. Landscape-specific movement and scoring.

## Performance Plan

### Budgets

Default:

- Max active card motions: keep current budget around 12.
- Normal single-card animation: 300 to 460 ms.
- Multi-card action: complete within 900 ms.
- Consolidation: complete collision plus reveal within about 1000 ms.
- VFX draw time target: under 4 ms average.

Low-effects:

- Disable trails.
- Disable glows except card-local settle if needed.
- Shorten durations by 25 to 35 percent.
- Reduce multi-card stagger.
- Keep only card movement and essential sound cues.

Reduced-motion:

- Eliminate large travel arcs.
- Use short fade/settle or direct snap.
- Disable screen shake, trails, and impact shake.
- Keep state readable.

### Rendering Rules

- Trigger VFX with `FateVfxEventBridge`.
- Let `FateVfxDirector` schedule render-v2 VFX redraws.
- Preserve `lastVfxLayerOnly === true` for VFX-only frames.
- Do not dirty layout or full board for pure animation.
- Do not allocate DOM nodes for motion.
- Avoid new canvases; use existing effects/particles layers, with particles unused by default.

### Asset Rules

- Reuse existing card texture cache.
- Do not load new image assets for motion.
- Draw card visuals through existing canvas draw helpers.
- Avoid per-frame image decoding.

## Testing And Acceptance

### Automated Smoke Tests

Add or extend a VFX acceptance report that verifies:

- No `.fate-v2-motion-card` nodes are active.
- No legacy live visual DOM nodes are active.
- `FateV2CardMotionFxUsesDomGhosts === false`.
- Normal recipes do not include `particleBurst`, `screenFlash`, `shockwaveRing`, `boardDim`, or `spotlight`.
- Normal recipes are primarily `cardMove`, `cardFlip`, `cardDissolve`, `cardSummon`, `cardShake`, `cardLift`, and `soundCue`.
- VFX-only animation frames use VFX-only redraw.
- Low-effects mode still produces readable motion.
- Reduced-motion mode still produces readable state changes.

### Manual QA Checklist

Test these on desktop and smaller viewport:

- Draw one card.
- Draw three cards.
- Play character.
- Set supporter.
- Discard board card.
- Discard hand card.
- Flip face-down card.
- Consolidate with one reinforcement.
- Consolidate with multiple reinforcements.
- Move card across zones.
- Swap cards.
- Activate supporter targeting a card.
- Gain Fate.
- Lose Fate.
- End turn.
- Start next turn.
- Score end game.

For each:

- No DOM animation nodes appear.
- No CSS animation is required.
- Motion finishes before the next important input.
- Cards end exactly where game state says they should.
- No frame spikes beyond the existing render-v2 budget.
- The board remains readable during the animation.

## Implementation Phases

### Phase 1: Motion-Only Foundation

- Add motion profile constants.
- Add richer `cardMove` options.
- Add optional `cardImpact`.
- Remove noisy primitives from normal recipes.
- Update acceptance checks to fail if normal recipes depend on particle or full-screen primitives.

### Phase 2: Core Recipe Polish

- Rewrite `PLAY_CARD`.
- Rewrite `DRAW_CARD`.
- Rewrite `DISCARD_CARD`.
- Rewrite `DESTROY_CARD`.
- Rewrite `CARD_FLIP`.
- Rewrite `FATE_GAIN` and `FATE_LOSS` as card-local reactions.
- Keep all recipe output canvas-only.

### Phase 3: Consolidation Marquee

- Expand consolidation payload.
- Implement reinforcement anticipation.
- Implement quick collision into target.
- Implement target impact.
- Implement result card reveal.
- Route post-consolidation Fate bonuses through compact follow-up recipes.
- Disable default full-screen consolidation cinematic in render-v2 motion mode.

### Phase 4: Full Gameplay Coverage

- Add new recipe names.
- Add `FateV2CardMotionFx` helpers for all major card movement paths.
- Hook gameplay actions one group at a time.
- Keep DOM/CSS fallback only for non-render-v2 mode and do not expand it.

### Phase 5: Performance And Polish

- Run VFX acceptance report.
- Run manual QA checklist.
- Tune durations and stagger.
- Confirm low-effects and reduced-motion behavior.
- Remove or quarantine obsolete DOM/CSS motion paths from render-v2 mode.

## Final Acceptance Criteria

The animation system is complete when:

- All common gameplay actions have canvas-only motion.
- Consolidation has a dramatic reinforcement collision sequence.
- No new match gameplay animation uses DOM or CSS.
- Normal recipes do not use particle-heavy or full-screen visual effects.
- VFX-only frames stay on VFX layers.
- Low-effects and reduced-motion modes are respected.
- The game feels more polished without measurable lag regression.
