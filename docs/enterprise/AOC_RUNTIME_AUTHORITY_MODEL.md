# AOC Runtime Authority -- Current Model (v1 vertical slice)

See `docs/architecture/ADR-RUNTIME-AUTHORITY.md` for the design rationale,
rejected alternatives, and known limitations. This document is the
operational reference: domain model, state machine, HTTP API surface,
denial-code vocabulary, evidence event types, and how to run the demo.

## Why this exists

An **ungoverned** agent possesses tools, credentials, or access. A
**governed** agent's effective authority is externally issued, narrowly
scoped, continuously valid, independently revocable, enforced outside the
agent, and auditable. The acceptance test for "governed" is: when an
authorized external authority revokes standing authority, the next
protected action fails before it reaches the target system, even if the
agent keeps trying, regardless of the agent's prompt, memory, or
cooperation.

## Package layout

```
src/enterprise/runtime-authority/
  contracts.ts    -- all domain types, the state matrix, denial codes, evidence event types
  state-machine.ts-- transition guard (the only place the matrix is consulted)
  crypto.ts       -- Ed25519 signer/verifier (node:crypto, no external dependency)
  evidence.ts     -- hash-chained append-only evidence log + pure chain verifier
  stores.ts       -- in-memory current-state stores (agents/runtimes/grants/leases)
  service.ts      -- RuntimeAuthorityService: registration, grants, leases, emergency controls
  gateway.ts       -- the Enforcement Gateway: authorizeAction() and nothing else executes
  pmfreak/        -- the PMFreak Schedule Health Agent vertical slice (simulated resource + agent driver + scenario builder)
  __tests__/      -- acceptance test (mission section 8/13) + 33 adversarial tests
```

Registered into the Enterprise Host as module `aoc.enterprise.runtime-authority`
(`src/enterprise/modules/runtime-authority-module.ts`), optional by
default (`AOC_ENTERPRISE_RUNTIME_AUTHORITY_REQUIRED=true` to make it
`required`), with its own independent in-memory stores -- never persisted
inside the Governance Store, Evidence Bundle Store, or Passport Store.

## Domain model

| Concept | Type | Notes |
|---|---|---|
| Governed agent | `GovernedAgent` | `status: ACTIVE \| SUSPENDED \| REVOKED`; optional `passportId` cross-reference to the canonical identity record in `../passport/` |
| Governed runtime | `GovernedRuntime` | `state` per the matrix below; `policyVersion`, `riskScore`, `lastControlAction` |
| Capability grant | `RuntimeCapabilityGrant` | verb + bounded `resourceScope`; `status: ACTIVE \| REVOKED \| EXPIRED` (named `RuntimeCapabilityGrant`, not `CapabilityGrant`, to respect the repo's `@aoc/protocol` namespace guard -- see `scripts/check-protocol-consumption.mjs`) |
| Authority lease | `AuthorityLeasePayload` + `SignedAuthorityLease` | Ed25519-signed, 30s default TTL, individually revocable |
| Protected action request | `ProtectedActionRequest` | what an agent submits to the Gateway per attempted action |
| Gateway decision | `GatewayDecision` | `ALLOW` or `DENY` with a typed `code`, always evidence-linked |
| Evidence event | `RuntimeEvidenceEvent` | hash-chained, append-only, tamper-evident |

## Runtime state machine

```
CREATED     -> AUTHORIZED
AUTHORIZED  -> RUNNING
RUNNING     -> PAUSED | ISOLATED | QUARANTINED | TERMINATED
PAUSED      -> RUNNING | ISOLATED | TERMINATED
ISOLATED    -> QUARANTINED | TERMINATED
QUARANTINED -> TERMINATED
TERMINATED  -> (terminal; no further transition; create a new runtime instead)
```

Only `RUNNING` is actionable -- every other state fails every protected
action closed.

## Enforcement Gateway: the 15 checks

`authorizeAction` runs, in order, until the first failure:

1. Runtime exists (`RUNTIME_NOT_FOUND`)
2. Runtime is `RUNNING` (`RUNTIME_NOT_RUNNING` / `RUNTIME_PAUSED` /
   `RUNTIME_ISOLATED` / `RUNTIME_QUARANTINED` / `RUNTIME_TERMINATED`)
3. Agent is active (`AGENT_NOT_FOUND` / `AGENT_SUSPENDED` / `AGENT_REVOKED`)
4. Lease signature verifies (`LEASE_INVALID`)
5. Lease unexpired (`LEASE_EXPIRED`)
6. Lease unrevoked (`LEASE_REVOKED`)
7. Lease tenant matches (`LEASE_TENANT_MISMATCH`)
8. Lease runtime matches (`LEASE_RUNTIME_MISMATCH`)
9. Lease agent matches (`LEASE_AGENT_MISMATCH`)
10. Capability present in the lease (`CAPABILITY_NOT_GRANTED`)
11. Capability grant still active (`CAPABILITY_REVOKED`)
12. Resource within the grant's scope (`RESOURCE_OUT_OF_SCOPE`)
13. Policy allows it -- prohibited-capability list + policy-version match (`POLICY_DENIED`)
14. Request nonce not already consumed against this lease (`LEASE_REPLAYED`)
15. No active emergency-deny (`EMERGENCY_DENIED`)

Any unexpected internal failure denies with `AUTHORITY_SERVICE_UNAVAILABLE`
rather than throwing. Every check outcome -- allow or deny -- is recorded
as a hash-chained `RuntimeEvidenceEvent`.

## HTTP API

All routes are under `/api/runtime-authority/`. Tenant scoping follows the
same `Authorization: Bearer <key>` convention every other Enterprise route
uses (`AOC_ENTERPRISE_REQUIRE_AUTH`, `AOC_ENTERPRISE_API_KEYS`).

| Method | Path | Purpose |
|---|---|---|
| POST | `/agents` | Register a governed agent |
| POST | `/agents/:agentId/suspend` | Suspend an agent (body includes `tenantId`) |
| POST | `/agents/:agentId/revoke` | Revoke an agent |
| GET  | `/agents/:agentId?tenantId=` | Read an agent |
| POST | `/runtimes` | Create a runtime (`CREATED`) |
| POST | `/runtimes/:id/authorize` | `CREATED -> AUTHORIZED` |
| POST | `/runtimes/:id/start` | `AUTHORIZED -> RUNNING` |
| GET  | `/runtimes/:id` | Read runtime state |
| POST | `/runtimes/:id/capabilities` | Grant a capability |
| GET  | `/runtimes/:id/capabilities` | List capability grants |
| POST | `/runtimes/:id/capabilities/:capability/revoke` | Revoke a capability |
| POST | `/runtimes/:id/leases` | Issue a lease |
| GET  | `/runtimes/:id/leases` | List active leases |
| POST | `/leases/:leaseId/renew` | Renew (issues a new lease, supersedes the old) |
| POST | `/leases/:leaseId/revoke` | Revoke a specific lease |
| POST | `/runtimes/:id/pause` | Pause (revokes active leases) |
| POST | `/runtimes/:id/resume` | Resume (issues a new lease) |
| POST | `/runtimes/:id/isolate` | Isolate (revokes active leases) |
| POST | `/runtimes/:id/quarantine` | Quarantine (revokes leases, captures a forensic snapshot) |
| POST | `/runtimes/:id/terminate` | Terminate (irreversible; revokes leases + grants) |
| GET  | `/runtimes/:id/evidence` | List the evidence chain |
| POST | `/runtimes/:id/evidence/verify` | Recompute and verify the chain's integrity |
| POST | `/runtimes/:id/gateway/authorize` | **The Enforcement Gateway itself** -- what a real agent runtime calls before every protected action |

Every `POST .../pause\|resume\|isolate\|quarantine\|terminate\|.../revoke`
body is `{ reason, requestedBy, severity, correlationId? }`.

## Evidence event types

`AGENT_REGISTERED, AGENT_SUSPENDED, AGENT_REVOKED, RUNTIME_CREATED,
RUNTIME_AUTHORIZED, RUNTIME_STARTED, RUNTIME_PAUSED, RUNTIME_RESUMED,
RUNTIME_ISOLATED, RUNTIME_QUARANTINED, RUNTIME_TERMINATED,
CAPABILITY_GRANTED, CAPABILITY_REVOKED, LEASE_ISSUED, LEASE_RENEWED,
LEASE_EXPIRED, LEASE_REVOKED, ACTION_REQUESTED, ACTION_AUTHORIZED,
ACTION_DENIED, ACTION_EXECUTION_STARTED, ACTION_EXECUTED, ACTION_FAILED,
POLICY_EVALUATED, ANOMALY_DETECTED`.

Hash chain: `eventHash = sha256(canonicalJson({...event, previousHash}))`,
reusing the Governance Store's `aoc.canonical-json.v1` serializer and
digest format (`sha256:<hex>`). `verifyRuntimeEvidenceChain` (pure
function, `evidence.ts`) recomputes every hash from stored content --
never trusts what is on record.

## Running the demo

```bash
npm run build
node scripts/demo-runtime-authority-pmfreak.mjs
```

Narrates the full mission section 8 flow against real code: register,
create/authorize/start, grant four capabilities, issue a lease, run the
Schedule Health Agent's four-step analysis through the Gateway, pause,
show three denied retries with the *same* lease and zero new side effects,
verify the evidence chain, demonstrate that mutating one stored event
breaks verification, resume with a new lease, run again, and show the old
lease stays permanently unusable.

To see it over real HTTP:

```bash
npm run build
node scripts/run-enterprise-host.mjs   # listens on :8787 by default
# in another shell:
cd apps/dashboard && npm start          # dashboard on :4173
```

Open the dashboard, point "API base URL" at `http://localhost:8787`, and
drive the same flow via `curl` or a small script against
`/api/runtime-authority/*` while watching the dashboard's Auto-refresh.

## Explicitly out of scope for this vertical slice

See `ADR-RUNTIME-AUTHORITY.md`, "Known limitations": no durable
persistence for agents/runtimes/grants/leases (evidence is durable within
the process; current-state is not), signer/Gateway share a process rather
than being deployed as isolated services, policy evaluation is a static
allow-list rather than an integration with
`domain-policy-pack-runtime`, `isolate` cannot forcibly close an
already-open OS-level connection, and PMFreak integration is simulated,
not wired to the real product.
