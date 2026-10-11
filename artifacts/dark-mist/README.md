# Veil of Silence — Howard Dev perspective tests

Theoretical Supporter: conceal the controller’s actions for the rest of their turn. Effects still resolve; cinematics, activation visuals and visible card updates are withheld until the field is revealed at turn end.

## Test in game

1. Enter Howard Dev Mode and open your deck pile.
2. Add one of **Veil of Silence (Opponent / 1–3)** or **Oktai (Opponent Test)** to your hand.
3. Set it face up normally.

The mist fixtures immediately simulate the opponent playing the supporter, covering their side from your perspective. The three styles are Rolling charcoal, Midnight tendrils and Ink eclipse. They last until the current turn changes. Mist fixtures have provisional 0 Fate / 0 cost. Oktai retains its printed stats and applies its normal concealment to the viewer immediately for four affected turns. Leaving Howard Dev Mode clears these presentations.

These definitions live only in the Howard Dev picker, not CARDS, boosters, normal deck building, AI pools, or the authoritative catalog. This is a local visual/rules test fixture, not a released multiplayer card. Production information filtering (logs, scores, opponent decisions and server payloads), final balance and full multiplayer integration remain design work.

The mist freezes the rendered card layer, hides effect layers and covers opposing rows using current board layout coordinates. These previews use the actual game renderer. The existing Oktai presentation supplies its landscape, music and hidden values.

Browser verification: all three placements, mist turn expiry, immediate Oktai viewer concealment, opponent source ownership, dev-mode guard and normal catalog exclusion. Run `node server/howard-perspective-browser-regression.cjs` with Playwright available in NODE_PATH and Edge installed.
