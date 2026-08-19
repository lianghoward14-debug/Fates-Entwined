# Server-Authoritative Multiplayer Test Runbook

This is the short operational handoff for repeating the August 2026 multiplayer certification process. The detailed contract and assertion list remain in `SERVER_AUTHORITATIVE_MULTIPLAYER_TEST_HARNESS.md`.

## What counts as a real test

- Use two clients, one for seat A and one for seat B.
- Use `fateV3PresentationE2E=1`. This exercises the shipping renderer, animations, cinematics, modals, pointer input, legal-command UI, WebSocket authority, and reducer.
- Do not count fast-mode tests, Node-only simulations, or direct-command fallbacks as shipping certification.
- After deterministic deck/landscape setup, interact only through visible production controls.

## Required services

1. Serve the current workspace at `http://127.0.0.1:8126`.
2. Run the local beta authority/test API at `http://127.0.0.1:8790`.
3. Confirm both endpoints respond before starting a long batch.

Manual Electron beta clients can be opened with:

```powershell
npm run electron:beta:test:one
npm run electron:beta:test:two
```

## Shipping-path batch URL

Open the same URL in both clients, changing only `e2eSeat=A`/`B`:

```text
http://127.0.0.1:8126/index.html
  ?electron=1
  &fateV3UnrankedBeta=1
  &fateV3BetaTestAuth=1
  &fateV3PresentationE2E=1
  &fateV3BetaTestApiUrl=http://127.0.0.1:8790
  &e2eFresh=1
  &e2eOrganicCardCampaign=1
  &e2eStrictCardCertification=1
  &e2eStallMs=12000
  &e2eGames=<count>
  &e2eStartIndex=<first-index>
  &e2eRunId=<unique-shared-id>
  &e2eSeat=<A-or-B>
  &uiRev=<cache-buster>
```

Both seats must use the same run ID, start index, game count, and UI revision.

## Campaign layout

- The full campaign is 107 cards x 10 scenarios = 1,070 indexed matches (`0` through `1069`).
- Split the index range into non-overlapping two-client batches.
- Prefer two simultaneous pairs. Four pairs can expose useful load races, but may also create false peer-abandon or presentation-timeout failures.
- Never restart a whole campaign after a fix. Record each pair's completed/failed count and resume at the next untested index.

## Live monitoring

Read and parse `#phase7-full-ui-e2e-status` from each seat regularly. Track at least:

- `startGameIndex`, `targetGames`, `completedGames`, and `failedGames`;
- `running`, `failedScenarioIndexes`, `lastStage`, and `actions`;
- the latest `errors`, oracle/DOM/cross-seat violations, and presentation timing violations.

An unchanged wall clock is not itself a stall. A real stall is a stage/action count that stops advancing outside an active production presentation. The harness disconnects and advances after its bounded stall deadline instead of waiting for the turn timer.

## Failure workflow

1. Preserve the failure bundle and exact scenario index.
2. Decide whether it is a rules defect, shipping-UI defect, presentation-order defect, missing evidence, or load/test-driver artifact.
3. Make the smallest production fix. Do not add a test-only gameplay path.
4. Add or extend a structural/smoke regression assertion.
5. Cache-bump the changed browser module in `index.html`.
6. Roll active pairs forward from their completed checkpoint.
7. Put every affected index into an exact replay queue.

Do not weaken a certification gate because a scenario was inconvenient. For example, if a required partner card was not exercised, rerun the index until the planned partner evidence is actually observed.

## Exact replay

Rerun a failed index with `e2eGames=1` and `e2eStartIndex=<failed-index>`. Use a new shared run ID. A replay passes only when both seats report:

- one completed match;
- zero failed matches and no failed index;
- no browser, oracle, DOM, cross-seat, presentation-order, or fallback errors;
- complete focused-card and planned-partner evidence.

Use one or two simultaneous replay pairs when investigating prior peer-abandon or GPU/presentation-load failures.

## Final gate

After every scheduled index and every replay completes, run:

```powershell
npm run smoke:authority-v3-phase7
node server/authoritative-v3/phase4-continuous-modifiers-smoke-test.mjs
git diff --check
```

Report separately:

- total campaign scenarios executed;
- exact replay count and any repeated low-load reruns;
- production defects fixed;
- final smoke-test results;
- whether deployment was or was not performed.

Never claim that a campaign is clean merely because the harness process ended. The indexed schedule, failure queue, exact replays, and final smoke gates must all be complete.
