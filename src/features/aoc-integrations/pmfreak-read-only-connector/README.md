# AOC PMFreak Read-Only Connector v1

Connector ID:

```
aoc.integration.pmfreak.read_only_connector.v1
```

## Purpose

Provides the first read-only integration boundary between AOC Enterprise and PMFreak data.

This connector reads PMFreak projects, agents, milestones, tasks, risks, evidence references, approval references and action proposals into AOC-safe connector snapshots.

This connector does not create governance decisions.
This connector does not call the PMFreak Agent Passport resolver.
This connector does not call the PMFreak Project Governance Scenario runner.
This connector does not create Control Plane views.
This connector does not create Narrative Exports.
This connector does not mutate PMFreak data.
This connector does not write back decisions.
This connector does not execute actions.
This connector does not send communications.
This connector does not create invoices.
This connector does not provide legal advice.
This connector does not certify compliance.

## Why this PR, and why now

The prior PMFreak demo layers (Agent Passport Demo Pack, Project Governance Scenario Pack, Demo Control Plane View, Demo Narrative Export Pack) answered whether AOC Enterprise can govern, explain, present, and export PMFreak-like agent decisions -- all on deterministic fixtures. This connector answers a different question: **can AOC Enterprise safely read PMFreak data?**

It moves the demo one step from "fixtures only" toward "read-only access to actual PMFreak projects, agents, milestones, tasks, risks, evidence references, approval references and action proposals" -- without crossing into production execution, writeback, or enforcement. Those are all out of scope for this PR by design; see "What this connector deliberately does not do" below.

## Architecture

```
AOC PMFreak Read-Only Connector
  reads
PMFreak source data
  normalizes
AOC-safe PMFreak connector snapshots
  later consumed by
Project Snapshot Adapter / Action Intake / Dry-Run Decision Bridge   (future PRs, not this one)
```

This connector never inverts that arrow. It never decides (`allow`/`deny`/`require_evidence`/`require_approval`), never mutates a PMFreak project/task/milestone/risk/billing/client-communication record, and never sends an email, Slack message, invoice, or approval request.

## Connector layers

| Layer | Module | What it does |
| --- | --- | --- |
| Constants | `pmfreak-read-only-connector-constants.ts` | Connector id/name/system id, capability names, forbidden-operation catalog, safe labels, disclaimers. |
| Shared types | `pmfreak-read-only-connector-types.ts` | `AocPMFreakReadOnlyConnectorEnvironment`, `AocPMFreakReadOnlyConnectorSourceKind`. |
| Descriptor | `pmfreak-read-only-connector-descriptor.ts` | Static, self-describing scope statement (`createAocPMFreakReadOnlyConnectorDescriptor`). |
| Config | `pmfreak-read-only-connector-config.ts` | Safe-by-default configuration; `readOnly`/`allowMutations` cannot be set unsafe (`createAocPMFreakReadOnlyConnectorConfig`). |
| Read models | `pmfreak-read-models.ts` | Typed, normalized PMFreak project/agent/milestone/task/risk/evidence-reference/approval-reference/action-proposal records. |
| Read-only source | `pmfreak-read-only-source.ts` | `AocPMFreakReadOnlySource` -- the contract every source implementation (in-memory, real-source adapter) satisfies. |
| Connector client | `pmfreak-read-only-client.ts` | `createAocPMFreakReadOnlyConnectorClient` -- reads every read model from a source, redacts, and returns a snapshot. |
| Connector snapshot | `pmfreak-connector-snapshot.ts` | Immutable, deterministic read of PMFreak data (`createAocPMFreakConnectorSnapshot`). Not a Control Plane view model; carries no governance verdict. |
| Health/status model | `pmfreak-connector-health.ts` | `createAocPMFreakConnectorHealth` -- deterministic `healthy`/`degraded`/`unavailable` derived from warnings/errors. |
| Error model | `pmfreak-connector-errors.ts` | `createAocPMFreakConnectorError` -- safe, typed, deterministic errors (`AocPMFreakConnectorError`). Never leaks secrets/tokens/connection strings. |
| Redaction helpers | `pmfreak-redaction.ts` | `redactAocPMFreakConnectorValue` / `redactAocPMFreakConnectorSnapshot` -- `none` / `safe_demo` / `strict` modes. Never mutates input. |
| No-mutation guard | `pmfreak-no-mutation-guard.ts` | `assertAocPMFreakReadOnlyOperation` / `isAocPMFreakForbiddenConnectorOperation` -- a guardrail, not an executor. |
| Claim-safety guard | `pmfreak-read-only-claim-safety.ts` | `evaluateAocPMFreakReadOnlyConnectorClaimSafety` / `assertNoAocPMFreakReadOnlyConnectorOverclaim`, layered on the universal Policy Pack Foundation claim-safety harness. |

## Current source support

- **`in_memory`** -- `createInMemoryAocPMFreakReadOnlySource` (`pmfreak-in-memory-source.ts`). A deterministic, opaque demo fixture graph (`pmfreak-read-only-connector-fixtures.ts`) for tests and demo/dev mode. Every `list*` call returns a fresh, independent copy of the underlying data -- callers can never mutate the source, and repeated calls always return equal data.
- **`api` / `database` / `supabase`** -- this repository does not (yet) contain a discoverable real PMFreak API client, Supabase client, or database schema to adapt. `createUnsupportedAocPMFreakRealReadOnlySource(sourceKind)` (`pmfreak-real-source-adapter.ts`) is used instead: every `list*` method rejects with a safe `unsupported_source_kind` connector error. It makes no network call, requires no secret, and never fakes a production read.

### What a future real source adapter needs

Before `createAocPMFreakApiReadOnlySource`, `createAocPMFreakSupabaseReadOnlySource`, or `createAocPMFreakDatabaseReadOnlySource` can be implemented, the following must be discoverable (and documented) in this repository:

- Auth mechanism (how the adapter authenticates a read-only credential)
- Read endpoint/table names for projects, agents, milestones, tasks, risks, evidence references, approval references, and action proposals
- The field shape PMFreak actually returns for each of those record kinds
- Tenant/workspace scoping rules
- Pagination behavior
- Rate limits
- Error semantics (what a "not found," "unauthorized," or "unavailable" response looks like)

Until then, any real adapter would have to invent API routes, credentials, or a database schema -- which this connector deliberately does not do.

## Safe meaning -- what reading PMFreak data does *not* imply

- Reading PMFreak data does not mean AOC has approved an action.
- Reading evidence references does not certify evidence.
- Reading approval references does not certify approval validity.
- Reading billing-related data does not certify invoice readiness.
- Reading jurisdiction-related fields does not certify compliance.

Every evidence/approval reference read model carries `present: boolean` (whether PMFreak reports the record exists) -- never a validity, sufficiency, or certification judgment.

## What this connector deliberately does not do

- No governance decisions (`allow`/`deny`/`require_evidence`/`require_approval`)
- No call to `resolvePMFreakAgentPassportAction` (the PMFreak Agent Passport resolver)
- No call to the PMFreak Project Governance Scenario runner
- No Control Plane view models
- No Narrative Exports
- No writeback to PMFreak
- No project/task/milestone/risk/evidence-reference/approval-reference mutation
- No invoice creation
- No email, Slack/Teams, or client-communication sending
- No human approval workflow
- No production enforcement gateway or action execution
- No legal advice, compliance certification, invoice-readiness certification, or customer-acceptance certification

`AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS` names every operation this connector refuses to perform; `assertAocPMFreakReadOnlyOperation` throws a `mutation_not_allowed` connector error for any of them. This is a guardrail, not an executor -- none of those operations has an implementation anywhere in this module.

## What's next

Next PR: **AOC PMFreak Project Snapshot Adapter v1**

That PR will convert read-only PMFreak connector snapshots (this PR's output) into AOC project-governance snapshot inputs.

This connector only reads and normalizes data.
