# AOC Recognition Runtime

The Recognition Runtime is the first working implementation of AOC's capability-token
protocol for recognized autonomous action:

- **Passport** lets an actor be recognized.
- **Capability Token** lets an actor act.
- **Recognition Runtime** decides whether the action counts.
- **Audit Proof** explains why.

This module is a self-contained, deterministic decision engine. It registers actors,
trust domains, passports and capability tokens; evaluates `ActionRequest`s against a
fixed chain of policies; and returns a typed `RecognitionDecision`, with every decision
recorded as a hash-chained `AuditEvent`. It is not a generic agent framework and it is
not a legal system — it is a narrow, auditable gate that decides whether a requested
action is recognized.

## Passport vs. Capability Token

- A **Passport** answers "who is this actor, and is that identity currently
  recognized?" It binds an actor to a trust domain and an issuer, and it can be valid,
  expired, suspended or revoked. It carries no authority by itself.
- A **Capability Token** answers "what is this actor allowed to do, and where?" It
  grants a bounded set of `actions` over a bounded set of `resourceScopes`, can require
  evidence or human approval for specific actions, can be delegated (within a depth
  limit fixed at issuance), and can never grant more than its own issuer holds.

An actor without a passport is not recognized. A recognized actor without a capability
token is recognized but has no authority to act. Both are required for any scoped
action to be allowed.

## The recognition pipeline

`RecognitionVerifier.verifyAction` resolves the actor, trust domain, passport and
capability token referenced by an `ActionRequest`, then runs a fixed, ordered chain of
policies via `PolicyEvaluator`. The chain stops at the first policy that fails; every
policy that ran (passed or failed) is recorded in `RecognitionDecision.policyResults`.
Order encodes precedence — recognition before authority, revocation before expiry,
prohibition before scope, scope before evidence, evidence before approval:

1. `recognized_actor_required`
2. `rogue_actor_denied`
3. `revocation_wins`
4. `valid_passport_required`
5. `valid_capability_required`
6. `prohibited_action_denied`
7. `scope_required`
8. `delegation_limited`
9. `evidence_required`
10. `approval_required`

If every policy passes, the decision is `allow`. Every evaluation — allowed or
denied — is written to the `EvidenceLedger` as an `AuditEvent`.

## Decision types

| Type | Meaning |
| --- | --- |
| `allow` | Every policy passed; the action is recognized. |
| `require_human_approval` | Recognized, but this action needs a named human approver first. |
| `require_more_evidence` | Recognized, but required evidence is missing. |
| `deny` | Recognized actor/passport/token, but generically not permitted (e.g. suspended). |
| `revoked` | The actor, passport or capability token has been revoked. |
| `expired` | The passport or capability token has passed its `expiresAt`. |
| `unrecognized_actor` | No actor, an untrusted actor type, or an actor outside the trust domain. |
| `invalid_passport` | The passport is missing, malformed, or does not match the request. |
| `invalid_capability` | The capability token is missing, malformed, or does not match the request. |
| `out_of_scope` | The action or resource is not granted by the capability token. |
| `policy_violation` | The action is explicitly prohibited, or delegation limits were exceeded. |

## Demo scenarios: Datasys Agent Republic

`fixtures/` builds a trust domain named **Datasys Agent Republic** with:

- **Victor Valverde** (human), **Datasys** (organization), **PMFreak Closure Agent**
  (recognized agent), and an **Unknown External Agent** (unrecognized/rogue).
- Passports for Victor, Datasys and PMFreak; no passport for the unknown agent.
- A capability token letting PMFreak `draft_closure_email`, `summarize_project_status`
  and `prepare_invoice_support` within `project:HMP-14665`, with `send_final_invoice`,
  `approve_payment` and `sign_contract` explicitly prohibited, and evidence required
  for drafting the closure email.
- A separate capability token requiring human approval before PMFreak can
  `send_client_follow_up`.

`tests/demo-scenarios.test.ts` exercises all ten required scenarios end to end,
including a human (Victor) delegating drafting authority to PMFreak, and PMFreak
attempting to forge a further redelegation beyond what it was granted.

## Why this is deterministic, not an LLM

Every policy in `policies/` is a plain, synchronous function of an `ActionRequest` and
a `PolicyContext` built from typed domain records — no model call, no prompt, no
sampling. The runtime never reads the wall clock or generates random IDs internally;
`RuntimeContext` injects a `Clock` and an `IdGenerator`, so the exact same inputs
always produce the exact same `RecognitionDecision` and the exact same
`AuditEvent.eventHash` (see `tests/recognition-runtime.test.ts`,
"produces the same deterministic decision and hashes across two independently
constructed runtimes"). This is what makes the runtime auditable: a decision can be
replayed and re-verified, and the audit trail's hash chain (`previousHash` /
`eventHash`) makes tampering with recorded history detectable.

## Layout

```
domain/     Typed records: Actor, TrustDomain, Passport, RecognitionCapabilityToken,
            ActionRequest, RecognitionDecision, AuditEvent, Policy contracts.
services/   ActorRegistry, TrustDomainService, PassportService,
            CapabilityTokenService, PolicyEvaluator, RevocationEngine,
            EvidenceLedger, RecognitionVerifier.
policies/   The ten policies listed above, plus the default evaluation order.
runtime/    AocRecognitionRuntime facade, injectable Clock/IdGenerator, error types.
fixtures/   The Datasys Agent Republic demo world.
tests/      Unit tests per service/policy, plus the ten required demo scenarios.
```

## Usage

```ts
import { createAocRecognitionRuntime, createRuntimeContext } from './runtime/index.js';

const runtime = createAocRecognitionRuntime(createRuntimeContext('2026-01-01T00:00:00.000Z'));

const issuer = runtime.registerActor({ type: 'organization', displayName: 'Acme Org' });
const trustDomain = runtime.createTrustDomain({
  name: 'Acme Trust Domain',
  issuerActorId: issuer.id,
  acceptedIssuerIds: [issuer.id],
  acceptedActorTypes: ['agent'],
});
const agent = runtime.registerActor({
  type: 'agent',
  displayName: 'Filing Agent',
  issuerId: issuer.id,
  trustDomainId: trustDomain.id,
});
const passport = runtime.issuePassport({
  type: 'agent_passport',
  subjectActorId: agent.id,
  issuerActorId: issuer.id,
  trustDomainId: trustDomain.id,
});
const capabilityToken = runtime.issueCapabilityToken({
  subjectActorId: agent.id,
  principalActorId: issuer.id,
  issuerActorId: issuer.id,
  trustDomainId: trustDomain.id,
  capability: 'filing.submit',
  actions: ['file_report'],
  resourceScopes: ['report:Q1'],
  riskLevel: 'low',
});

const decision = runtime.submitActionRequest(
  runtime.buildActionRequest({
    actorId: agent.id,
    passportId: passport.id,
    capabilityTokenId: capabilityToken.id,
    trustDomainId: trustDomain.id,
    action: 'file_report',
    resource: 'report:Q1',
  }),
);

console.log(decision.type); // "allow"
console.log(runtime.getAuditTrail()); // every decision, hash-chained
```
