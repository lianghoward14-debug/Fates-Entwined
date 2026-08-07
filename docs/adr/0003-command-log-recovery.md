# ADR 0003: Recover from snapshots plus accepted commands

Status: accepted

SQLite in WAL mode stores match metadata, player credential hashes, periodic
snapshots, compact accepted commands, response idempotency records, and the
hash for every revision. One transaction records a command and advances match
metadata before any broadcast occurs.

Recovery loads the latest snapshot, replays the command tail through the
shared engine, and refuses the room if a revision or hash differs.

