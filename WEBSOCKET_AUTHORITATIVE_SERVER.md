# WebSocket Authoritative Server

This repo now includes a dependency-free Node WebSocket authority:

```powershell
npm run server:ws
```

By default it listens on `0.0.0.0:8787` and verifies Firebase ID tokens for
project `fates-entwined-41491`.

## Local test

1. Start the authority server:

   ```powershell
   npm run server:ws
   ```

2. In the game console, point the client at it:

   ```js
   fateSetWebSocketAuthorityUrl('ws://127.0.0.1:8787')
   ```

3. Start or join an online room. During the match, action intents go to the
   WebSocket server first. Accepted actions are assigned server sequence numbers.
   The server keeps accepted actions in a Fly-owned room event log before
   broadcasting them. When Firebase Admin credentials are configured, it can also
   mirror accepted actions to the Firebase action log.

For RTDB-disconnect testing, enable Fly replay/authority-only mode:

```js
fateEnableFlyAuthority('ws://127.0.0.1:8787', { rtdbDisabled:true })
```

This sets the client to replay actions from `GET /api/rooms/{code}/events`
instead of subscribing to `rooms/{code}/actions` in RTDB. It also prevents
failed WebSocket sends from falling back to Firebase writes.

To disable it:

```js
fateSetWebSocketAuthorityUrl('')
```

To inspect the client connection:

```js
fateGetWebSocketAuthorityStatus()
```

## Hosting

Set these environment variables on the host if needed:

```txt
PORT=8787
FIREBASE_PROJECT_ID=fates-entwined-41491
FIREBASE_DATABASE_URL=https://fates-entwined-41491-default-rtdb.firebaseio.com
FATE_WS_REQUIRE_TOKEN=1
FATE_WS_DISABLE_FIREBASE_RTDB=1
FATE_RTDB_DISABLED=1
FATE_WS_DURABLE_WRITES=off
FATE_WS_REQUIRE_DURABLE_WRITES=0
FATE_WS_MAX_ROOM_EVENTS=1200
FATE_WS_DATA_DIR=/data/fate-authority
FATE_WS_FLY_STORE=1
FATE_WS_REQUIRE_FLY_STORE=1
FATE_WS_STATE_GATE=1
FATE_WS_REDUCER_MODE=strict
```

The checked-in `fly.toml` pins the Fly process to
`node server/fate-ws-authority.js`; this avoids accidentally launching the
Electron desktop `npm start` command on Fly. It also sets the same strict,
volume-backed, no-RTDB values above and keeps one authority machine warm
(`auto_stop_machines='off'`, `min_machines_running=1`) so live WebSocket matches
are not interrupted by platform sleep. Run `npm run smoke:fly-config` before
deploying to verify the process command, mounted volume path, reducer mode,
machine lifecycle, and RTDB kill-switch flags. Run
`npm run smoke:fly-local-runtime` to verify the local Fly wrapper boots with the
same no-RTDB runtime contract and persists room state to its volume directory.
The Dockerfile is also authority-only: it copies `server/`, the card catalog
source file, and `fates-entwined-website/`, then starts
`node server/fate-ws-authority.js` without installing Electron desktop tooling.
The checked-in `.dockerignore` is a default-deny allowlist for those same
runtime inputs, so Fly deploys do not accidentally upload Electron builds,
desktop assets, old backups, or other non-authority bulk data.

For the full Fly cutover preflight, run:

```powershell
npm.cmd run smoke:fly-cutover
```

That single gate runs the Fly config, local runtime, volume-store, browser
test-readiness, RTDB rules, RTDB-disconnect, App Check, WebSocket authority,
reducer, state-gate, strict reducer, bootstrap, and card-catalog smokes. The Fly
deploy command is:

```powershell
npm.cmd run deploy:fly-authority
```

The npm `predeploy:fly-authority` hook runs `smoke:fly-cutover` before
`fly deploy --config fly.toml`, so a Fly publish cannot be started through npm
without the same cutover gate passing first.

For phone testing after that deploy, the authority can accept token-gated static
file overrides into the Fly volume. Set the secret once:

```powershell
fly secrets set FATE_STATIC_HOTFIX_TOKEN="<long random token>"
```

Then publish only the files you changed:

```powershell
$env:FATE_STATIC_HOTFIX_TOKEN="<same token>"
npm run hotfix:fly-static -- index.html src/scripts/18-online-rooms.js
```

This updates the hosted browser game at `https://fates-entwined-main.fly.dev/`
without rebuilding the whole Fly image. The route is disabled unless
`FATE_STATIC_HOTFIX_TOKEN` is set, and JS/CSS/HTML/JSON/manifest files are
served with no-store headers so phone refreshes pick up the latest override.

For local browser testing before deploy, start the local Fly-shaped authority:

```powershell
npm.cmd run server:fly-local
```

Then enable the browser client with either a console helper:

```js
fateEnableLocalFlyAuthorityForTesting()
```

or by loading the game with `?flyTest=1`. For custom endpoints, use
`?flyTest=1&flyWs=ws://127.0.0.1:8787&flyApi=http://127.0.0.1:8787`, or pass
`{ url, apiUrl }` to `fateEnableLocalFlyAuthorityForTesting(...)`.
`fateGetWebSocketAuthorityStatus()` should report `rtdbDisabled:true`,
`flyRooms:true`, `authorityOnly:true`, `firebaseActionFallbackAllowed:false`,
`firebaseRoomTransportAllowed:false`, `url:'ws://127.0.0.1:8787'`, and
`apiUrl:'http://127.0.0.1:8787'` for the local no-RTDB test path.
Use `fateDisableFlyAuthority()` to clear the local browser test switches and
close any active authority socket.

For RTDB-disconnect/Fly-primary deployment, keep
`FATE_WS_DISABLE_FIREBASE_RTDB=1`. Firebase Auth token verification still works,
but the authority will not request Firebase admin database tokens, read
`rooms/*`, or mirror accepted actions/results to RTDB even if service account
credentials are present. `/health` and `/api/health` expose
`firebaseRtdbDisabled:true` and `firebaseDurableWrites:false` for deployment
verification.

Run `npm run smoke:rtdb-disconnect-static` before deploys that claim
RTDB-disconnect readiness. It checks that auth does not initialize RTDB when the
kill switch is active, that client global-feed modules fail closed before legacy
Firebase fallbacks, and that Fly config/Docker deploy inputs remain
authority-only.

Run `npm run smoke:rtdb-appcheck-static` before enabling RTDB App Check
enforcement. It verifies the browser initializes App Check with reCAPTCHA v3 and
token auto-refresh before `getDatabase(app)`, and that Firebase's debug App
Check provider can only be enabled on local/file hosts rather than a production
hostname.

Run `npm run smoke:rtdb-rules-lockdown` before publishing RTDB rules. It parses
the checked-in server-authoritative rules file and verifies the expensive global
collections still require authenticated capped indexed queries, while legacy
whole-node reads such as `publicDecks`, `challengerAI/seasons/$season`, and
`matchResults` stay closed.

The repo now includes `firebase.json` and `.firebaserc` so Firebase CLI deploys
target the locked rules file and the `fates-entwined-41491` project instead of
depending on local machine defaults. The RTDB rules deploy flow is:

```powershell
npm.cmd run smoke:rtdb-rules-lockdown
npm.cmd run smoke:rtdb-disconnect-static
npm.cmd run smoke:rtdb-appcheck-static
npm.cmd run deploy:rtdb-rules
```

Only run the deploy command when you are ready to publish RTDB rules; it is
scoped to `firebase deploy --only database --project fates-entwined-41491`.
The `predeploy:rtdb-rules` npm hook runs the rules, disconnect, and App Check
smokes automatically before the deploy command. After deploying, watch Firebase
App Check metrics; enable RTDB App Check enforcement in the Firebase Console only
after legitimate clients show valid App Check tokens.

For legacy durable server-side Firebase writes, first leave
`FATE_WS_DISABLE_FIREBASE_RTDB` unset or set it to `0`, then provide one of:

```txt
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

or:

```txt
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

`/health` reports whether durable writes are active:

```json
{"ok":true,"flyActionReplay":true,"flyDurableStore":true,"flyDurableStoreReady":true,"durableWrites":false}
```

For production, use `wss://...` in the client:

```js
fateSetWebSocketAuthorityUrl('wss://your-server.example.com')
```

Firebase still handles auth in this phase. The WebSocket/Fly service now owns
match action ordering, turn/player validation, room event replay, private room
and queue transport, public profile/leaderboard mirrors, lightweight party
state, capped world chat, friends, direct messages, spectator/live-match
discovery, marketplace, public decks, and player cloud-save slices in
RTDB-disabled mode. Firebase Auth is still used for identity, and any non-Fly
fallback paths remain Firebase-backed until the final cutover.

Useful HTTP endpoints:

```txt
GET  /api
GET  /api/leaderboards/challenger?limit=100
GET  /api/profiles/{uid}
POST /api/profiles/{uid}
GET  /api/match-results?uid={uid}&limit=30
GET  /api/marketplace/listings?limit=160
POST /api/marketplace/listings
POST /api/marketplace/listings/{listingId}/buy
POST /api/marketplace/listings/{listingId}/cancel
POST /api/marketplace/redeem
GET  /api/public-decks?limit=60
POST /api/public-decks
GET  /api/public-decks/{deckId}
POST /api/public-decks/{deckId}/delete
POST /api/public-decks/{deckId}/rating
POST /api/public-decks/{deckId}/comments
GET  /api/live-matches?limit=16
GET  /api/social/state?uid={uid}
GET  /api/social/lookup?term={query}
POST /api/friends/request
POST /api/friends/accept
POST /api/friends/decline
POST /api/friends/remove
GET  /api/direct-messages/{peerUid}?uid={uid}&limit=80
POST /api/direct-messages/{peerUid}
GET  /api/world-chat?limit=100&after=0
POST /api/world-chat
POST /api/parties
GET  /api/parties/{partyId}?uid={uid}
POST /api/parties/{partyId}/invite
POST /api/parties/{partyId}/accept
POST /api/parties/{partyId}/decline
POST /api/parties/{partyId}/leave
GET  /api/matchmaking?mode=ranked
POST /api/matchmaking/enter
POST /api/matchmaking/leave
POST /api/rooms
GET  /api/rooms?uid={uid}&includeEnded=0&limit=10
GET  /api/rooms/{code}
POST /api/rooms/{code}/spectators/join
POST /api/rooms/{code}/spectators/heartbeat
POST /api/rooms/{code}/spectators/leave
POST /api/rooms/{code}/join
POST /api/rooms/{code}/heartbeat
POST /api/rooms/{code}/leave
POST /api/rooms/{code}/player
POST /api/rooms/{code}/preload
POST /api/rooms/{code}/progress
POST /api/rooms/{code}/start
GET  /api/rooms/{code}/events?after=0&limit=300
GET  /api/rooms/{code}/chat?after=0&limit=80
POST /api/rooms/{code}/chat
GET  /api/player-save/{uid}
POST /api/player-save/{uid}
```

Room detail and event replay endpoints require a Firebase ID token for a seated
player when `FATE_WS_REQUIRE_TOKEN=1`.

## Fly Volume Store

The Fly authority server can persist rooms and accepted events without RTDB by
mounting a Fly volume at `/data` and setting `FATE_WS_DATA_DIR`:

```powershell
fly volumes create fate_authority_data --region lax --size 1
fly deploy
```

The current `fly.toml` expects that volume. On boot, the server restores
`rooms.json`; during matches, it appends accepted events to `events.jsonl` and
refreshes `rooms.json` atomically. This is suitable for a single-primary Fly
authority machine. Multi-machine active/active authority still needs an external
database or a single-room ownership router.

The append-only event log is also used as a repair source on boot. If
`rooms.json` is stale, the server replays newer accepted events from
`events.jsonl` into the in-memory room and refreshes the snapshot. If
`rooms.json` is missing, `MATCH_START` events rebuild the minimum room/player
shape and later accepted events restore sequence, canonical state, room status,
and replay history.

Restored rooms also rearm server-owned lifecycle timers. Pending reaction
windows are scheduled again from canonical state, and disconnected seated
players resume their remaining disconnect grace from the persisted `lastSeen`
timestamp instead of receiving a fresh full grace window after a Fly restart.

On `SIGTERM`/`SIGINT`, the authority stops accepting non-health traffic, waits
briefly for room mutation queues, marks live sockets disconnected, writes a
final Fly room snapshot, closes WebSockets with a restart code, and exits. This
keeps Fly deploy/restart behavior aligned with the same reconnect grace path as
unexpected disconnects.

## Professional Authority Phase Gates

This migration is intentionally phased. Do not treat a phase as complete
server-authoritative multiplayer until its gate is satisfied:

1. **Transport and RTDB-disconnect bridge**: Fly owns room event replay, private
   room create/join/deck/start paths, and the client can run with RTDB fallback
   disabled. When Fly replay, Fly rooms, authority-only mode, RTDB-disabled mode,
   or a configured WebSocket authority is active, gameplay actions fail closed
   instead of downgrading to Firebase action-log/player-node writes.
   WebSocket intents, match start, reaction timeouts, and disconnect timeouts
   also enter one per-room mutation queue, so accepted actions cannot compute
   duplicate sequence numbers while another mutation is awaiting persistence.
   Retried WebSocket intents are idempotent by seated user plus
   `clientActionId`: the server replays the original accepted event instead of
   sequencing a duplicate action, and rejects attempts to reuse the same
   `clientActionId` for a different action type.
   The browser bridge preserves that contract by assigning a stable
   `clientActionId` before the first send and retrying transient authority
   timeout/disconnect failures with the same id while Fly authority/fallback-off
   modes are active. Retry eligibility follows the actual fallback policy:
   whenever a configured WebSocket authority disables Firebase action fallback,
   the browser may make bounded same-id retry attempts.
   When the accepted event is an echo of a locally optimistic action, the client
   skips duplicate local mutation but still acknowledges the authoritative
   sequence/hash and pending-reaction metadata from the server event.
    Before applying and sending an optimistic local intent on a no-fallback
    authority path, the browser also calls Fly `/resume` from the last locally
    applied sequence, buffers/drains any missed accepted events, and refreshes
    the latest server state hash. If that preflight catch-up fails, the local
    mutation is blocked instead of being applied against stale state.
    Room chat and per-player replay progress also use Fly room endpoints in Fly
    room mode, so RTDB-disabled private rooms no longer need Firebase chat or
    `players/{uid}/actionSeq` writes to keep in-game chat and lag diagnostics
    moving.
    Random matchmaking also enters through Fly in Fly room mode:
    `POST /api/matchmaking/enter` either atomically joins a compatible waiting
    room or creates a new waiting Fly room, and `POST /api/matchmaking/leave`
    removes the queue entry without touching RTDB. The Challenger and Free Play
    matchmaking screens accept the Fly room transport as an online queue
    transport, so Firebase RTDB is no longer required just to open the human
    queue path.
    Room departure uses `POST /api/rooms/{code}/leave`: lobby hosts delete the
    Fly room, lobby guests release their seat, and active matches mark the player
    disconnected for the server-owned disconnect timeout path.
    The browser's Fly room watcher also calls `POST /api/rooms/{code}/heartbeat`
    on a throttle to refresh `lastSeen`, reassert `connected`, and clear stale
    disconnect timers without Firebase `.info/connected`.
    The same Fly room watcher now drives queued-room auto-start when a matched
    guest appears with a ready deck, and Fly lobby rendering uses the room's
    profile snapshots rather than subscribing to RTDB public profiles for seated
    players. Room-scoped browser operations also route by the actual normalized
    Fly room, so deck selection, chat, preload readiness, progress reports,
    host start, leave cleanup, and legacy player-node fallback guards do not
    touch RTDB for a known Fly room even if a global enable flag is stale. The
    server also exposes seated-room discovery through `GET /api/rooms?uid=...`;
    the browser uses it during startup to recover the most recent active Fly
    room without scanning Firebase rooms.
    Server-finalized result ledgers also feed Fly-owned profile, match-result,
    and Challenger leaderboard mirrors. `19-online-elo.js` reads that Fly
    leaderboard in RTDB-disabled/Fly-room mode through the existing
    `FateOnline.getOnlineLeaderboard()` hook. `15-online-auth.js` also syncs
    public profile identity to `POST /api/profiles/{uid}`, skips RTDB
    presence writes in Fly/RTDB-disabled mode, and no longer exports a live
    `FateOnline.rtdb` handle when RTDB is disabled. `17-online-social.js` now also
    uses Fly social state, parties, and capped world chat in RTDB-disabled mode,
    while pausing friends/direct messages instead of opening RTDB listeners.
    `20-online-economy.js` also uses Fly marketplace and public-deck endpoints
    in RTDB-disabled mode for capped feed reads, card listing, buy/cancel/redeem,
    deck publish/detail/delete, ratings, and comments.
2. **Authoritative reducer**: the Fly server applies card/game rules itself and
   rejects illegal intents without trusting `payload.postState`.
   In strict reducer mode, WebSocket gameplay intents may be compact: the client
   sends intent fields plus `baseStateHash`, and the server produces `postState`
   itself for accepted events instead of requiring a client snapshot.
3. **Durable state**: room snapshots, event logs, reconnect state, and match
   results survive Fly machine restarts through the mounted Fly volume store or
   a real external database.
4. **Lifecycle and results**: match end, win/loss, forfeit, disconnect timeout,
   ELO, and rewards are server-finalized, idempotent, and replayable.
5. **Abuse controls**: rate limits, payload size caps, token/App Check
   enforcement, reconnect windows, and audit logging are enabled in production.

## State Gate

`FATE_WS_STATE_GATE=1` enables the first reducer-phase guard. The client sends a
`baseStateHash` before local mutation and a canonical `postState` plus
`stateHash` after the mutation. The server rejects:

- malformed canonical states,
- tampered `stateHash` values,
- stale/forked `baseStateHash` values,
- basic action-specific illegal transitions such as an `END_TURN` that does not
  pass priority to the opponent.

This is a professional migration guard, not the final rules engine. The final
authoritative reducer still needs server-side card/rule execution so the server
produces the next state from the intent instead of accepting a client-proposed
`postState`.

`FATE_WS_REDUCER_MODE` controls how far the server reducer goes:

- `lineage`: verify state lineage/hash, then accept the client-proposed
  `postState`.
- `turns`: server-build the `MATCH_START` opening state and server-reduce
  `CHOOSE_TURN`, `END_TURN`, and `FORFEIT`; keep lineage validation for
  card/gameplay actions whose server reducers are not implemented yet.
- `strict`: only accept actions with implemented server reducers. Unsupported
  card/gameplay actions are rejected instead of being treated as authoritative.

The deployed Fly config uses `turns` because it is playable while making
lifecycle actions server-produced. Moving to `strict` is the professional target,
but it should wait until card placement, board actions, hand actions, modal
choices, and picker choices all have server reducers.

Strict reducers currently implemented:

- server-owned `MATCH_START` opening state from seed and the two 40-card decks,
- `CHOOSE_TURN`,
- `END_TURN`,
- `FORFEIT` with server-derived loser/winner, canonical final match state, and
  Fly room winner/loser/end-reason metadata plus a server-finalized reward/ELO
  ledger,
- `DISCONNECT_TIMEOUT` generated by the Fly authority server after the configured
  disconnect grace window, with canonical final match state and
  winner/loser/end-reason metadata plus a server-finalized reward/ELO ledger,
- `MATCH_RESULT` with server-computed zone scores, zone-majority winner,
  total-Fate tiebreaker, official draw handling, canonical final match state,
  Fly room winner/loser/draw metadata, and server-finalized reward/ELO ledger
  metadata,
- deterministic continuous `MATCH_RESULT` score parity for face-down/no-bonus
  cards, Jimmy damage Fate, Greek Hoplite copy scaling, Soviet Grenadiers
  adjacency, coordinator auras plus Jeremiah scaling, Post-Modernist Dylan
  penalties, Zsofia, Maroon Knights, Duncan Heyward, Bobby Jones, Cook Islands
  Duelist stable target-memory scoring, and existing landscape/multiplier
  modifiers,
- `HAND_ACTION` `placeSelected` for metadata-plain Supporter placement arming
  and whitelisted real passive/consolidation/picker/effect Supporters (`05`,
  `09`, `16`, `18`, `20`, `24`, `26`, `28`, `31`, `32`, `33`, `42`, `47`,
  `37`, `49`, `50`, `52`, `53`, `54`, `58`, `60`, `62`, `63`, `64`, `65`, `68`, `69`, `70`, `71`,
  `72`, `73`, `74`, `75`, `76`, `78`, `79`, `80`, `91`),
- `START_CONSOLIDATE` for metadata-plain zero-cost character placement arming,
- `START_CONSOLIDATE` / free placement support for whitelisted real character
  effect cards (`01`, `02`, `03`, `04`, `06`, `07`, `10`, `11`, `12`, `13`, `14`,
  `15`, `17`, `19`, `21`, `22`, `23`, `27`, `29`, `30`, `34`, `35`, `36`, `38`,
  `39`, `40`, `41`, `43`, `45`, `46`, `48`, `51`, `55`, `56`, `57`, `61`, `66`,
  `67`, `77`, `83`, `90`),
- `START_CONSOLIDATE` plus consolidation `CLICK_CELL` tribute
  selection/finalization for metadata-plain paid characters using only normal
  one-reinforcement Supporter tributes,
- Alexander the Magnificient (`35`) Fate snapshot from friendly Supporters
  remaining in the placement zone after tribute spend,
- United Nations 5th Army (`09`) as a special consolidation tribute worth two
  reinforcement while it has uses remaining, including server-side use decrement
  and discard preservation,
- Great Oak Infantry (`47`) as a special consolidation tribute that gives the
  consolidated card +3 permanent Fate,
- Boleslaw Kopewicz (`86`) as a special consolidation tribute worth three
  reinforcement that gives the consolidated card +4 permanent Fate,
- Ralph's Courtesy Clerk (`24`) as a board-local adjacency reinforcement
  modifier for consolidation tribute candidates,
- Colombo Thug (`53`) as a target-zone restriction that rejects cross-zone
  tribute finalization,
- Berkeley CS Major / Artillery Distance (`50`) locked-zone tribute exclusion,
  placement, and `MODAL_ACTION` zone choice,
- Howard (`03`) placement with `PICK_ZONE` same-zone Fate doubling,
- Zoe (`04`) placement with final `CLICK_CELL` same-zone opponent consolidation
  block and Carolyn-lock rejection,
- Jorge Alvarez (`06`) placement with non-Star deck search through server-owned
  `PICK_CARDS_VISUAL`,
- Maja Kaminska (`07`) placement with deck/discard Supporter search through
  server-owned `PICK_CARDS_VISUAL` plus Supporter-limit override continuation,
- Lina (`08`) placement with deck/discard Reality search through server-owned
  `PICK_CARDS_VISUAL` into strict free placement with Supporter-limit bypass,
- Johnathan Kirby (`13`) placement with deck Supporter search through
  server-owned `PICK_CARDS_VISUAL`,
- Isaac Perez (`22`) placement with server-counted orthogonal-adjacency
  Supporter-placement boost,
- Carolyn (`17`) placement with final `CLICK_CELL` permanent all-board cell
  lock, including upgrade of existing Zoe locks,
- Santiago (`30`) placement and `PICK_ZONE` same-zone opponent Fate halving,
  including immunity and Shield Wall rejection,
- Juan Carlos (`39`) placement with `PICK_ZONE` opponent-card selection and
  final `CLICK_CELL` movement into Juan Carlos' zone,
- Mark Kemper (`43`) placement with final `CLICK_CELL` extra safe-square
  creation using canonical `extraRows`/`markSafeSquares` state,
- Anicka Konvicka (`02`) placement with Starlit Path extra safe row plus
  same-zone placement Fate bonus for later cards,
- Henry Dong (`21`) placement and strict manual `BOARD_ACTION` activation with
  server-owned `PICK_CARDS_VISUAL` hand-discard Fate boost,
- Zimbabwean Honor Guard (`25`) placement with once-per-turn free extra-copy
  placement from hand/deck and free-placement Supporter-limit bypass,
- Jake (`38`) placement and strict manual `BOARD_ACTION` activation with
  server-owned Supporter-only hand discard, Fate boost, and once-per-turn
  source locking,
- 17th British Regiment of Africa (`05`) placement and `PICK_ZONE` same-zone
  Fate gain,
- Makenna (`12`) paid Coordinator consolidation placement and multi-target
  `PICK_ZONE` friendly immunity,
- MINAE Death Squad (`16`) placement and `PICK_ZONE` opponent Supporter discard,
- 1st US Marines (`18`) suppression state and suppressed-player end-turn
  cleanup,
- South Wind Spearman / Shield Wall (`20`) placement with zone movement locks,
- UCPD (`26`) opponent-hand reveal state,
- Kazumi (`27`) paid consolidation draw-three, including shared draw handling,
- 2nd Polish-Lithuanian Army (`28`) set-use counter initialization,
- Dylan Kirby (`29`) paid consolidation placement with server-owned
  `PICK_CARDS_VISUAL` search for up to two Third Great War cards from deck or
  discard,
- Oathbound Noble Fighter (`31`) placement and `PICK_ZONE` same-zone Fate loss,
  including immunity and Shield Wall rejection,
- Temecula Resident (`32`) draw-one, including shared draw handling,
- shared draw handling applies West Caribbea hand-arrival bonus and armed
  Christopher Erbs Fate bonus, and pauses on a server-owned Christopher Erbs
  activation/decline modal when that optional draw response is available,
- West Coast Dreaming (`igb9`) outside-draw bonus as a server-owned optional
  `PICK_ZONE` board-target +3 Fate choice, including cancel and after-draw
  continuation support,
- Frontier of Innovation (`igb2`) and Qingdao Breakthrough (`igb8`) end-turn
  zone choices as strict `PICK_LANDSCAPE_ZONE` reducers, including
  non-current-player chooser validation, duplicate-resolution rejection, zone
  Fate bonus, extra safe-row creation, and final score accounting for canonical
  landscape zone bonuses,
- Christopher Erbs (`40`) direct `BOARD_ACTION` `triggerCharacterEffect`
  arming for the next draw, with use decrement, already-armed rejection, and
  legacy/render-v2 card modal buttons aligned to the strict reducer,
- manual `BOARD_ACTION` board discard with ALPINE Infantry rejection, Artillery
  leaving-field flag, Lydia aura unsuppression, Wine Country infiltration, and
  Robo-stolen return-to-deck handling,
- `BOARD_ACTION` face-down board reveal with supported placement/when-set
  resolution after reveal,
- `BOARD_ACTION` deferred when-set activation for supported server reducers,
  requiring a same-turn canonical `_pendingWhenSetEffect`,
- Panacea (`igb7`) Eventide landscape `BOARD_ACTION` movement with server-owned
  target validation, once-per-turn flagging, Rozsi move-in bonus, and turn reset,
- West German Soldier (`42`) placement with draw-two followed by forced
  server-owned `PICK_CARDS_VISUAL` hand discard, including continuation through
  one or more Christopher Erbs draw-choice modals,
- Cosmic GF (`48`) paid consolidation placement with chained server-owned
  Expanded Worlds deck search followed by discard search,
- West Caribbea Infantry (`33`) next-character hand bonus state,
- 6th French Fusiliers (`37`) placement with server-owned `PICK_ZONE` copy
  picker for official enabled while-on-field Supporter passives (`20`, `49`,
  `53`, `59`, `64`) plus copied scoring/consolidation parity,
- Crossroads Worker (`58`) placement with discard Supporter recovery through
  server-owned `PICK_CARDS_VISUAL`, including Zion Canyon discard-recovery block
  handling,
- IB Student (`60`) placement with deck Supporter search through server-owned
  `PICK_CARDS_VISUAL` and deterministic server shuffle after search resolution,
- Great Oak High Schooler (`68`) placement with non-Star Coordinator deck
  search through server-owned `PICK_CARDS_VISUAL`,
- Breakfast Republic Busser (`69`) placement with server-owned same-zone
  friendly-card movement grant, `BOARD_ACTION` adjacent-zone movement,
  once-per-turn reset, move counter, and Rozsi move-in bonus,
- Ledger-keepers (`75`) placement with server-owned `PICK_ZONE` copy selection
  for already-authoritative Supporter when-set reducers (`05`, `16`, `18`,
  `25`, `26`, `31`, `32`, `33`, `42`, `50`, `58`, `60`, `68`, `69`, `71`,
  `72`, `73`, `76`, `80`), including copied-source validation for follow-up
  picker/modal/move interactions,
- Wine Country Guerilla (`70`) strict placement plus `HAND_ACTION` activation
  from hand, board-discard infiltration, deterministic turn-start debuff tick,
  continuous-damage source marking, and original-owner discard return,
- Santa Anna: Prosperity of a Treasure Port (`igb16`) `HAND_ACTION` activation
  with active-landscape validation, exact hand discard verification, friendly
  face-up board target verification, and server-applied +2 Fate,
- Greek Hoplite (`63`) and Cook Islands Duelist (`64`) strict placement and
  normal tribute eligibility, backed by server score parity for their passive
  effects,
- enabled official passive/scoring parity for Felicyta (`01`),
  Post-Modernist Dylan (`10`), Anne Stone (`11`), Zsofia (`15`), Kvetka (`19`),
  Cathy (`23`), Rozsi (`34`), Jimmy (`41`), Soviet Grenadiers (`44`), Bobby
  Jones (`55`), Jeremiah Jones (`57`), and Maroon Knights (`59`),
- Mr. Secules (`67`) paid consolidation placement with one-use state
  initialization and authoritative adjacent Coordinator suppression in final
  scoring, plus server-owned one-use Supporter when-set negation and supported
  Initiator when-set negation,
- Havano Citizen (`79`) normal strict Supporter placement plus server-owned
  hand negation/deployment for supported Supporter and Initiator when-set
  effects that affect the Havano player's cards,
- Rivera (`51`) placement with server-owned affiliation-choice modal, mirrored
  three-turn buff state, and set-time +3 Fate application to matching
  non-Supporter cards,
- Mark Menz (`66`) placement with server-owned affiliation-choice modal,
  same-zone owned-card affiliation conversion, immune-card exclusion, and +1
  Fate per changed card,
- Duncan Heyward (`77`) placement with server-owned affiliation-choice modal and
  declared-affiliation scoring parity, with both `MODAL_ACTION` and legacy
  `PICK_AFFILIATION` answer shapes validated by the same reducer,
- Maria Song (`61`) paid consolidation placement with `PICK_ZONE` opponent-card
  selection and server-owned copy purge from opponent hand/deck,
- Berkeley Homeless (`62`) placement with no-consolidation flags and final
  `CLICK_CELL` move to an open opponent safe square,
- 1st West Caribbea Marines (`65`) contested-only placement validation with
  server-side Fate set to 4,
- Fort Calvin Watcher (`71`) placement with server draw-reveal state for the
  next three opponent draw-phase cards,
- Robo en la Noche (`72`) placement with deterministic server RNG opponent-hand
  steal and stolen-card ownership flags,
- ALPINE Expeditionary (`73`) placement with same-zone friendly
  Initiator/Improvisor discard, Fate gain, and `BOARD_ACTION` once-per-turn
  movement to open contested/friendly rows,
- Selva Islands Pirate (`74`) hand-arrival Supporter-placement boost through
  shared server draw/search/steal hand-arrival handling, plus strict
  `HAND_ACTION` discard activation to raise the turn Supporter cap to three,
- Apparition of Berkeley (`80`) placement with `PICK_ZONE` same-zone friendly
  character discard followed by draw-two,
- The Vigilantes (`52`) placement and `PICK_ZONE` same-zone opponent Supporter
  marking, plus `BOARD_ACTION` manual activation with three-Supporter expend
  picker, same-zone destroy target, reinforcement override, and pending-picker
  bypass rejection,
- Wolf Creek (`54`) on-set placement plus `BOARD_ACTION` manual activation,
  `PICK_ZONE` friendly same-zone character selection, final `CLICK_CELL`
  movement to an open contested/own-safe square, once-per-turn manual-use guard,
  Rozsi (`34`) move-into-zone Fate bonus, and pending-move bypass rejection,
- manual Supporter `BOARD_ACTION` activation reducers now reject
  Lydia/Secules/Havano-suppressed sources for Vigilantes (`52`), Wolf Creek
  (`54`), Breakfast Republic Busser movement (`69`), and ALPINE Expeditionary
  (`73`); render-v2 hides those action buttons while the Supporter is
  suppressed,
- passive/aura authority now uses the same suppression model as active
  Supporter reducers, covering French Fusiliers copied passives (`37`), Irvine
  Businessman (`49`), Colombo Thug (`53`), Maroon Knights (`59`), Cook Islands
  Duelist (`64`), and other shared passive hooks when Lydia/Secules/Havano or
  global Supporter suppression is active,
- global Supporter suppression now short-circuits server-owned Supporter
  when-set reducers before reaction, picker, search, draw, lock, reveal, or
  copied-effect continuations open. This covers the shared when-set family for
  active official Supporters such as `05`, `16`, `18`, `25`, `26`, `31`, `32`,
  `33`, `42`, `50`, `58`, `60`, `68`, `69`, `71`, `72`, `73`, `75`, and `80`,
  while preserving effect-immune Supporters such as ALPINE Infantry (`76`),
- immediate free-placement authority now requires a live server pending marker,
  consumes free-placement flags after use, rejects stale reusable free-set flags,
  and allows supported paid non-Supporter free sets such as Lina (`08`) setting
  a paid Reality card without consolidation cost,
- placement Fate is now normalized through a shared server helper for direct
  placement, consolidation placement, and reaction deployment, carrying hand
  Fate changes, applying West Caribbea Infantry (`33`) temporary +2 Fate, and
  consuming hand-only placement modifiers after board entry,
- server-owned `PICK_CARDS_VISUAL` source-pile selections now require stable
  candidate identity: a card `iid`, or explicit `source`/`index` plus matching
  card id/name. Ambiguous index-only or id-only deck/discard picker payloads are
  rejected before resolution, hardening the shared search/picker path used by
  Maja, Lina, Johnathan, Dylan, Cosmic GF, Crossroads, IB Student, Great Oak,
  Mailman-style delivery, and related reducers,
- server-owned `BOARD_ACTION` source validation now honors the online wrapper's
  `cardIid`/`cardId` fields in addition to nested `card` identity. Stale or
  mismatched source cards are rejected for manual character effects, deferred
  when-set activations, board discard/reveal actions, Panacea/Busser movement
  starters, and converted manual Supporter activations such as Vigilantes, Wolf
  Creek, and ALPINE Expeditionary,
- server-owned board-card candidate selection now requires stable board
  identity: a card `iid`, or explicit `z`/`r`/`c` plus card id/name. Loose
  id-only board-candidate payloads are rejected before resolution. Santa Anna
  hand activation target validation now accepts and verifies flat or nested
  target card identity, with the client sending id/name alongside target iid,
- server-owned `PICK_ZONE` target parsing now requires card identity for every
  selected board entry, while accepting nested `card` identity or flat
  `iid`/`id`/`name` fields. Coordinate-only zone picker payloads are rejected
  across one-target and multi-target effects such as Vigilantes, Makenna, MINAE,
  Wolf Creek, French Fusiliers, Maria Song, Howard, Santiago, Juan Carlos, West
  Coast Dreaming, and related reducers,
- server-owned card and zone picker prompts now receive stable server prompt ids
  through the shared reducer result path. Online card-search, hand-discard,
  board-candidate, zone-picker, board-target, and optional-cancel actions send
  those ids, and missing or mismatched picker prompt ids are rejected before any
  selected card or board target resolves,
- server-owned pending movement prompts now use the same shared prompt-id
  contract. Online `CLICK_CELL` movement completions send the active pending
  move id, and missing or stale ids are rejected before resolving movement for
  Wolf Creek, Juan Carlos, Busser, Panacea, ALPINE Expeditionary, Berkeley
  Homeless, Carolyn, Zoe, Mark Kemper, and related reducers,
- server-owned paid consolidation prompts now also receive stable prompt ids
  through the shared reducer result path. Online consolidation tribute and final
  placement `CLICK_CELL` actions send the active consolidation id, and missing
  or stale ids are rejected before selecting tributes or placement,
- reaction choices now require the exact active `promptId` before resolving
  Lydia, Mr. Secules, or Havano reaction windows, including server-generated
  timeout choices. Server-owned modal prompts now carry stable prompt ids for
  Christopher Erbs, affiliation choice, Artillery Distance, and Chaparral
  set-mode choices; online modal and affiliation-picker actions send that prompt
  id, and missing or mismatched prompt ids are rejected whenever an active
  server prompt owns the choice,
- Irvine Businessman (`49`) as a zone-local character-as-tribute enabler for
  metadata-plain character tributes,
- Marie Lamboure / Deterrance (`36`) as the consolidation-time zone Fate penalty
  when opponent cards are spent from her zone,
- Chingachlook (`45`) placement restriction for consolidation placement,
- Christopher Erbs (`40`) paid consolidation placement with two-use
  initialization,
- Alondra Hopkins (`14`) paid consolidation placement with adjacent/diagonal
  opponent Supporter discard and Fate gain,
- Phil (`46`) paid consolidation placement with server-owned draw-phase Fate
  growth at canonical turn advance,
- Lydia (`56`) paid consolidation placement with five-use initialization and
  server-owned Supporter when-set negation,
- ALPINE Infantry (`76`) placement with Fate, immunity, no-bonus, and
  no-consolidate flags,
- Wodny Potok Villager (`91`) placement with Snowy Village use count and
  opponent landscape-change lock,
- Sebastyen Janowicz (`83`) placement with same-zone friendly-character
  permanent Fate buff,
- Wojciech / Fisherman (`90`) placement with server-owned affiliation-choice
  modal and deterministic random matching deck pulls into hand,
- Wodny Potok Mailman (`94`) placement with Triangle deck selection through
  server-owned `PICK_CARDS_VISUAL` into a four-turn delayed delivery ledger,
- Chaparral Hoplite (`78`) placement, normal tribute eligibility, and
  server-owned consolidation modal for normal versus face-down placement with
  face-down when-set suppression,
- basic `CLICK_CELL` hand-to-board placement for metadata-plain character cards,
- basic `CLICK_CELL` hand-to-board placement for metadata-plain Supporter cards,
  plus whitelisted real passive/consolidation/picker/effect Supporters (`05`,
  `09`, `16`, `18`, `20`, `24`, `25`, `26`, `28`, `31`, `32`, `33`,
  `37`, `44`, `47`, `49`, `50`, `52`, `53`, `54`, `58`, `59`, `60`, `62`, `63`, `64`, `65`, `68`,
  `69`, `70`, `71`, `72`, `73`, `74`, `75`, `76`, `78`, `79`, `80`, `91`, `94`), including support-limit
  and Alondra adjacency checks.

Strict `HAND_ACTION`/`CLICK_CELL` intentionally reject complex pending
interactions and cards that need dedicated rules, including affiliation-dependent
placement, real catalog Supporters with ability/effect metadata, contested-only
cards outside the explicit Supporter placement whitelist, board targeting, move
effects outside the explicit implemented reducers, blocking
effects, picker/modal effects outside the explicit implemented reducers,
reaction families outside the server-owned Lydia/Secules/Havano Supporter
when-set window and Secules/Havano supported Initiator when-set window, and
landscape-specific click flows. Those must
each receive their own reducers before `strict` can run a full real match.

Reaction-window baseline: when a supported Supporter when-set effect would
resolve and the opponent controls ready Lydia (`56`) or Mr. Secules (`67`), the
reducer places the source card, stores `_serverPendingReaction`, and defers the
original effect. The same server-owned window covers supported Initiator
when-set effects when the opponent controls ready Mr. Secules (`67`) or has
Havano Citizen (`79`) in hand for a targeting/affected-cards effect.
`REACTION_CHOICE` is accepted only from the reacting player and either resumes
the original effect or marks it negated while consuming the reacting card's use.
For Havano, the deployment square is part of the same `REACTION_CHOICE`, so the
server atomically removes Havano from hand, places it on a legal square, and
cancels the source effect. The Fly authority starts a timeout for pending
reactions and publishes a server-generated allow/timeout choice if the client
does not answer. The online client watches canonical state for
`_serverPendingReaction` and shows the reacting player an accept/decline prompt.

Current official-scope tracking excludes temporarily disabled card IDs `81`-`100`
from the required completion denominator. Existing reducers for those IDs are
not counted as current official-card coverage until the card pool re-enables
them.

`START_CONSOLIDATE` currently covers the no-tribute branch for a metadata-plain
character whose effective hand cost is zero, plus setup, tribute selection, and
final placement for paid metadata-plain characters when every available tribute
is a normal Supporter worth one reinforcement or one of the explicitly modeled
special tribute cards/modifiers. Variable-cost cards, character-tribute cards,
zone-dependent discounts outside Irvine Businessman, and real card effect
branches still reject in `strict` until the server owns those exact rules. The current dedicated
real-card consolidation exceptions/modifiers are United Nations 5th Army (`09`),
Makenna (`12`), Alondra Hopkins (`14`), Ralph's Courtesy Clerk (`24`), Alexander the Magnificient
(`35`), Marie Lamboure (`36`) paid placement and Deterrance penalty, Christopher Erbs (`40`) use initialization,
Kazumi (`27`) draw-three, Chingachlook (`45`) placement restriction, Great Oak
Infantry (`47`), Irvine Businessman (`49`), Berkeley CS Major (`50`)
placement/modal lock, Colombo Thug (`53`), Lydia (`56`) use initialization, and
Boleslaw Kopewicz (`86`).

The current dedicated placement/picker Supporter exceptions are United Nations
5th Army (`09`), 17th British Regiment (`05`), MINAE Death
Squad (`16`), 1st US Marines (`18`), South Wind Spearman (`20`), Ralph's
Courtesy Clerk (`24`), UCPD (`26`), 2nd Polish-Lithuanian Army (`28`),
Oathbound Noble Fighter (`31`), Temecula Resident (`32`), West Caribbea Infantry
(`33`), Great Oak Infantry (`47`), Irvine Businessman (`49`), Berkeley CS Major
(`50`) placement plus modal lock choice, The Vigilantes (`52`) placement mark
plus manual `BOARD_ACTION` expend-and-destroy flow, Colombo Thug (`53`), Wolf Creek (`54`) on-set
and manual `BOARD_ACTION` pick-and-move, ALPINE Infantry (`76`), and Wodny Potok
Villager (`91`).

Important: server bootstrap now validates card IDs and rarity copy limits
against the real catalog, deterministically shuffles both decks with the match
seed, draws opening hands, stores `room.canonicalState`, and emits the canonical
`stateHash` on `MATCH_START`. The client applies that state after local game
creation. Host `STATE_SYNC` is no longer the source of truth for Fly
server-bootstrapped rooms.

Reducer validation commands:

```powershell
npm run smoke:card-catalog
npm run smoke:authority-bootstrap
npm run smoke:authority-reducer
npm run smoke:authority-state-gate
npm run smoke:authority-strict-reducer
npm run smoke:fly-store
```

`smoke:authority-strict-reducer` is the no-compromise guard: unsupported
gameplay actions must be rejected in `strict` mode instead of accepted through a
client-state fallback.

`smoke:ws-authority` also fires two same-room player intents back-to-back and
requires them to serialize as distinct accepted sequence numbers before the turn
advances. It then retries an accepted `END_TURN` with the same `clientActionId`
after turn ownership has changed and requires the server to replay the original
accepted event instead of creating a duplicate or rejecting it as stale. That
guards the room queue and action idempotency path against duplicate `lastSeq`
races.

At runtime, `fateGetWebSocketAuthorityStatus()` exposes `retryAttempts`,
`retrySuccesses`, `retryFailures`, `retryMaxAttempts`, and the last retry reason
so transient reconnect/send retry behavior can be inspected during live Fly
testing. It also reports catch-up attempts, successes, failures, and the latest
server sequence observed by the pre-send `/resume` catch-up path. Rejected
optimistic-action recovery is tracked separately with rejected-resync attempts,
successes, failures, and the last rejected-resync reason.

The server loads authoritative card metadata from
`src/scripts/01-data-and-state.js`. In `strict` mode, placement reducers require
that metadata. Unknown cards and real catalog cards with effect/affiliation
metadata are rejected unless a dedicated reducer has been implemented. This is
intentional: strict mode should block unsupported real cards rather than treating
compact client card objects as proof that a card is safe to reduce generically.

Reconnect baseline: `GET /api/rooms/{code}/resume` returns the current Fly room,
server state hash, last sequence, and a capped event window. Started-room rejoin
uses that endpoint, stores events until local `MATCH_START` bootstrap has built
game state, then replays the Fly events without RTDB action-log fallback. Passing
`includeState=1` also returns the server canonical state; the browser uses that
only for rejected optimistic-action rollback so no-fallback Fly rooms can recover
without reading RTDB action logs.

Room side-channel baseline: `POST /api/rooms/{code}/chat` appends sanitized,
capped, durable room chat messages and `GET /api/rooms/{code}/chat` can replay a
capped message window by sequence. `POST /api/rooms/{code}/progress` records each
seated player's latest locally applied action sequence so Fly rooms can preserve
lag/pause diagnostics without RTDB `players/{uid}/actionSeq` writes.

Matchmaking baseline: Fly room mode uses `POST /api/matchmaking/enter` for random
queue entry. The server removes stale self entries, chooses the oldest compatible
waiting entry for the same mode/party target, joins the second player into that
Fly room, or creates a new waiting room when no opponent is available. Matched
entries are removed from the queue immediately. Browser matchmaking UI gates use
the Fly room transport status as online-capable, so RTDB-disabled clients can
enter the queue through the normal Challenger and Free Play controls.

Room-discovery baseline: `GET /api/rooms?uid={uid}` returns only rooms where the
authenticated user is seated, sorted by recent activity and excluding ended rooms
by default. The browser exposes `fateDiscoverMyFlyRooms()` and runs a quiet
startup recovery pass that resumes the newest active Fly match or watches the
newest lobby room without reading RTDB.

Fly result/profile baseline: when a server-finalized reward ledger is accepted,
Fly mirrors it into durable in-memory/volume-backed match results, per-player
profile stats, and the Challenger leaderboard. The HTTP API exposes
`GET /api/leaderboards/challenger`, `GET/POST /api/profiles/{uid}`, and
`GET /api/match-results?uid=...`; the browser auth/profile bridge upserts
identity to Fly and avoids RTDB presence writes in Fly/RTDB-disabled mode, while
the leaderboard bridge uses the Fly leaderboard instead of opening the RTDB
leaderboard listener.

Leave baseline: `POST /api/rooms/{code}/leave` handles Fly room cleanup without
RTDB. Lobby hosts delete the room and any queue entries, lobby guests are removed
from the seat/player map, and non-lobby departures mark the player disconnected
and schedule the normal server disconnect timer.

Heartbeat baseline: `POST /api/rooms/{code}/heartbeat` lets seated Fly clients
refresh `connected` and `lastSeen` without RTDB presence. The browser calls it
from the Fly room watcher on a throttle, and the server clears any pending
disconnect timer for that player.

Room-routing baseline: once a browser has a normalized Fly room, room-scoped
operations prefer the Fly API based on `room._flyRoom`/room code rather than
only the global Fly-room flag. `fateGetWebSocketAuthorityStatus()` exposes
`activeRoomUsesFly` so RTDB-disconnect diagnostics can confirm the active room is
not allowed to fall back to Firebase room writes.

Durable-store baseline: `npm run smoke:fly-store` starts the Fly authority with
a temporary volume directory, creates and starts a room, verifies `rooms.json`
and `events.jsonl` were written, verifies Fly matchmaking can create and match a
ranked queue room, verifies room discovery for seated host/guest and exclusion
for an unseated user, verifies lobby heartbeat plus guest/host leave cleanup,
posts durable Fly chat/progress side-channel updates, restarts the server, verifies
`/resume` restores the room, server state hash, chat, player progress, and
`MATCH_START` event from disk, then persists a
disconnected player, restarts again, and verifies the restored disconnect timer
server-finalizes the match with a replayable
`DISCONNECT_TIMEOUT` plus Fly leaderboard/profile/match-result rows. It then
intentionally rewinds `rooms.json` to a stale
started-room snapshot and later deletes `rooms.json` entirely; both restarts must
repair/rebuild the room from `events.jsonl`. It also opens a live socket and
verifies `SIGTERM` graceful shutdown persists that player as disconnected before
exit.

Still not complete: strict mode cannot run a full real match until the remaining
non-basic hand/search actions, special/variable consolidation, the remaining
real card effects, the remaining picker/modal choices, and remaining optional
reaction families beyond Supporter when-set Lydia/Secules/Havano, supported
Initiator when-set Secules/Havano, and the Christopher Erbs draw prompt are all
reduced by the server. Final
accepted events now carry a replayable server reward/ELO ledger. With Firebase
durable writes enabled, Fly also writes stable server match-result records plus
ranked leaderboard/profile updates from that ledger for score, draw, forfeit,
and disconnect outcomes. The client consumes the ledger for forfeit/disconnect
result screens and normal score-result win screens, falling back to legacy local
reward calculation only when a server ledger is absent. `MATCH_RESULT` currently
finalizes from the canonical board scores the server owns, including
deterministic continuous Fate passives that can be computed from canonical board
state. Cook Islands Duelist final scoring is now server-owned: stored targets
are preserved while valid, stale target memory is cleared, new targets are
selected deterministically, and active sources are hydrated before score
calculation. Full result parity still also depends on porting the remaining card
reducers that mutate canonical Fate values and modifiers before result time.
