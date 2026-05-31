# Online Rebuild V1.3

Focused correction after V1.2 testing.

- Removes the V1.2 world chat and private-message panels from the Social screen.
- Returns Social to the V1.1 friends/requests/online layout, respecting the no-new-UI rule.
- Keeps Google account panel and Free Play room-code UI.
- Fixes a possible immediate-listener recursion loop when opening the room lobby.
- Fixes profile listener cleanup so unsubscribing one profile does not detach other profile listeners on the same RTDB path.

World chat and private messages are deferred until they can be placed into an approved existing UI design.
