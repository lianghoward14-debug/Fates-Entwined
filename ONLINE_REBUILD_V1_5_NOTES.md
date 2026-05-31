# Fates Entwined Online Rebuild V1.5

Focused chat/messaging fix on top of V1.4.

## Changes

- Keeps the base game's existing World Chat widget and DM modal styling.
- Fixes DM input being cleared while typing by updating only the message list after realtime snapshots instead of rebuilding the entire modal.
- Clears old local/fake world chat messages when signed in and replaces them with RTDB messages only.
- Rebinds the existing World Chat input/send controls to RTDB send logic after the widget is created.
- Adds approved top-left notification banners for incoming messages, limited to one every 10 seconds.
- Adds a red unread badge on friend-row message buttons when a friend has unread DMs.
- Keeps the Google account panel and room-code UI as the only major added online UI areas.

## Firebase rules

Use `REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1_5.json` in Realtime Database rules.
