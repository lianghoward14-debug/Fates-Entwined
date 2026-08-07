# ADR 0002: Persist prompts and effect continuations as data

Status: accepted

Every multi-step effect uses a serializable effect frame containing its source,
controller, instruction index, local choices, original command ID, and waiting
reason. A prompt is owned by one player and references that frame.

No callback or closure is stored in match state. Reconnect and restart recover
the same prompt ID and legal choices. Timeout commands use deterministic
ruleset policies such as decline, cancel, or first eligible choice.

