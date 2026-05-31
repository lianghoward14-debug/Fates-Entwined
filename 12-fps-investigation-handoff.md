# Fates Entwined 12 FPS Issue Handoff

This document is for future AI/debugging passes. It summarizes the persistent low-FPS / global-delay issue in `Fates Entwined v1.0`, what has already been investigated, what was changed, and what still needs deeper diagnosis.

## Short Version

The game can enter a persistent low-performance state, often around 12-15 FPS, sometimes lower after tab switching. The important detail is that this is not just visual frame lag. When the issue happens, the whole page feels stalled:

- Buttons respond late.
- Menus take seconds to open.
- AI turns become slow.
- Consolidation animations stay on screen too long.
- Starting an AI game from the title screen can take an unusually long time.
- It can continue even after leaving a match and sitting on the title screen.
- It happens more often in multiplayer, but it is not exclusively caused by multiplayer.
- It can be triggered by alt-tabbing, but can also happen randomly during gameplay.

The user is testing in Firefox, from Japan, while online servers are in North America. Network latency can explain delayed server confirmation in multiplayer, but it does **not** explain local title-screen stalls or the persistent 12 FPS state by itself.

## Key Symptom Pattern

The low-FPS traces repeatedly show frame gaps near 66.7ms and 83.3ms, which corresponds to roughly 15 FPS and 12 FPS.

Example report from Firefox while stuck on title screen:

```json
{
  "screen": "s-title",
  "measuredFps": 13,
  "slowFrameGaps": [83.3, 83.3, 66.7, 83.3],
  "timerDelays": [1265, 917, 743, 505],
  "messageDelays": [172, 172],
  "hasFocus": false,
  "hidden": false,
  "rafCallsPerSecond": 106,
  "rafCallsPeak": 329,
  "promiseThenRate": 165,
  "promiseThenPeak": 249,
  "timerBridge": {
    "enabled": false,
    "installed": false,
    "mode": "opt-in-only"
  },
  "diagnosis": {
    "timerFrozen": true,
    "messageQueueFrozen": false,
    "rafStuckLow": true,
    "hiddenStateStuck": false
  }
}
```

Another title-screen report showed a huge timer delay:

```json
{
  "elapsedMs": 480032,
  "screen": "s-title",
  "fps": 12,
  "timerDelays": [461609],
  "nodes": 650,
  "audioCount": 0
}
```

Interpretation: the page is not merely rendering slowly. Timers can be delayed massively, and the main page/event loop can become effectively starved or throttled.

## Important Finding Already Confirmed

`src/scripts/15-online-auth.js` used to contain a requestAnimationFrame flood throttle. That mechanism was a serious bug.

The old rAF throttle did this:

1. Counted `requestAnimationFrame` calls.
2. If the count got high, it switched into a batching mode.
3. In batching mode, many rAF callbacks were queued and only processed in chunks.
4. The processed callbacks often scheduled more rAF callbacks.
5. The throttle could keep itself alive indefinitely.
6. `cancelAnimationFrame` was also damaged because queued calls got fake handles.

That can create an irreversible starvation loop that looks exactly like the 12 FPS state.

### What was done

The rAF throttle was removed from `15-online-auth.js`. The file now relies on the Firebase stats disabling and Promise-loop guard instead of monkey-patching rAF.

This was necessary, but it did **not** fully eliminate the low-FPS issue. Therefore the rAF throttle was one real issue, but not the only cause.

## Timer Bridge Experiment

A timer bridge / timer recovery idea was tested. It was meant to prevent the page from getting stuck in Firefox's delayed timer state.

The user found that this made normal gameplay more variable:

- Without it, starting a game and sitting still mostly stayed near 60 FPS.
- With it, the UI had higher FPS variance and felt less stable.

### Current status

The timer bridge is disabled by default and should stay opt-in only unless a much better version is designed.

The diagnostic currently reports:

```json
{
  "timerBridge": {
    "enabled": false,
    "installed": false,
    "mode": "opt-in-only",
    "note": "Timer bridge is disabled by default because it caused FPS variance during normal play."
  }
}
```

Do not re-enable the old bridge as a default fix.

## Styling / Compositor Work Already Tried

Several style optimizations were attempted:

- Reduced expensive global hidden-tab selectors.
- Added compositor reset logic.
- Reduced some costly animations in performance mode.
- Simplified some red warning text and card draw animations.
- Simplified consolidation animations in performance mode.
- Removed or reduced some heavy transitions/filters/backdrop effects.

These changes can help frame stability, but the user correctly observed that the real issue feels deeper than CSS. When the bug happens, even click handling and timers are delayed. Styling may contribute, but it is unlikely to be the whole root cause.

## Firefox-Specific Clues

The issue can happen after:

- Alt-tabbing away and back.
- Sitting idle on the title screen.
- Playing multiplayer.
- Randomly during gameplay.

In Firefox, timer throttling and page focus states can be aggressive. One trace showed:

```json
{
  "hidden": false,
  "hasFocus": false,
  "rafStuckLow": true,
  "timerFrozen": true
}
```

That combination matters. The page can be visible but not focused, with timers still behaving badly.

Future debugging should explicitly track:

- `document.hidden`
- `document.hasFocus()`
- `window.__fatePageHidden`
- CSS classes on `html` and `body`
- rAF cadence
- `setTimeout` / `setInterval` drift
- `MessageChannel` latency
- Firebase listener volume
- Number of active timers/listeners/subscriptions

## Multiplayer-Specific Work Done

Multiplayer was reported to feel slower than single player, especially from Japan. Some latency is expected when servers are in North America, but local UI should still feel instant.

### Optimistic UI

`src/scripts/18-online-rooms.js` already has optimistic local action handling:

- Local clicks/actions apply immediately.
- The action is sent to Firebase in the background.
- If the network rejects the action, the code schedules a correction/reload.

Relevant mechanisms:

- `sendOptimisticAction`
- `makeOptimisticActionId`
- `rememberOptimisticAction`
- `optimisticAppliedActionIds`

This is the right direction for Japan-to-US latency.

### Recent multiplayer performance tweaks

In `src/scripts/18-online-rooms.js`:

- `reportActionProgress(seq)` now throttles duplicate progress writes.
- In-game room chat syncing now skips recomputation when the chat payload has not changed.
- `subscribeActions` now avoids extra `evaluateLagPause()` calls before each queued replay action.

These reduce online bookkeeping churn, but they are not a proven final fix for the 12 FPS state.

## Party / Social Changes Recently Made

These were part of the current work pass, not necessarily the FPS root cause.

In `src/scripts/17-online-social.js`:

- The redundant Requests button in the Social page friends panel was removed. The top-right Pending button remains the entry point.
- Friend request modal gets a `friend-requests-modal` class.
- Party teardown is now more aggressive:
  - If one player leaves, the party is disbanded.
  - If a player refreshes/closes the tab, Firebase `onDisconnect` removes the party.
  - Both users' `userParties` pointers are cleared when possible.
  - Stale party invites between party members are cleared.
  - A visible party-disbanded notification is shown.
- `window.disbandOnlineParty(reason, opts)` is exposed for room/match cleanup.

In `src/scripts/18-online-rooms.js`:

- Online room end/leave paths attempt to call `window.disbandOnlineParty(...)`.

In `src/styles/zz-codex-last.css`:

- The old Social-page request button is hidden.
- The Pending friend request modal has larger rows, larger avatars, and fixed avatar cropping.
- Party system notices have their own styling.

## Current Suspects

### 1. Firefox timer throttling / focus state bug

The strongest remaining suspect is Firefox entering a bad timer/rAF cadence where:

- `document.hidden` is false.
- The page may not have focus.
- Timers are delayed.
- rAF continues, but only at 12-15 FPS.

This would explain why the issue persists on the title screen and affects all UI.

Potential fix direction:

- On `visibilitychange`, `pageshow`, and `focus`, run a very lightweight reactivation routine.
- Avoid constant compositor resets.
- Avoid installing global timer monkey-patches.
- Consider a one-shot Firefox-specific "wake" sequence that:
  - clears stale hidden flags/classes,
  - restarts only known game timers,
  - pauses/resumes nonessential loops,
  - avoids adding CSS animation churn.

### 2. Too many active background loops/listeners after online play

The title screen reports sometimes show high node count and continued rAF/promise activity. Future work should audit whether leaving a multiplayer match fully clears:

- Firebase room listeners
- action listeners
- spectator listeners
- chat listeners
- profile subscriptions
- intervals from social/world chat
- diagnostics loops
- animation loops

Important files:

- `src/scripts/17-online-social.js`
- `src/scripts/18-online-rooms.js`
- `src/scripts/21-smoothness-core.js`
- `src/scripts/22-spectator.js`
- `src/scripts/15-online-auth.js`

### 3. Recovery loop churn

The console showed repeated:

```text
[Fate FPS] Compositor reset: sustained-low-fps-13
```

This can help recover sometimes, but repeated recovery can itself create variance. Future work should check `src/scripts/21-smoothness-core.js` for:

- How often recovery triggers.
- Whether recovery changes layout/style repeatedly.
- Whether recovery runs while the user is simply idle on the title screen.
- Whether repeated recovery masks the root cause.

### 4. Firebase activity and Promise churn

Reports show Promise rates that are not huge but are nonzero while stuck. Multiplayer could add listener churn.

Do not assume "network latency" is the full reason. Latency should delay remote confirmation, not freeze local buttons.

## Suggested Next Diagnostic Command

Use a Firefox console command that samples page state, timers, MessageChannel latency, rAF cadence, and known Fate globals. Avoid unsupported `longtask` entry types because Firefox can reject that observer.

Important: do not paste commands containing ellipsis characters. Use plain ASCII only.

```js
(function(){
  var seconds = 20;
  var start = performance.now();
  var lastFrame = start;
  var frames = 0;
  var gaps = [];
  var timerDelays = [];
  var messageDelays = [];
  var samples = [];
  var done = false;
  var nextTimerExpected = performance.now() + 250;

  function activeScreen(){
    var el = Array.prototype.find.call(document.querySelectorAll('.screen'), function(x){
      return x.classList.contains('active');
    });
    return el ? el.id : '';
  }

  function sample(label){
    var g = (typeof window.getFateGameState === 'function') ? window.getFateGameState() : window.FATE_GAME_STATE;
    var perf = window.__fatePerf || {};
    samples.push({
      label: label,
      t: Math.round(performance.now() - start),
      screen: activeScreen(),
      hidden: document.hidden,
      hasFocus: document.hasFocus ? document.hasFocus() : null,
      pageHidden: !!window.__fatePageHidden,
      htmlClasses: document.documentElement.className,
      bodyClasses: document.body ? document.body.className : '',
      nodes: document.getElementsByTagName('*').length,
      animations: document.getAnimations ? document.getAnimations().length : null,
      rafCallsPerSecond: perf.rafCallsPerSecond,
      rafCallsPeak: perf.rafCallsPeak,
      promiseThenRate: perf.promiseThenRate,
      promiseThenPeak: perf.promiseThenPeak,
      recoveries: perf.recoveries,
      lastRecoveryReason: perf.lastRecoveryReason,
      game: g ? {
        phase: g.phase,
        turn: g.turn,
        currentPlayer: g.currentPlayer,
        online: !!g._onlineRoomCode,
        lagPause: !!g._onlineLagPauseActive,
        applyingRemote: !!g._onlineApplyingRemoteAction,
        actionSeq: g._onlineActionSeq,
        appliedSeq: g._onlineAppliedActionSeq
      } : null
    });
  }

  function timerLoop(){
    var now = performance.now();
    var late = now - nextTimerExpected;
    if(late > 40) timerDelays.push(Math.round(late * 10) / 10);
    nextTimerExpected = now + 250;
    if(!done) setTimeout(timerLoop, 250);
  }

  function messagePing(){
    if(done) return;
    var t0 = performance.now();
    var ch = new MessageChannel();
    ch.port1.onmessage = function(){
      var d = performance.now() - t0;
      if(d > 25) messageDelays.push(Math.round(d * 10) / 10);
      setTimeout(messagePing, 500);
    };
    ch.port2.postMessage(1);
  }

  function frame(now){
    frames++;
    var gap = now - lastFrame;
    if(gap > 40) gaps.push(Math.round(gap * 10) / 10);
    lastFrame = now;
    if(frames === 1) sample('start');
    if(frames % 120 === 0) sample('frame-' + frames);
    if(now - start < seconds * 1000){
      requestAnimationFrame(frame);
    }else{
      done = true;
      sample('end');
      var elapsed = performance.now() - start;
      var report = {
        at: new Date().toISOString(),
        elapsedMs: Math.round(elapsed),
        measuredFps: Math.round(frames * 1000 / elapsed),
        frames: frames,
        slowFrameGaps: gaps.slice(-140),
        timerDelays: timerDelays.slice(-80),
        messageDelays: messageDelays.slice(-80),
        samples: samples,
        summary: {
          slowFrames: gaps.length,
          worstFrameGap: gaps.length ? Math.max.apply(null, gaps) : 0,
          timerDelays: timerDelays.length,
          worstTimerDelay: timerDelays.length ? Math.max.apply(null, timerDelays) : 0,
          messageDelays: messageDelays.length,
          worstMessageDelay: messageDelays.length ? Math.max.apply(null, messageDelays) : 0
        }
      };
      console.log('COPY THIS LOW FPS REPORT:');
      console.log(JSON.stringify(report, null, 2));
      return report;
    }
  }

  console.log('Fate lag probe started. Wait ' + seconds + ' seconds.');
  setTimeout(timerLoop, 250);
  messagePing();
  requestAnimationFrame(frame);
})();
```

## What Not To Do Next

- Do not add another global `requestAnimationFrame` throttle.
- Do not enable the timer bridge by default.
- Do not assume CSS alone is the root cause.
- Do not repeatedly force full rerenders as a recovery strategy.
- Do not add more always-on diagnostics loops without checking their cost.

## Best Next Steps

1. Reproduce the issue in Firefox with DevTools closed and then with DevTools open.
2. Run the diagnostic above while stuck.
3. Compare stuck title screen vs normal title screen:
   - node count
   - animations count
   - rAF calls/sec
   - promise rate
   - timer delays
   - focus/hidden flags
4. Audit all listeners after leaving multiplayer:
   - room listener
   - players listener
   - actions listener
   - spectator listener
   - world chat listener
   - party listener
5. Add a debug function that reports active Fate-owned intervals/listeners if possible.
6. If Firefox focus/timer state is confirmed, build a small Firefox-specific resume path rather than a global timer monkey-patch.

## Session N+3: Multiplayer Desync Fix + Lighter FPS Diagnostics

The multiplayer action replay path had a real ordering bug. `subscribeActions()` used `lastActionSeq` as "highest sequence seen" and filtered future snapshots with `seq > lastActionSeq`. Firebase can expose action `N+1` before action `N` because sequence reservation and action payload write are separate operations. When that happened, action `N` was permanently ignored once it arrived later. That directly matches symptoms like one client missing a consolidation/cell click, then seeing cards appear late or in the wrong position.

Fix applied in `src/scripts/18-online-rooms.js`:

- Added an `actionReplayBuffer` keyed by sequence number.
- Incoming actions are buffered even if higher sequence numbers arrive first.
- Replay only drains contiguous actions starting at `lastAppliedActionSeq + 1`.
- `MATCH_START` is treated as an applied marker inside the same contiguous drain.
- Perf diagnostics now expose `onlineBufferedActions` and `onlineWaitingForActionSeq` when a client is waiting on a missing sequence.
- Room cleanup clears the buffer and pending drain state.
- The action listener now prefers Firebase `onChildAdded(query(... orderByKey(), startAt(nextSeqKey)))`, so active multiplayer receives incremental action children instead of re-downloading and sorting the full `actions` object after every click. It falls back to the buffered `onValue` path if that API is not available.

This is a deterministic sync fix, not a cosmetic latency fix. It should prevent the "opponent card exists on one screen but not the other" class of bugs caused by skipped actions.

Also applied in `src/scripts/21-smoothness-core.js`:

- The frame diagnostic loop now backs off to a 250ms timer while the page is hidden, Fate marks it hidden, or Firefox reports the page is not focused. It resumes full rAF cadence when focused/active.
- The hard compositor reset no longer forces synchronous layout with `offsetHeight`. It still toggles compositor-related styles across two animation frames.

Verified after patch:

- `node --check src/scripts/18-online-rooms.js`
- `node --check src/scripts/21-smoothness-core.js`
- Loaded `index.html` locally in the Codex in-app browser with no console warnings/errors.

## Session N+4: Full FPS Audit Findings

The user's criticism was correct: earlier fixes reduced symptoms but still left production-only diagnostic and RTDB work active. The audit found two high-confidence multiplayer/FPS causes:

### 1. Multiplayer still subscribed to the full room tree

Even after `actions` replay was made incremental, `watchRoom()` in `src/scripts/18-online-rooms.js` still used `onValue(ref("rooms/{code}"))`. In Firebase RTDB, every `actions/{seq}` child write triggers that full room listener. That means each multiplayer action re-downloaded/reprocessed the growing room object, including the growing action log and chat. Singleplayer does not do this work.

Fix:

- Replaced the full-room listener with small field listeners (`status`, `phase`, `guestUid`, `hostUid`, `mode`, `seed`, `song`, `currentTurnUid`, `lastActionSeq`, `startedAt`, `endedAt`).
- Moved room chat to its own `rooms/{code}/chat` listener.
- Kept `players` separate.
- Kept action replay on incremental `onChildAdded(orderByKey/startAt)`.
- Fixed lag-pause sequence comparison to use `Math.max(room.lastActionSeq, lastActionSeq)` so a stale room scalar cannot hide locally seen action progress.

This is the main local multiplayer performance fix. It removes growing per-action snapshot work that had no singleplayer equivalent.

### 2. FPS diagnostics were still production schedulers

`src/scripts/21-smoothness-core.js` still installed:

- a `requestAnimationFrame` wrapper to count rAF requests,
- a 60Hz frame diagnostics/watchdog loop,
- and `src/scripts/15-online-auth.js` still installed a `Promise.prototype.then` wrapper.

Even when lightweight, these run in normal play and are not part of the actual game. The previous trace already showed the diagnostics `tick` as a top idle rAF source.

Fix:

- rAF monitor is now opt-in: `fateEnableRafMonitor()`.
- Promise monitor is now opt-in: `fateEnablePromiseMonitor()`.
- 60Hz FPS watchdog is now opt-in: `fateEnableFpsWatchdog()` and can be disabled with `fateDisableFpsWatchdog()`.
- `fateTraceLag()` remains available for active measurements.
- `fatePerfReport()` now reports whether those monitors are enabled.

### 3. Spectator action replay had the same out-of-order risk

`src/scripts/22-spectator.js` used the old "highest seen seq" approach. Spectator mode is not the user's main complaint, but it could still skip late actions.

Fix:

- Spectator actions now use an action buffer and drain only contiguous sequences, matching player replay behavior.
- Spectator action listener also prefers `onChildAdded(orderByKey/startAt)`.

### 4. Remaining known non-game listeners

Still present, but not per-frame gameplay causes:

- `leaderboards/challenger` full listener in `19-online-elo.js`, active while signed in. This can be optimized later with a ranked query/limit, but it is not per-action multiplayer work.
- `liveMatches` full listener in Mission Control / live match browser.
- `matchmaking` full listener while queueing only.
- DM and world chat listeners are scoped/limited or only active when opened/signed in.

### Verification

- `node --check` passed for changed files:
  - `00-structural-helpers.js`
  - `15-online-auth.js`
  - `18-online-rooms.js`
  - `21-smoothness-core.js`
  - `22-spectator.js`
- Local `index.html` reload in Codex browser produced no console warnings/errors.

This still does not prove Firefox will never enter a compositor/timer 12 FPS state. It does prove the app no longer does the largest known avoidable multiplayer-local work: full-room re-downloads on every action plus always-on diagnostic rAF/Promise instrumentation.

## Files Most Likely Relevant

- `src/scripts/15-online-auth.js`
- `src/scripts/17-online-social.js`
- `src/scripts/18-online-rooms.js`
- `src/scripts/21-smoothness-core.js`
- `src/scripts/22-spectator.js`
- `src/scripts/06-rendering-and-helpers.js`
- `src/styles/zz-codex-last.css`
- `src/styles/99-ui-final.css`
## Session N+5 - Multiplayer local render/desync audit (2026-05-16)

Live trace from an older, not-fully-updated multiplayer build showed `actionSeq === appliedSeq`, no buffered actions, and no lag pause, so that sample was not waiting on network/action replay. The expensive samples were local render work: `performGameRender` reached roughly 35-37ms with only 12 board cards, enough to feel choppy even when sync is caught up.

Changes made in the current workspace:

- `src/scripts/06-rendering-and-helpers.js`
  - Added `renderBreakdowns` timing for slow `performGameRender` calls. Future `fateTraceLag()` output now includes per-section timing such as `boardSignatures`, `renderBoard`, `patchBoard`, `renderHand`, `renderZoneScores`, and `restoreViewportLock`.
  - Combined board render, structure, and cell-signature collection into one board traversal for the render path instead of walking the board three separate times.
  - Fixed `patchChangedBoardCells()` so patched cells update `has-card` / `cell-empty` classes when a card appears, moves, or leaves. This was a real stale-DOM risk.
  - Scoped the board cell patcher to `#board .cell[...]`. The previous selector searched the whole document, so modal/target-picker cells with the same `data-z/r/c` could be hit before the real board cell.
  - Disabled floating zone banner positioning in `fate-super-performance-mode`; those banners performed `getBoundingClientRect()` reads after board rebuilds and are decorative/duplicative.

- `src/scripts/05-gameplay-core.js`, `08-audio-and-meta-ui.js`, `10-init.js`, `14-enhancements.js`
  - Scoped active board-cell visual selectors to `#board .cell[...]` for placement highlights, tribute highlights, movement targets, sparkle/discard effects, and drag tribute targets.
  - Scoped board highlight clearing to `#board` so modal cells are not accidentally mutated.

- `src/scripts/21-smoothness-core.js`
  - `fatePerfReport()` and `fateTraceLag()` now include recent render breakdowns.

- HTML entry files
  - Bumped script cache keys in `index.html`, `fate-and-zones_1.html`, and `fate-and-zones_1_.html` for the touched runtime files so browsers do not keep running the old cached JavaScript after update.

Verification:

- `node --check` passed for all touched active scripts.
- Local browser smoke load of `http://127.0.0.1:8123/index.html` completed with no console errors or warnings from the changed scripts.

Retest note:

The user's live trace was from an older game build, so it should be treated as a clue, not a measurement of these latest patches. After updating the game, run a focused trace with the game page focused, not DevTools focused, because the prior trace had `hasFocus:false` which can distort browser rAF/fps behavior.

## Session N+6 - Post-update trace follow-up (2026-05-16)

New compact trace after the update showed progress and a remaining hot path:

- `floatingBanners: 0`, confirming the decorative floating banner layout path is gone in super performance mode.
- Watchdog/probe monitors were disabled (`fpsWatchdogEnabled:false`, `rafMonitorEnabled:false`, `promiseMonitorEnabled:false`), so old recovery loops are not causing the current samples.
- Measured average FPS improved to about 40, but frame pacing still had 50-150ms gaps.
- `performGameRender` remained high (`avgMs ~23.7`, `maxMs 49`) even with only 6 board cards.
- `recentRenderBreakdowns` showed every slow render requested all parts: `board,hand,scores,piles,oppHand,blocks,topbar`.
- `updateTopBar` alone was 7-12ms in the slow samples, mostly because it always called player banner fitting/effect rebuilding.

Changes made:

- `src/scripts/06-rendering-and-helpers.js`
  - Added signatures around `updateTopBar()` so unchanged topbar shell text/button state, player banners, and topbar effect pills are skipped instead of rebuilt every full render.
  - Gated `normalizeActionBarLayout()` behind a child-layout signature so it does not scan/move action buttons on every topbar refresh.
  - Bumped `06-rendering-and-helpers.js` cache key in all HTML entry files to `1778889300`.

Expected next trace:

- `updateTopBar` should drop sharply or disappear from most `recentRenderBreakdowns` unless the turn/player/effect state changed.
- If `performGameRender` is still high, the next target is reducing broad `renderGame()` calls that dirty all parts when only hand/topbar/scores changed.

## Session N+7 - DOM/board patcher pass (2026-05-16)

The user asked to go all-in on DOM issues. A likely board churn bug was found in the render diffing layer:

- The board "structure signature" included interaction state (`currentPlayer`, `placing`, selected card, targeting/consolidation state, blocked cells). That meant many interaction changes looked like physical board structure changes, so `patchChangedBoardCells()` was bypassed and the whole board rebuilt.
- Cell signatures only tracked card data, so patching could miss cell class changes like `blocked`, `no-consolidate`, and Mark safe-square states.

Changes made:

- `src/scripts/06-rendering-and-helpers.js`
  - Structure signature now tracks physical board layout only: viewer orientation, row/column counts, `extraRows`, and `extraCells`.
  - Cell signatures now include card state plus cell visual state: selected card, occupied/empty, extra-safe, Carolyn/Zoe block class, and Mark safe-square class.
  - `patchChangedBoardCells()` now applies cell classes as well as card DOM.
  - Changed patch queries from document-wide selectors to board-scoped selectors.
  - Added broad render caller attribution into `window.__fatePerf.renderCallerStats`.

- `src/scripts/21-smoothness-core.js`
  - `fateTraceLag()` snapshots now include top broad-render callers as `renderCallers`.

- `src/scripts/05-gameplay-core.js`
  - Converted the first high-confidence broad render calls in turn cleanup, board targeting, block placement, Mark safe-square placement, and movement flows to scoped renders.

Verification:

- `node --check` passed for `05-gameplay-core.js`, `06-rendering-and-helpers.js`, and `21-smoothness-core.js`.
- Cache keys for those scripts were bumped to `1778890400`.

## Session N+8 - Off-turn inspection and perspective piles (2026-05-16)

User reported two multiplayer correctness issues:

- They could not click their own cards for the information window on the opponent's turn.
- Deck/discard pile UI was synced to only one player's piles in multiplayer.

Root causes found:

- `renderHand()` used `cp === G.currentPlayer` as both "this is my hand" and "I can act from hand." On opponent turns that removed the click handler entirely, so cards could not be inspected.
- The static pile markup hardcoded `showDeckInfo(0)` and `showDiscard(0)`, so the guest/client perspective could open player 0's piles.
- `openCardDetail()` added hand action buttons whenever `fromHand` was true, without a single explicit "local player owns this hand card and it is their turn" gate.

Changes made:

- `src/scripts/06-rendering-and-helpers.js`
  - Split hand state into `canInspectHand` and `canActFromHand`.
  - Own hand cards remain clickable for the card-info modal on the opponent's turn.
  - Hand actions (`Place on Board`, `Consolidate`, hand-only activations) now require the card to be in the local player's hand, the local player to be `G.currentPlayer`, main phase, and not spectator mode.
  - `renderPiles()` assigns deck/discard clicks from `getPerspectivePlayerIndex()` / `getPerspectiveOpponentIndex()` instead of relying on static player 0 handlers.
  - Deck-set effects for Polish/Maja are turn-gated so opening your deck off-turn cannot expose a set action.

- `index.html`, `fate-and-zones_1.html`, `fate-and-zones_1_.html`
  - Replaced hardcoded player 0 pile onclick handlers with perspective-based handlers.
  - Bumped `05-gameplay-core.js` and `06-rendering-and-helpers.js` cache keys to `1778890800`.

Verification:

- `node --check` passed for `06-rendering-and-helpers.js` and `05-gameplay-core.js`.
- Browser smoke loaded `http://127.0.0.1:8124/index.html` with zero console errors.

## Session N+9 - 12 FPS global browser-cap proof (2026-05-16)

The user captured the 12 FPS issue live again. This time the evidence ruled out the multiplayer and game-render paths.

Trace findings:

- `fateTraceLag(20)` was run while the active screen was `s-deck`, not `s-game`.
- The game was offline in that trace: `isOnline:false`.
- The game board was not rendered on screen: `.zone:0`, `.cell:0`, `.bc:0`, `.hc:0`.
- `renderSummary`, `recentRenderBreakdowns`, `renderCallers`, and `recentRenderSamples` were empty.
- The frame cadence was a stable 66.7-83.3ms pattern, roughly 12-15 FPS.
- Focused-page A/B tests showed:
  - Disabling all animations/transitions did not recover FPS.
  - Removing deck shadows/filters/overlays did not recover FPS.
  - Hiding deck card images only slightly changed the result.
  - `#db-collection { display:none }` did not recover FPS.
  - A mostly blank focused document still measured about 17 FPS.
- A later probe with DevTools closed and full viewport (`1920x947`) still measured:
  - Current page normal: about 13 FPS.
  - Current page blank: about 13 FPS.
  - A Worker interval in the same page still ran at about 60/61Hz.
- Built-in hard compositor reset (`fateRecoveryProbe`) failed:
  - Before: 12 FPS.
  - After hard reset: 13 FPS.
- A fresh blank popup/window was also capped:
  - Popup blank document: 7 FPS overall, with normal slow gaps still around 66.7-83.3ms and one very long stall.

Conclusion:

This specific 12 FPS failure is not caused by multiplayer networking, room listeners, deck card DOM, board rendering, images, CSS animations, or a busy JS main thread. It is a browser/window/GPU-process level main-page rendering/rAF throttle. Since a blank popup is also capped, the poisoned state is likely global to the browser window/process, not just the Fates tab. Worker timing can stay healthy, but the main document paint/rAF cadence is capped, so no DOM/render optimization can make the browser display at 60 FPS while this state is active.

Practical next direction:

- Add a first-class "browser render throttle detected" diagnostic and user-facing recovery path instead of continuing to blame renderBoard/multiplayer.
- During online games, preserve/rejoin state before recommending reload/restart.
- Consider a Worker-backed timer bridge for gameplay timers only, but do not expect it to fix visual smoothness because painting is still main-document/browser controlled.

Follow-up code change:

- `src/scripts/21-smoothness-core.js`
  - Added a small lifecycle event ring buffer to `window.__fatePerf.lifecycleEvents`.
  - `fatePerfReport()` and `fateTraceLag()` now include recent lifecycle events so the next poison event can be correlated with `blur`, `focus`, `visibilitychange`, `pagehide`, `pageshow`, `resize`, or user wake events.
  - Cleared stale `focusThrottled` state on focus/visible/user wake so future reports do not incorrectly show focus throttling while `document.hasFocus()` is true.
  - Bumped `21-smoothness-core.js` cache key to `1778891100`.

Additional title-screen trace:

- The poisoned state was reproduced on `s-title` before any game/multiplayer render work.
- Lifecycle buffer showed the trigger pattern clearly:
  - Full viewport `1920x947`.
  - Resize to `1920x393`, then `blur` while still `document.hidden:false` (consistent with docked DevTools/console or browser UI taking focus).
  - Later focus and resize back to `1920x947`.
  - rAF remained capped around 15 FPS afterward.
- Render evidence was still empty: `renderSummary:{}` and `renderCallers:[]`.

Mitigation added:

- `src/scripts/21-smoothness-core.js`
  - Added lightweight browser render-throttle probes after focus, visible, resize, and user-wake events.
  - If the page is visible/focused, no heavy render samples are active, and the main document cadence remains <=24 FPS with large gaps, the app shows a "Browser render throttle detected" recovery banner.
  - The banner offers a Refresh action because the user confirmed refresh clears this poisoned browser state.
  - Probe results are recorded as `browserRenderThrottleLastProbe` / `browserRenderThrottleLast` in `fatePerfReport()` and `fateTraceLag()`.
  - Bumped `21-smoothness-core.js` cache key to `1778891200`.

Recovery hardening after user reported the banner/tool did not fix the frequent throttle:

- The recovery banner now stops implying compositor reset can help. It says the proven recovery is a clean reload.
- `src/scripts/21-smoothness-core.js`
  - Saves render-throttle reload context to `sessionStorage.fateRenderThrottleReload`.
  - Adds `window.fateReloadForRenderThrottle()`.
  - Adds an optional in-banner auto-reload toggle backed by `localStorage.fateAutoReloadRenderThrottle`.
- `src/scripts/18-online-rooms.js`
  - Adds `window.fateResumeOnlineRoom(code)`.
  - Allows `joinRoom(..., {allowStarted:true})` to resume a room already in `matchup`, `starting`, or `playing` when the signed-in user is host/guest.
  - On startup, consumes `sessionStorage.fateRenderThrottleReload` / `fateLastOnlineRoomBeforeRenderThrottleReload` and attempts to rejoin the room.
- Cache keys for `18-online-rooms.js` and `21-smoothness-core.js` bumped to `1778891400`.

Zone banner correction:

- The earlier DOM perf pass disabled detached floating zone banners while `fate-super-performance-mode` was active. Since the later traces proved the 12 FPS poison survives on blank/title/popup documents, those banners were not the root cause.
- `src/scripts/06-rendering-and-helpers.js` now keeps `syncFloatingZoneBanners()` active in super performance mode again.
- Bumped `06-rendering-and-helpers.js` cache key to `1778891300`.
