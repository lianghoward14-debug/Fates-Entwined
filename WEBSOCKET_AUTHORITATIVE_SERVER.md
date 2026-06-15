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
FATE_WS_DURABLE_WRITES=auto
FATE_WS_REQUIRE_DURABLE_WRITES=0
FATE_WS_MAX_ROOM_EVENTS=1200
FATE_WS_DATA_DIR=/data/fate-authority
FATE_WS_FLY_STORE=1
FATE_WS_REQUIRE_FLY_STORE=1
FATE_WS_STATE_GATE=1
FATE_WS_REDUCER_MODE=turns
```

For durable server-side Firebase writes, provide one of:

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

Firebase still handles auth in this phase. Existing public profiles,
matchmaking, chat, and lobby screens may still use Firebase until later migration
slices. The WebSocket/Fly service now owns match action ordering, turn/player
validation, room event replay, optional Firebase room reads on join, and optional
Firebase action-log mirroring.

Useful HTTP endpoints:

```txt
GET  /api
POST /api/rooms
GET  /api/rooms/{code}
POST /api/rooms/{code}/join
POST /api/rooms/{code}/player
POST /api/rooms/{code}/start
GET  /api/rooms/{code}/events?after=0&limit=300
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

## Professional Authority Phase Gates

This migration is intentionally phased. Do not treat a phase as complete
server-authoritative multiplayer until its gate is satisfied:

1. **Transport and RTDB-disconnect bridge**: Fly owns room event replay, private
   room create/join/deck/start paths, and the client can run with RTDB fallback
   disabled.
2. **Authoritative reducer**: the Fly server applies card/game rules itself and
   rejects illegal intents without trusting `payload.postState`.
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
  Fly room winner/loser/end-reason metadata,
- `HAND_ACTION` `placeSelected` for metadata-plain Supporter placement arming
  and whitelisted real passive/consolidation/picker/effect Supporters (`05`,
  `09`, `12`, `16`, `18`, `20`, `24`, `26`, `28`, `31`, `32`, `33`, `47`,
  `49`, `52`, `53`, `54`, `76`, `91`),
- `START_CONSOLIDATE` for metadata-plain zero-cost character placement arming,
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
- 17th British Regiment of Africa (`05`) placement and `PICK_ZONE` same-zone
  Fate gain,
- Makenna (`12`) placement and multi-target `PICK_ZONE` friendly immunity,
- MINAE Death Squad (`16`) placement and `PICK_ZONE` opponent Supporter discard,
- 1st US Marines (`18`) suppression state and suppressed-player end-turn
  cleanup,
- South Wind Spearman / Shield Wall (`20`) placement with zone movement locks,
- UCPD (`26`) opponent-hand reveal state,
- Kazumi (`27`) paid consolidation draw-three, including shared draw handling,
- 2nd Polish-Lithuanian Army (`28`) set-use counter initialization,
- Oathbound Noble Fighter (`31`) placement and `PICK_ZONE` same-zone Fate loss,
  including immunity and Shield Wall rejection,
- Temecula Resident (`32`) draw-one, including shared draw handling,
- shared draw handling applies West Caribbea hand-arrival bonus and armed
  Christopher Erbs Fate bonus, and pauses on a server-owned Christopher Erbs
  activation/decline modal when that optional draw response is available,
- West Caribbea Infantry (`33`) next-character hand bonus state,
- The Vigilantes (`52`) placement and `PICK_ZONE` same-zone opponent Supporter
  marking, including reinforcement override and pending-picker bypass rejection,
- Wolf Creek (`54`) on-set placement, `PICK_ZONE` friendly same-zone character
  selection, final `CLICK_CELL` movement to an open contested/own-safe square,
  Rozsi (`34`) move-into-zone Fate bonus, and pending-move bypass rejection,
- Irvine Businessman (`49`) as a zone-local character-as-tribute enabler for
  metadata-plain character tributes,
- Marie Lamboure / Deterrance (`36`) as the consolidation-time zone Fate penalty
  when opponent cards are spent from her zone,
- Chingachlook (`45`) placement restriction for consolidation placement,
- Christopher Erbs (`40`) paid consolidation placement with two-use
  initialization,
- Alondra Hopkins (`14`) paid consolidation placement with adjacent/diagonal
  opponent Supporter discard and Fate gain,
- Lydia (`56`) paid consolidation placement with five-use initialization,
- ALPINE Infantry (`76`) placement with Fate, immunity, no-bonus, and
  no-consolidate flags,
- Wodny Potok Villager (`91`) placement with Snowy Village use count and
  opponent landscape-change lock,
- basic `CLICK_CELL` hand-to-board placement for metadata-plain character cards,
- basic `CLICK_CELL` hand-to-board placement for metadata-plain Supporter cards,
  plus whitelisted real passive/consolidation/picker/effect Supporters (`05`,
  `09`, `12`, `16`, `18`, `20`, `24`, `26`, `28`, `31`, `32`, `33`, `47`,
  `49`, `50`, `52`, `53`, `54`, `76`, `91`), including support-limit and
  Alondra adjacency checks.

Strict `HAND_ACTION`/`CLICK_CELL` intentionally reject complex pending
interactions and cards that need dedicated rules, including affiliation-dependent
placement, real catalog Supporters with ability/effect metadata, contested-only
cards outside the explicit Supporter placement whitelist, Lina free-set,
Hungarian Dance, Wine Country Guerilla, board targeting, move effects, blocking
effects, picker/modal effects outside the explicit implemented reducers, manual
Wolf Creek board activation and reaction-dependent Supporter activations, French
Fusiliers passive-copy choices, and landscape-specific click flows. Those must
each receive their own reducers before `strict` can run a full real match.

`START_CONSOLIDATE` currently covers the no-tribute branch for a metadata-plain
character whose effective hand cost is zero, plus setup, tribute selection, and
final placement for paid metadata-plain characters when every available tribute
is a normal Supporter worth one reinforcement or one of the explicitly modeled
special tribute cards/modifiers. Variable-cost cards, character-tribute cards,
zone-dependent discounts outside Irvine Businessman, French Fusiliers passive
copying, and real card effect branches still reject in `strict` until the server
owns those exact rules. The current dedicated
real-card consolidation exceptions/modifiers are United Nations 5th Army (`09`),
Alondra Hopkins (`14`), Ralph's Courtesy Clerk (`24`), Alexander the Magnificient
(`35`), Marie Lamboure (`36`), Christopher Erbs (`40`) use initialization,
Kazumi (`27`) draw-three, Chingachlook (`45`) placement restriction, Great Oak
Infantry (`47`), Irvine Businessman (`49`), Berkeley CS Major (`50`)
placement/modal lock, Colombo Thug (`53`), Lydia (`56`) use initialization, and
Boleslaw Kopewicz (`86`).

The current dedicated placement/picker Supporter exceptions are United Nations
5th Army (`09`), 17th British Regiment (`05`), Makenna (`12`), MINAE Death
Squad (`16`), 1st US Marines (`18`), South Wind Spearman (`20`), Ralph's
Courtesy Clerk (`24`), UCPD (`26`), 2nd Polish-Lithuanian Army (`28`),
Oathbound Noble Fighter (`31`), Temecula Resident (`32`), West Caribbea Infantry
(`33`), Great Oak Infantry (`47`), Irvine Businessman (`49`), Berkeley CS Major
(`50`) placement plus modal lock choice, The Vigilantes (`52`) placement plus
same-zone `PICK_ZONE` target mark, Colombo Thug (`53`), Wolf Creek (`54`) on-set
pick-and-move, ALPINE Infantry (`76`), and Wodny Potok Villager (`91`). Wolf
Creek's manual board activation still rejects because its reaction/negation path
is not yet server-owned.

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
```

`smoke:authority-strict-reducer` is the no-compromise guard: unsupported
gameplay actions must be rejected in `strict` mode instead of accepted through a
client-state fallback.

The server loads authoritative card metadata from
`src/scripts/01-data-and-state.js`. In `strict` mode, placement reducers require
that metadata. Unknown cards and real catalog cards with effect/affiliation
metadata are rejected unless a dedicated reducer has been implemented. This is
intentional: strict mode should block unsupported real cards rather than treating
compact client card objects as proof that a card is safe to reduce generically.

Still not complete: strict mode cannot run a full real match until non-basic
hand actions, special/variable consolidation, the remaining real card effects,
the remaining picker/modal choices, remaining optional reaction choices beyond
the Christopher Erbs draw prompt, normal score-based match-end resolution,
server-finalized rewards/ELO, disconnect timeout, and reconnect replay are all
reduced by the server.
