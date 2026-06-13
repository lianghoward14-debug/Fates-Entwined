# Professional Match Rendering Contract

This contract is the non-negotiable runtime contract for in-match rendering and card motion.

## Scope

- Applies to the live match screen only.
- Does not cover title/menu/deckbuilder UI except where those systems call live match render APIs.
- Preserves visible gameplay behavior, final-zone win glow, and consolidation readability.
- Allows no particle effects in match action motion.

## Single Action Pipeline

- Gameplay card motion must enter through `FateActionPresentation` or the documented `FateVfxEventBridge`/`FateV2CardMotionFx` facade that reports to `FateActionPresentation`.
- Card set, board placement, discard, draw/search/add-to-hand, consolidation, board movement, fate number pops, and final-zone glow must use the render-v2 compositor/VFX path in normal v2-owned match mode.
- Legacy DOM/CSS motion nodes such as `.placement-anim-ghost`, `.draw-fly-card`, `.guerilla-transfer-fly`, and `.fate-v2-motion-card` are forbidden during render-v2 match action animation frames.
- If render-v2 does not own the board, legacy fallbacks may run, but they must not be silently active in v2-owned mode.

## Frame Discipline

During an active action animation frame:

- Allowed: draw prebuilt static canvas layers, clear/draw compositor effects, draw moving card sprites, draw hover overlay, draw final-zone glow.
- Forbidden: full scene redraw, layout rebuild, hit-map rebuild, board/card DOM creation or mutation for animated cards, image decode, canvas texture generation, `getBoundingClientRect()` layout loops, broad `renderGame()` requests, and particle spawning.
- The static board/background/grid/card layer must remain frozen until the animation resolves or a fail-closed snap path is logged.

## Texture Preflight

- Motion card textures must be requested before the animation phase starts.
- Motion frame drawing must use ready cached textures or a logged minimal fallback; it must not create or decode textures from inside the frame.
- Texture miss counters must be reported per action.

## Required Instrumentation

Every action report must include:

- `id`, `type`, status, and elapsed time.
- animation frame count and max frame gap.
- full scene redraw count during animation.
- layout rebuild count during animation.
- broad render request count during animation.
- texture misses during animation.
- raw DOM mutation count during animation when `MutationObserver` is available.
- legacy/animated-card DOM mutation count during animation.
- forbidden-operation entries with action id, type, phase, source, and dirty mask/details.

Acceptance requires the action animation counters for full scene redraws, layout rebuilds, texture misses, legacy/animated-card DOM mutations, broad render requests, and broad render schedules to be zero unless the action is explicitly marked as a logged minimal snap/degraded path.

Match diagnostic logs used for acceptance must start when the match screen is entered and continue through the `s-win` end screen, including a short post-win tail so final-zone glow/end-screen rendering is captured. Early 60-second match logs are not valid proof for final-zone glow.

Starting a new match diagnostic log must prune prior `fate-match-performance*.jsonl` session logs so the next validation run is not mixed with stale match evidence. The current `latest` file and current session file are the only match-performance logs expected during a fresh run.

## Repeatable Validation

- Run `node diagnostics/check-professional-match-rendering.js --require-set --require-one-consolidation --require-multi-consolidation <match-log.jsonl...>` before calling the renderer contract complete.
- Use `--require-action <type>` for targeted proof of draw/search/discard/fate/glow cases as those scenarios are exercised, for example `--require-action DRAW_CARD --require-action SEARCH_TO_HAND`.
- The checker must pass with `failures: []`.
- A `latest` log is not sufficient by itself if it has rolled over after the required actions; use explicit session log filenames for acceptance evidence.
