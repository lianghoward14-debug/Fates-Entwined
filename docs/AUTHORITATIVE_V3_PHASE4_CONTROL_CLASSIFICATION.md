# Phase 4 control-change family classification

The shared engine now has a `CHANGE_CONTROL` board operation. It preserves a
card's permanent owner, changes only its current controller, applies targeting
and immunity checks, and emits `CONTROL_CHANGED`.

No catalog card is newly multiplayer-eligible in this checkpoint. The actual
hidden-zone transfer cards require complete lifecycle rules:

- 70 Wine Country Guerilla has unresolved ownership/controller, five-use
  expiration, hidden-hand random targeting, immunity, and return routing.
- 72 Robo en la Noche has unresolved original-owner return routing after the
  stolen card is set, changes control, leaves play, becomes a copy, or is a
  token.
- bh03 Ali, The Indomitable must transfer on every arrival path, including
  opening hand, draw, search, recovery, and generation; impose a protected
  six-card cap in the recipient hand; and remove immunity when legally placed.

These cards remain rejected by v3 deck validation. Implementing only one
arrival path would create a second, incorrect control system.
