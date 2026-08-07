# Authoritative v3 Phase 5 AI calibration

The separate v3 single-player policy is calibrated against the committed
20-match, 180-action legacy AI corpus without receiving canonical opponent
state or importing the legacy game object.

The calibration replays every stable pre-action snapshot through the shared
engine, supplies the v3 policy only that acting player's projection and exact
legal command templates, and compares the selected strategic command with the
recorded legacy decision. The 60 recorded `END_TURN` boundaries are excluded
from strategy ranking because the legacy corpus driver ends turns through an
external maximum-actions scheduler whose history is intentionally absent from
the player projection.

Across the remaining 120 strategic decisions, the gate requires and currently
records:

- 105 action-family matches;
- 73 action-family plus card-instance matches;
- 58 action-family, card-instance, and exact-destination matches;
- deterministic repeat selection;
- an exact legal-template result for every comparison;
- no projected opponent hand.

Calibration changed only
`src/scripts/authoritative-v3-ai-policy.mjs`. It added board-row ownership
preference, reserved deck-origin sets for cases where they outrank known hand
development, and rewards using remaining Supporter placements. The policy
still receives projections only and the adapter still revalidates every chosen
template before reducer submission.

Run the gate through:

```text
npm run smoke:authority-v3-phase5
```
