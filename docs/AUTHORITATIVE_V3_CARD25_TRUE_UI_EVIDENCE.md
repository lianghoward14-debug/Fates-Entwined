# Authoritative v3 true full-UI campaign through card 25

This is a live evidence ledger for the production-presentation browser campaign. A match is clean only when both seats complete all 20 turns with target command/effect evidence, zero UI fallbacks, zero presentation errors, and zero rules-oracle violations. Failed scheduled matches remain recorded and require focused replacement matches; they are never relabeled as passes.

## Tested deployment

- Fly service: `fates-entwined-v3-unranked-beta`
- Server build: `phase7-543a66e5364e0a5355a3b4b67536558e35b61188bdfd382b542b8b01f45d1d21`
- Client mode: `fateV3PresentationE2E=1` (production presentation timing)
- Campaign target: global match 239, the tenth scheduled match for actual card id `25`

## Card 04 scheduled boundary (global 30-39)

| Global | Match | Landscape | Variant | Result |
|---:|---|---|---|---|
| 30 | `BETA_msbozwb2_fc5c2fa9ac` | pre-fix | pre-fix | Failed: stale accepted-command/presentation retry; UI fallback on seat B |
| 31 | `BETA_msbqvqwp_623c5ca892` | `igb1` | `CANCEL_OR_DECLINE_WITHOUT_DEFAULT_MUTATION` | Failed: consolidation texture-preflight snaps (A 3, B 4); no fallbacks/oracle violations; target effect delta 15 |
| 32 | `BETA_msbqz376_4d70c15ea8` | `igb8` | `LYDIA_NEGATE_WINDOW` | Failed: consolidation texture-preflight snaps (6/6); no fallbacks/oracle violations; target effect delta 5 |
| 33 | `BETA_msbr2w6z_9f8ad6dfac` | `igb15` | `LYDIA_SUPPRESS_WINDOW` | Failed: consolidation texture-preflight snaps (8/8); no fallbacks/oracle violations; target effect delta 8 |
| 34 | `BETA_msbr9pw0_6988057e8a` | `igb2` | `HAVANO_TARGETED_INTERRUPT` | Failed: authoritative zone modifier omitted by UI score (oracle mismatches A 20, B 22); presentation and fallback counts zero |
| 35 | `BETA_msbrbrpf_fa312ad5ac` | `igb9` | `IMMUNE_TARGET_EXCLUSION` | Clean: 20 turns; zero errors/fallbacks/oracle; target command delta 1 and effect delta 8 on both seats |
| 36 | `BETA_msbrfi7n_e62db3a849` | `igb16` | `USE_LIMIT_OR_DUPLICATE_ADMISSION` | Clean: 20 turns; zero errors/fallbacks/oracle; target command delta 1 and effect delta 10 on both seats |
| 37 | `BETA_msbrkbqz_fdc6930498` | scheduled | scheduled | Clean: 20 turns; zero errors/fallbacks/oracle; target command delta 1 and effect delta 9 observed |
| 38 | `BETA_msbrmgsl_468bb0f365` | `igb10` | `LANDSCAPE_INTERACTION` | Clean: 20 turns; zero errors/fallbacks/oracle; target command delta 1 and effect delta 8 observed |
| 39 | `BETA_msbroip7_263722c057` | `igb17` | `OPPOSITE_SEAT_AND_CONTROL_DIRECTION` | Clean: 20 turns; zero errors/fallbacks/oracle; target command delta 1 and effect delta 10 observed |

Card `04` status: 5 clean scheduled matches, 5 focused clean replacements still required.

## Fixes discovered by this segment

1. Late texture decoding no longer cancels placement or consolidation motion. The production VFX path runs with its deterministic card-name fallback and replaces it with decoded art when ready.
2. Phase 7 zone scoring now includes authoritative `ZONE_FATE_MODIFIER` statuses and does not re-run legacy landscape or multiplier calculations. Single-player scoring remains unchanged.

