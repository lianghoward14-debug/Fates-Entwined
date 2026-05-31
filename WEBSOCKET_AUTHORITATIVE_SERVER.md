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
   When Firebase Admin credentials are configured, the server reads the room
   from Firebase on join and writes accepted actions to the Firebase action log
   before broadcasting them.

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
FATE_WS_REQUIRE_DURABLE_WRITES=1
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
{"ok":true,"durableWrites":true}
```

For production, use `wss://...` in the client:

```js
fateSetWebSocketAuthorityUrl('wss://your-server.example.com')
```

Firebase still handles auth, public profiles, rooms, matchmaking, chat, and the
durable action log. The WebSocket service owns match action ordering,
turn/player validation, Firebase room reads on join, and, when configured,
durable action-log writes.
