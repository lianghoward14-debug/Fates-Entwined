# Authoritative v3 Phase 6 server shadow mode

Phase 6 runs as a separate observer process. The production legacy authority
does not import it, start it, call it, or receive messages from it.

## Isolation contract

The shadow process requires this exact flag:

```text
FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1
```

Any other value leaves it disabled. It also refuses to start when the separate
v3 authority flag is enabled:

```text
FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1
```

It additionally requires an explicit immutable build identifier:

```text
FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID=<commit-or-image-build-id>
```

Missing and placeholder build IDs prevent the observer from starting. The ID
is telemetry only; it does not enable authority or change routing.

The observer opens no listening socket and has no network connection to the
legacy process. It reads the existing append-only `events.jsonl` accepted-event
log and writes comparison records to a different append-only JSONL file. It
cannot accept, reject, reorder, delay, mutate, or broadcast a match action.

The legacy server remains the only authority. No Phase 6 import or flag was
added to `server/fate-ws-authority.js`.

## Inputs and output

The normal legacy durable store configuration supplies the input:

```text
FATE_WS_DATA_DIR=<durable-data-directory>
FATE_WS_APPEND_EVENT_LOG=1
```

By default the observer reads:

```text
<FATE_WS_DATA_DIR>/events.jsonl
```

and writes:

```text
<FATE_WS_DATA_DIR>/authority-v3-shadow-comparisons.jsonl
```

The paths can be made explicit:

```text
FATE_SERVER_AUTHORITATIVE_V3_SHADOW_INPUT=<accepted-events-jsonl>
FATE_SERVER_AUTHORITATIVE_V3_SHADOW_REPORT_PATH=<comparison-report-jsonl>
```

The worker refuses identical input and output paths.

Start the separate observer with:

```text
npm run server:authority-v3-shadow
```

For volume-backed deployment, `Dockerfile.authority-v3-shadow` is a separately
selected image. Its supervisor starts the unchanged legacy server and observer
as sibling OS processes so both can access the same mounted append-only log.
If the observer exits or fails to start, the supervisor logs that failure and
keeps the legacy authority active. `fly.authority-v3-shadow.toml.example`
contains placeholders for a dedicated shadow-soak app and volume. It must
never reuse the default legacy app or its volume.

The default `Dockerfile` and `fly.toml` remain legacy-only and contain no
shadow flag, worker, or supervisor route. Merely building or deploying the
normal image therefore cannot start Phase 6 code.

After copying the example to a private config and replacing both placeholders,
validate it without deploying:

```text
npm run predeploy:authority-v3-shadow -- <private-shadow-fly.toml>
```

Generate the immutable ID from executable shadow runtime sources:

```text
npm run build-id:authority-v3-shadow -- --value-only
```

The digest covers `.dockerignore`, the shadow Dockerfile, executable legacy
server modules, the shadow worker/supervisor/comparator, shared engine, and
runtime normalization tools. Test-only files do not change the runtime ID.

The validator refuses `fly.toml`, the default app name, the default volume,
placeholder names, any image/process other than the separately selected
shadow supervisor, missing durable-log requirements, a non-disabled v3
authority flag, a missing immutable shadow build ID, or a data path outside
the dedicated mount. There is
intentionally no package script that deploys the shadow app; validation does
not mutate Fly or production.

## Isolated soak deployment

The isolated Phase 6 soak deployment was created and completed on 2026-07-31:

```text
app:       fates-entwined-v3-shadow-soak
url:       https://fates-entwined-v3-shadow-soak.fly.dev/
volume:    fate_authority_v3_shadow_soak
region:    lax
release:   2
build id:  phase6-b896a72f0815774aa0f43d8e6d5267ea46a945333830ae2a5752b09e3730939d
```

The deployed machine reports protocol v2 and has
`FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1`,
`FATE_SERVER_AUTHORITATIVE_V3_ENABLED=0`, token verification on, Firebase RTDB
disabled, and the dedicated encrypted volume mounted at `/data`. Startup logs
show both the unchanged legacy authority listener and the Phase 6 observer.
The production `fates-entwined-main` app and `fate_authority_data` volume were
not targeted or changed.

The app received the approved 180-action corpus through real authenticated
client-resolved rooms. The selected evidence snapshot uses exactly one latest
`phase6-real-corpus-v1:<index>:action` record for each corpus index, so retries
cannot inflate its counts. It contains 178 matches and only the two reviewed
legacy defects, with zero untranslated gameplay and exact 180/180 accepted-log
reconciliation. Engine, ruleset, immutable build ID, deployment config, app,
and volume pins all agree. The completion checkpoint is
`fixtures/AUTHORITY_V3_PHASE6_DEPLOYED_SHADOW_AUDIT.json`.

The remote path is independently fail-closed:

```text
FATE_PHASE6_REMOTE_CORPUS_SOAK=1 \
  npm run soak:authority-v3-phase6-remote-corpus -- --start 0 --limit 180
```

The harness refuses every origin except the separate shadow app and is inert
without the exact environment flag. `snapshot:authority-v3-phase6-corpus`
creates write-once, one-record-per-index comparison and accepted-event inputs
from the complete durable logs.

For a bounded replay of the current input file:

```text
npm run server:authority-v3-shadow -- --once
```

Summarize and deduplicate a report with:

```text
npm run report:authority-v3-shadow -- <comparison-report.jsonl>
```

Add `--fail-on-open` to return a failing exit code when the report contains a
mismatch, engine rejection, translation failure, or invalid input. Unsupported
`not-compared` command families are counted separately for manual coverage
review.

The reviewed production gate uses:

```text
npm run report:authority-v3-shadow -- <comparison-report.jsonl> \
  --review-ledger docs/fixtures/AUTHORITY_V3_PHASE6_REVIEWED_SHADOW_ISSUES.json \
  --accepted-log <accepted-events.jsonl> \
  --min-unique-records <approved-soak-record-count> \
  --min-matches <approved-soak-match-count> \
  --min-rooms <approved-soak-room-count> \
  --require-engine-version <approved-engine-version> \
  --require-ruleset-version <approved-ruleset-version> \
  --require-build-id <approved-immutable-build-id> \
  --deployment-config <private-shadow-fly.toml> \
  --write-audit <new-phase6-audit.json> \
  --fail-on-open
```

The ledger recognizes only the exact Snow Shoveler/Zion Canyon and deferred
Ali hand-limit fingerprints already reviewed in Phase 5. Every other mismatch,
engine rejection, translation failure, or invalid record remains unreviewed
and fails the gate. `not-compared` families remain visible and require a
separate coverage review. The explicit positive evidence thresholds prevent an
empty, truncated, or undersized report from passing merely because it contains
no unknown discrepancy. `--accepted-log` reconciles the immutable source log
against telemetry by room, accepted sequence, multiplicity, and legacy hash.
Missing or unexpected comparisons, malformed source lines, invalid identities,
or hash inconsistencies fail the gate.

Version requirements apply to every unique telemetry record, not merely the
summary's first version. Missing metadata, mixed builds, or a build other than
the explicitly approved engine and ruleset versions fail. The minimum room
requirement is independent of record and match counts, preventing a large
single-room trace from satisfying an approved multi-room soak.

The build-ID requirement is independent of engine and ruleset versions. Every
telemetry line must carry the one approved build ID, and that ID must equal the
one in the validated deployment config. Missing IDs, mixed builds, the wrong
build, or config/telemetry disagreement fail promotion even if semantic
versions are unchanged.

The summary fingerprints the shadow report, accepted-event log, and reviewed
issue ledger with SHA-256 and includes a deterministic audit digest over the
path-independent decision data. `--write-audit` creates the complete JSON audit
with exclusive-create semantics: it refuses an existing output file and
refuses any output path that is also an evidence input. A changed report, log,
or ledger therefore produces a different fingerprint and audit digest, while
an earlier audit cannot be silently overwritten by the review command.

`--deployment-config` captures, validates, and fingerprints the exact private
shadow Fly configuration alongside the telemetry evidence. The same fail-closed
rules as predeploy validation apply inside promotion review: the default
legacy app or volume, placeholders, a wrong process/image, missing isolation
requirements, or conflicting authority flags make the complete audit fail.
The deployment config is also protected from audit-output path collision, and
any later config edit changes the evidence fingerprint and audit digest.

Each evidence input is read into one immutable byte snapshot. Parsing, byte
length, and SHA-256 all use that same snapshot; the tool never parses a file
and then rereads a potentially newer append state for hashing. Appends that
occur after capture belong to a later audit and cannot silently alter which
bytes the current decision represents.

Every `not-compared` record also has a coverage class. `STATE_SYNC` is a
`control-baseline`, `EFFECT_CINEMATIC` is `presentation-only`, and an accepted
gameplay command without a deterministic v3 translation is
`gameplay-untranslated`. Reviewed-issue ledgers cannot waive untranslated
gameplay coverage: `--fail-on-open` still fails while any such record exists.

Serialized reaction choices use a narrow stateful continuation. When a
matched v3 prediction leaves a real v3 reaction prompt, the next legacy
`REACTION_CHOICE` may select the exact legal decline, negate, or suppress
template by reaction card identity. The cached v3 state is discarded after a
baseline reset, mismatch, engine rejection, translation failure, unidentified
actor, or untranslated gameplay action. A reaction can therefore never be
claimed as parity after the shadow path has diverged.

Mandatory hand-limit discards use the same fail-closed boundary. The observer
may continue from a matched v3 state only when that state has a real
`pendingHandLimit` for the accepted actor and the reported discard IIDs exactly
match one legal `DISCARD_TO_HAND_LIMIT` template. Wrong-seat, incomplete,
duplicate, unknown, or post-reset selections cannot use the stateful path.
They remain visible as a rejection or other non-match result, and the cached
state is cleared.

## Telemetry schema

Every report line uses
`fates-authority-v3-shadow-comparison-v1` and records:

- room code and accepted sequence;
- the accepted action type and inferred v3 command;
- legacy state hash;
- v3 engine hash when reduction succeeds;
- `match`, `mismatch`, `engine-rejection`, `translation-failure`,
  `not-compared`, `baseline`, or `duplicate` status;
- first differing normalized state path and values for mismatches;
- engine and ruleset version.

`not-compared` is intentional telemetry, not parity. It makes unsupported
legacy presentation/control envelopes and missing baselines visible instead of
silently counting them as matches.

## Phase 6 gate

`npm run smoke:authority-v3-phase6` proves:

- the exact disabled flag writes no report;
- the shadow and authority flags cannot coexist;
- the observer has no legacy import or network control path;
- the separately selected shadow image runs protocol v2 legacy authority and
  its file observer as sibling processes, while the default Dockerfile and Fly
  config remain legacy-only;
- predeploy validation rejects the default app, default volume, placeholder
  config, conflicting flags, and wrong process before any deployment command;
- duplicate accepted sequences are not compared twice in one observation run;
- command, legacy hash, engine hash, first differing path, engine version, and
  ruleset version are recorded;
- exact stateful reaction and hand-limit continuations match only while the
  preceding v3 state remains valid; wrong-seat and stale hand-limit attempts
  cannot claim parity;
- report review enforces caller-declared minimum unique-record and match
  counts, so missing soak evidence fails closed;
- every record must belong to the one explicitly approved engine/ruleset build
  and immutable shadow build ID, and the evidence must cover the approved
  minimum number of distinct rooms;
- SHA-256 fingerprints and a deterministic audit digest bind the decision to
  the exact report, accepted log, ledger, and isolated deployment config; audit
  output is write-once and cannot collide with an evidence input;
- promotion reruns the fail-closed separate-app/separate-volume deployment
  validation, so a telemetry report cannot be approved independently of its
  reviewed shadow routing configuration;
- parsing and hashing use one immutable snapshot per input, closing
  append-during-review time-of-check/time-of-use races;
- accepted-event reconciliation proves every source action has exactly one
  corresponding comparison with the same legacy hash and rejects missing,
  unexpected, malformed, or hash-inconsistent evidence;
- the 180-action real legacy corpus produces 178 matches and the same two known
  mismatches already classified in Phase 5.

The aggregate also launches the real client-resolved legacy authority and the
observer concurrently over the same append-only log. It terminates the
observer immediately after the accepted `MATCH_START`, then requires the
legacy match to continue through end-turn, board-effect, reaction, and forfeit
actions. A bounded worker replay must subsequently account for every accepted
log line. This is a failure-isolation test; its client-resolved smoke fixture
uses deliberately synthetic state transitions, so its detected mismatches and
engine rejections are telemetry-coverage evidence rather than a parity
baseline.

Those known mismatches remain Snow Shoveler under Zion Canyon and deferred Ali
hand-limit ordering. The deployed audit reviewed both, found no additional
mismatch or unsupported gameplay envelope in the selected corpus evidence, and
passed every positive breadth and reconciliation gate. Phase 6 is complete;
Phase 7 may now begin in order behind its own exact route.
