# AOC Enterprise Runtime Host v1

## Executive Summary

The Kernel (`src/kernel`, `AocKernel.evaluate()`) already evaluates governance
requests. Before this PR, nothing in this repository could run it as a
production service: there was no HTTP surface, no persistence for a
`KernelEvaluationResult`, no health/telemetry, and no composition root
wiring the Kernel's real dependencies together for a live deployment.

This PR adds `src/kernel-host/` -- the Runtime Host: the first officially
supported way to run the Enterprise Kernel as a hosted, observable,
auditable HTTP service.

**What the Runtime adds:**
- `POST /api/governance/evaluate` -- the one governance HTTP endpoint, and `GET /health`.
- A single dependency-injection composition root that constructs the
  Kernel's real ports (a fully-composed `RecognitionProvider`, clock, id
  generator) and the Runtime's own dependencies (persistence, events,
  telemetry, logging, configuration).
- Durable persistence of every governance request/evaluation/trace
  (in-memory by default; SQLite for a real deployment).
- An in-process Runtime event catalog (`GovernanceEvaluation{Requested,Completed,Denied,ApprovalRequired,Failed}`).
- Operational health, telemetry counters, structured request logging, and a
  documented HTTP error model distinct from governance outcomes.

**What stays inside the Kernel, unchanged:**
- Recognition, authority, approval, evidence, and policy evaluation.
- The `KernelDecisionStatus` / reason-code taxonomy.
- The `KernelEvaluationRequest` / `KernelEvaluationResult` / `KernelTrace` contracts.
- `AocKernel.evaluate()` / `enforce()` themselves -- **not one line of
  `src/kernel/**` changed in this PR.**

**Why the separation improves the architecture:** the Kernel is a pure,
synchronous-feeling decision function with no knowledge of HTTP,
databases, or process lifecycle; the Runtime Host is a thin, replaceable
shell that knows about all three but never re-implements a single
governance rule. A future second host (a gRPC host, a queue-worker host, a
Next.js route handler embedding `buildRuntimeHost()` directly) can reuse
the exact same Kernel with zero duplicated decision logic -- confirmed by
this PR's own parity test, which asserts the Runtime-hosted evaluation is
byte-identical to calling `AocKernel.evaluate()` directly for the same
seeded world and request.

## A note on naming

`src/runtime/` (`createAocEnterpriseRuntime`, exported today as both
`./runtime` and `./runtime-host`) already exists in this repository, but it
is an unrelated system: execution-grant/delegation/vault/federation
lifecycle management that never calls `AocKernel.evaluate()` at all (a
`grep` across `src/runtime/**` for `kernel`/`AocKernel` returns nothing).
To avoid silently changing that system's behavior or its public export
surface, this PR introduces the Kernel-hosting HTTP layer as a **new**,
distinctly-named module, `src/kernel-host/`, exported as the new
`@aoc-enterprise/runtime/kernel-host` subpath. `src/runtime/` is untouched.

## Architecture

```
                          HTTP
                           |
                           v
              +-------------------------+
              |   node-http-adapter      |   <- the ONLY module that knows
              |  (adapters/)             |      IncomingMessage/ServerResponse
              +-------------------------+
                           |
                           v
              +-------------------------+
              | evaluateGovernanceRequest |  <- orchestration/ (framework-agnostic)
              +-------------------------+
             /         |        |        \
            v          v        v         v
    Authentication  Runtime   Kernel    Persistence -> Audit -> Events
    (api/)          Validation Request   (persistence/) (events/)
                    (api/)     Adapter
                               (api/)
                                 |
                                 v
                          AocKernel.evaluate()
                          (src/kernel -- UNCHANGED)
                                 |
                                 v
                        KernelEvaluationResult
                                 |
                                 v
                 GovernanceRequests / GovernanceEvaluations /
                    GovernanceTraces / RuntimeEvents
                                 |
                                 v
                            HTTP Response
```

Everything under `src/kernel-host/` is constructed by exactly one
composition root, `dependency-injection/composition-root.ts`:

```
                        buildRuntimeHost(overrides)
                                 |
        +---------+------------+------------+-----------+-----------+
        v         v            v            v           v           v
   Configuration  KernelProviderSet   GovernanceStore  EventPublisher Telemetry/Logger
   (env-derived)  (providers/)        (persistence/)   (events/)      (telemetry/)
                       |
             recognitionProvider, clock, idGenerator
                       |
                       v
                 createAocKernel(...)   <- the Kernel receives ONLY these
                                            narrow interfaces, never the
                                            store/events/config/logger
```

### Module map (`src/kernel-host/`)

| Module | Responsibility |
| --- | --- |
| `configuration/` | Centralizes every env-derived Runtime knob (`RuntimeConfiguration`). The Kernel reads none of it. |
| `telemetry/` | Operational counters (`RuntimeTelemetry`) and structured request logging (`RuntimeLogger`). |
| `events/` | The Runtime event catalog + a simple in-process publisher/subscriber. |
| `providers/` | Constructs the Kernel's real `RecognitionProvider` (Recognition Runtime + Authority Graph + Approval Runtime + External Agent Handshake, bridged via the same `bridgeRecognitionRuntime` the Kernel's own docs point to) and its clock/id generator. |
| `persistence/` | `GovernanceStore` port + in-memory and SQLite implementations. |
| `health/` | `computeRuntimeHealth()` -- version, DB connectivity, provider/config status, no secrets. |
| `dependency-injection/` | The one composition root, `buildRuntimeHost()`. |
| `api/` | Wire contracts for `POST /api/governance/evaluate`, request validation, Kernel request/response adaptation, the Runtime's own HTTP error taxonomy. |
| `orchestration/` | `evaluateGovernanceRequest()` -- the full request lifecycle, framework-agnostic. |
| `adapters/` | `node-http-adapter.ts` -- the only module that touches `node:http`. |
| `host/` | `createRuntimeHostServer()` -- binds the adapter to a real `http.Server`. |

No speculative folders were added (no `middleware/`, no `plugins/`, no
`graphql/`) -- every directory above backs a concrete file with a concrete
responsibility exercised by the test suite.

## Runtime Lifecycle

```
HTTP Request
  -> Authentication            (api/, orchestration/ -- Runtime-owned, optional, off by default)
  -> Runtime Validation        (api/governance-evaluate-contract.ts -- HTTP/JSON shape only)
  -> Kernel Request Adapter    (api/governance-evaluate-contract.ts -- 1:1 field mapping)
  -> kernel.evaluate()         (src/kernel -- UNCHANGED, the only decision-maker)
  -> Kernel Result
  -> Persistence                (persistence/ -- one transaction: request + evaluation + trace)
  -> Audit                      (telemetry/runtime-logger.ts -- a distinct "governance.audit.decision" log line)
  -> Event Publication          (events/ -- in-process publish + durable RuntimeEvents row)
  -> HTTP Response
```

The Runtime never calls `kernel.enforce()` -- only `kernel.evaluate()`. This
is verified by an automated test that scans the orchestrator's own source
for `.enforce(` and fails the build if it's ever introduced.

An idempotent resubmission of the same `requestId` with the exact same
payload short-circuits at the Persistence step and replays the originally
stored decision (no second Kernel call's result is used, though the Kernel
itself is still asked to evaluate, since `evaluate()` is always safe and
side-effect-free to call more than once). The same `requestId` with a
*different* payload is rejected as a 409 concurrency conflict before ever
reaching the client, and writes nothing.

## Dependency graph

```
AocKernel  <---- recognitionProvider, clock, idGenerator ----  KernelProviderSet (providers/)
   ^                                                                    ^
   |                                                                    |
   +---------------------------- createAocKernel() ---------------------+
                                       |
                          dependency-injection/composition-root.ts
                                       |
        +---------------+-------------+-------------+---------------+
        v               v             v             v               v
  GovernanceStore  EventPublisher  RuntimeTelemetry  RuntimeLogger  RuntimeConfiguration
   (persistence/)     (events/)     (telemetry/)      (telemetry/)   (configuration/)
```

`createDefaultKernelProviders()` (the default, zero-configuration provider
set) builds a **real** Recognition Runtime + Authority Graph + Approval
Runtime + External Agent Handshake, wired with a live wall-clock, but with
**no actors, trust domains, or capability tokens registered**. This is a
deliberate fail-closed default: every request is denied
(`RECOGNITION_ACTOR_UNKNOWN`) until an operator seeds real governance data
through the returned runtime handles (`host.kernelProviders.recognitionRuntime`,
`.authorityRuntime`, `.approvalRuntime`, `.handshakeRuntime`) -- the same
registration APIs the engine's own fixtures use, not a Runtime-Host-specific
shortcut. Seeding real actors/trust domains is an operational/deployment
concern the Runtime Host does not fabricate on an operator's behalf.

Tests, and any caller that wants a pre-seeded world, pass their own
`KernelProviderSet` via `buildRuntimeHost({ kernelProviders })`.

## Persistence

Five tables, matching the mission's schema, deliberately denormalized
(request/trace payloads stored as JSON) -- this is a v1, not the durable
Governance Store PR-003 will build:

```
GovernanceRequests
  request_id       TEXT PRIMARY KEY
  correlation_id   TEXT
  actor_id         TEXT NOT NULL
  action_type      TEXT NOT NULL
  resource_scope   TEXT NOT NULL
  organization_id  TEXT
  requested_at     TEXT NOT NULL
  received_at      TEXT NOT NULL
  request_payload  TEXT NOT NULL   -- full KernelEvaluationRequest, JSON
  INDEX idx_governance_requests_correlation_id (correlation_id)

GovernanceEvaluations
  decision_id      TEXT PRIMARY KEY
  request_id       TEXT NOT NULL REFERENCES GovernanceRequests(request_id)
  status           TEXT NOT NULL   -- KernelDecisionStatus
  reason_codes     TEXT NOT NULL  -- JSON string[]
  summary          TEXT NOT NULL
  kernel_version   TEXT NOT NULL
  evaluated_at     TEXT NOT NULL
  correlation_id   TEXT
  INDEX idx_governance_evaluations_request_id (request_id)
  INDEX idx_governance_evaluations_correlation_id (correlation_id)

GovernanceTraces
  decision_id      TEXT PRIMARY KEY REFERENCES GovernanceEvaluations(decision_id)
  steps_json       TEXT NOT NULL   -- full KernelTrace, JSON

RuntimeEvents
  event_id         TEXT PRIMARY KEY
  event_type       TEXT NOT NULL
  request_id       TEXT NOT NULL
  decision_id      TEXT
  correlation_id   TEXT
  occurred_at      TEXT NOT NULL
  payload          TEXT NOT NULL
  INDEX idx_runtime_events_request_id (request_id)
  INDEX idx_runtime_events_correlation_id (correlation_id)

RuntimeVersions
  boot_id          TEXT PRIMARY KEY
  runtime_version  TEXT NOT NULL
  kernel_version   TEXT NOT NULL
  recorded_at      TEXT NOT NULL
```

Relationships: `GovernanceEvaluations.request_id -> GovernanceRequests.request_id`,
`GovernanceTraces.decision_id -> GovernanceEvaluations.decision_id`.
`RuntimeEvents`/`RuntimeVersions` are append-only ledgers with no FK back
into the governance tables (an event can reference a request that hasn't
finished evaluating yet -- `GovernanceEvaluationRequested`).

**Providers:** `createInMemoryGovernanceStore()` (the default -- zero new
dependencies, used by the test suite) and `createSqliteGovernanceStore(path)`
(`better-sqlite3`, the same driver `apps/agent-passport-web` already uses;
loaded lazily so importing this module never forces the dependency on a
consumer that only uses the in-memory store). Both implement the same
`GovernanceStore` port, so swapping providers never touches orchestration
or API code.

**Future evolution (PR-003):** normalize request/trace payloads instead of
storing them as opaque JSON, add Evidence Bundle and Passport Event tables,
support replay, and add Assurance-certification-grade audit guarantees
(write-ahead durability guarantees beyond WAL, retention policy, export).

## API Specification

### `POST /api/governance/evaluate`

**Request body:**

```jsonc
{
  "actor": { "id": "actor-pmfreak", "principalId": "actor-victor", "trustDomainId": "td-datasys" },
  "action": { "type": "draft_closure_email", "resourceScope": "project:hmp-14665", "capability": "project_closure.drafting", "riskLevel": "medium" },
  "target": { "id": "email-thread-1", "type": "generic" },           // optional
  "organization": { "id": "org-acme" },                               // optional
  "context": { "passportId": "passport-pmfreak", "capabilityTokenId": "cap-pmfreak-drafting", "evidence": [] }, // optional, passed through to the Kernel unchanged
  "requestId": "req-123",         // optional -- generated if omitted
  "correlationId": "corr-456",    // optional
  "requestedAt": "2026-07-10T00:00:00.000Z", // optional -- defaults to the Runtime clock
  "traceLevel": "basic",          // optional -- "basic" | "full"
  "dryRun": false                 // optional
}
```

**Response body (200/422/503):**

```jsonc
{
  "requestId": "req-123",
  "decisionId": "enforcement-decision-...",
  "status": "allowed",            // "allowed" | "denied" | "approval_required" | "indeterminate"
  "summary": "Action allowed.",
  "reasonCodes": ["ACTION_ALLOWED"],
  "trace": { "steps": [ /* KernelTraceStep[] */ ], "decisionId": "...", "kernelVersion": "1.0.0" },
  "evaluatedAt": "2026-07-10T00:00:00.010Z",
  "kernelVersion": "1.0.0",
  "correlationId": "corr-456"
}
```

**HTTP status mapping** (the Runtime Error Model):

| Status | Meaning |
| --- | --- |
| `200` | `status: "allowed"` or `"approval_required"` -- both are *successful* evaluations. |
| `400` | Invalid request (malformed JSON, missing required fields, or a `KernelValidationError`). |
| `401` | Authentication failure (missing/unknown Bearer token, only enforced when configured). |
| `403` | A recognized credential scoped to a different organization than the request names. |
| `409` | The same `requestId` was already submitted with a different payload. |
| `422` | `status: "denied"` -- a real governance denial, **not** an infrastructure error. |
| `500` | An unexpected Runtime/infrastructure failure (persistence write failure, uncaught exception). |
| `503` | `status: "indeterminate"` (the Kernel's own `recognitionProvider` dependency failed), or the store is unreachable at `/health`. |

Error body shape: `{ "error": { "code": "INVALID_REQUEST", "message": "...", "details": ["..."] } }`.

### `GET /health`

```jsonc
{
  "status": "healthy",           // "healthy" | "degraded" | "unhealthy"
  "runtimeVersion": "1.0.0",
  "kernelVersion": "1.0.0",
  "buildVersion": "1.0.0",
  "database": { "provider": "memory", "connected": true },
  "providers": { "recognitionProvider": true, "policyPackProvider": false, "eventPublisher": true },
  "configurationChecksum": "80e0efdb",
  "checkedAt": "2026-07-10T00:00:00.000Z"
}
```

No secrets, connection strings, or API keys are ever included.

## Event Catalog

| Event | Trigger | Payload | Consumer |
| --- | --- | --- | --- |
| `GovernanceEvaluationRequested` | Immediately after Runtime validation, before `kernel.evaluate()`. | `{ eventId, occurredAt, requestId, correlationId? }` | Any `RuntimeEventPublisher` subscriber (e.g. a future audit sink); also durably appended to `RuntimeEvents`. |
| `GovernanceEvaluationCompleted` | `kernel.evaluate()` returned `status: "allowed"`. | `{ eventId, decisionId, status, reasonCodes, kernelVersion, occurredAt, requestId, correlationId? }` | Same. |
| `GovernanceEvaluationDenied` | `status: "denied"`. | Same shape as above. | Same. |
| `GovernanceEvaluationApprovalRequired` | `status: "approval_required"`. | Same shape as above. | Same. |
| `GovernanceEvaluationFailed` | `status: "indeterminate"` (the Kernel's own dependency failed during evaluation). | Same shape as above. | Same. |

Publication is simple in-process pub/sub (`events/runtime-events.ts`) --
no message broker was introduced, consistent with "do not introduce
distributed messaging infrastructure unless already present." Every
published event is also durably appended to the `RuntimeEvents` table
regardless of whether any in-process subscriber is listening.

## Configuration

All environment-derived (see `configuration/runtime-configuration.ts` for the full list and defaults):

| Variable | Default | Purpose |
| --- | --- | --- |
| `AOC_RUNTIME_ENV` | `development` | `development` \| `test` \| `staging` \| `production` |
| `AOC_RUNTIME_HOST_VERSION` | `1.0.0` | Reported in `/health` and every persisted evaluation. |
| `AOC_RUNTIME_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `AOC_RUNTIME_PERSISTENCE_PROVIDER` | `memory` | `memory` \| `sqlite` |
| `AOC_RUNTIME_SQLITE_PATH` | `.data/kernel-host.sqlite` | Ignored unless `sqlite` is selected. |
| `AOC_RUNTIME_EVENTS_ENABLED` | `true` | Toggles event publication (in-process + durable). |
| `AOC_RUNTIME_TELEMETRY_ENABLED` | `true` | Reserved for a future telemetry sink; counters are always collected in-process. |
| `AOC_RUNTIME_API_KEYS` | *(none)* | `key1,key2:org-acme` -- comma-separated; `key:orgId` scopes a key to one organization. |
| `AOC_RUNTIME_REQUIRE_AUTH` | `false` | When `true`, every request must present a valid Bearer token. |
| `AOC_RUNTIME_TRACE_LEVEL` | `basic` | Default `KernelEvaluationOptions.traceLevel` when the caller omits it. |
| `AOC_RUNTIME_HTTP_PORT` | `8787` | |
| `AOC_RUNTIME_HTTP_HOST` | `0.0.0.0` | |

The Kernel itself takes none of this configuration -- it remains
configuration-independent, exactly as the mission requires.

## Health

`GET /health` aggregates: Runtime version, Kernel version, build version,
persistence connectivity, whether a policy pack provider was configured,
whether event publishing is enabled, and a configuration checksum (a hash
of the *shape* of the resolved configuration, never raw secret values) --
so an operator can tell "did the configuration change since the last
deploy" without the endpoint ever leaking what changed.

## Telemetry & Logging

`RuntimeTelemetry` (`telemetry/runtime-telemetry.ts`) tracks: evaluation
count, average evaluation duration, counts by decision status (denied /
approval_required / allowed / indeterminate), and counts of Runtime,
persistence, and provider failures -- exactly the mission's list.

`RuntimeLogger` (`telemetry/runtime-logger.ts`) emits one structured JSON
line per request with `correlationId`, `requestId`, `decisionId`,
`durationMs`, `kernelVersion`, `runtimeVersion`, and `status` -- never
secrets, tokens, or the raw `context` payload.

## Future Runtime Modules

Not built in this PR, and deliberately out of scope per the mission:

- **PR-003 -- AOC Enterprise Persistence Runtime v1**: normalize the
  Governance Store, add Passport Events, Evidence Bundles, Constitutional
  Results, and Jurisdiction Decisions; support replay and
  Assurance-grade certification.
- A real production `RecognitionProvider` composition (this PR's default
  is a real but *empty* engine composition -- an operator still must wire
  real Recognition/Authority/Approval data sources for their deployment).
- Distributed event publication (a message broker), if a future PR
  introduces one elsewhere in the platform.
- An official SDK package that wraps this HTTP endpoint (`client.evaluate(request)`)
  -- this PR's contracts (`GovernanceEvaluateRequestBody`/`ResponseBody`)
  are the exact shape such a client would serialize/deserialize, with no
  duplicated decision logic to port.

## Deployment

Local / development:

```bash
npm run build
npm run start:kernel-host       # scripts/run-kernel-host.mjs
```

Boots with the empty, fail-closed default world and the in-memory store on
`0.0.0.0:8787` (configurable via the environment variables above). Seed
real actors/trust domains/tokens via `host.kernelProviders.recognitionRuntime`
(etc.) before routing production traffic, and set
`AOC_RUNTIME_PERSISTENCE_PROVIDER=sqlite` for durability across restarts.

Embedding in another Node process (e.g. a Next.js route handler) without
`node:http` at all:

```ts
import { buildRuntimeHost } from '@aoc-enterprise/runtime/kernel-host';

const host = await buildRuntimeHost();
export async function POST(req: Request) {
  const outcome = await host.handleGovernanceEvaluate({ rawBody: await req.json() });
  return Response.json(outcome.body, { status: outcome.httpStatus });
}
```

## Test Results

Command:

```bash
npm run build && node --test dist/src/kernel-host/__tests__/*.js
```

Result: **52 tests / 14 suites, 52 passed, 0 failed** (see below for the
category breakdown). Every test executes the real `AocKernel` -- either
against the Runtime's fail-closed empty default provider composition, or
against a real, fully-composed Recognition Runtime + Authority Graph +
Approval Runtime + External Agent Handshake world seeded with the exact
same fixture (`buildDatasysEnforcementFixture`) the Kernel's own
characterization suite uses. No fake/mocked decision engine appears
anywhere in this suite.

| File | Covers |
| --- | --- |
| `governance-evaluate-endpoint.test.ts` | Endpoint tests: allowed (200), denied (422), approval_required (200), malformed JSON/body (400), unknown route (404), authentication/authorization (401/403). |
| `health.test.ts` | Health endpoint tests: healthy/unhealthy, provider flags, no leaked secrets. |
| `dependency-injection.test.ts` | Composition root / provider resolution tests: default fail-closed world, injected `KernelProviderSet`, single Kernel construction, boot-time `RuntimeVersion` recording. |
| `persistence.test.ts` | Persistence + trace persistence tests (both store providers): store/replay/conflict, request/evaluation/trace retrieval, RuntimeEvents filtering, RuntimeVersions, connectivity, and a SQLite transaction **rollback** test. |
| `request-validation.test.ts` | Runtime request validation tests. |
| `error-mapping.test.ts` | Runtime error mapping tests (all 6 `RuntimeHttpErrors` + all 4 `KernelDecisionStatus` -> HTTP status mappings). |
| `concurrency.test.ts` | Concurrency tests: many distinct concurrent requests, a concurrent burst of the same request (idempotent convergence), and a concurrent burst of conflicting payloads (exactly one 409-free winner). |
| `kernel-integration.test.ts` | Kernel integration / parity tests: Runtime-hosted evaluation is byte-identical to a direct `AocKernel.evaluate()` call; the orchestrator never calls `kernel.enforce()`; persisted traces match the returned trace exactly. |

Repository-wide `npm run typecheck`, `npm run build`, and `npm run lint`
all pass clean with these changes. `npm test` (the repo-root script) was
also run; a pre-existing, unrelated harness limitation causes it to
attempt to execute every package's raw `.ts` test sources directly (with
no TypeScript loader), which already fails on `main` before this PR
(354 failures on a clean `origin/main` checkout, e.g.
`apps/agent-passport-web/__tests__/*.test.ts`,
`packages/pmfreak-agent-passport-foundation/__tests__/*.test.ts`) --
unrelated to and unaffected by this PR. This PR's own compiled test suite,
run directly as shown above, is 100% green.

## Remaining Roadmap

**Recommended next PR: PR-003 -- AOC Enterprise Persistence Runtime v1.**
Focus: transform this PR's intentionally minimal, denormalized
`GovernanceStore` into the first durable Governance Store capable of
supporting Passport evolution, Audit records, Evidence Bundles, replay, and
future Assurance certification -- exactly as anticipated by this PR's
"do not yet implement" scope boundary.
