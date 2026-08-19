# Soberanía Runtime Lifecycle Integrity — Track 2.2.5

## Lifecycle API audit and risk inventory

| API | Classification after Track 2.5 | Lifecycle risk addressed |
| --- | --- | --- |
| `createAocEnterpriseRuntime()` | A — production-safe composition boundary | Remains registry-free and requires explicit host ports for signing, lifecycle persistence, replay protection, and audit. |
| `issueExecutionGrant()` | A with durable host dependency | Signs, persists, records nonce, and audits issued grants. Production safety depends on durable `ExecutionGrantStorePort` and `ReplayProtectionPort`. |
| `validateExecutionGrant()` | A with durable host dependency | Verifies signature, expiry, revocation, consumed status, and expected scope; audits validation result. |
| `consumeExecutionGrant()` | A if host atomicity contract is met | Validates and atomically marks consumed through the host store; duplicate consumption returns `grant_replayed`. |
| `revokeExecutionGrant()` | A with durable host dependency | Persists revocation through `ExecutionGrantStorePort` and audits `grant_revoked`. |
| `issueDelegatedCapability()` | A with durable host dependency | Signs, persists, records nonce, and audits issue. Parent linkage is now **validated** rather than merely recorded: a claimed `parentDelegationId`/`parentGrantId` that is unknown, revoked, expired, non-redelegable, in another organization, or narrower than the child is refused. A child with no explicit `expiresAt` inherits its parent's. |
| `evaluateDelegatedAccess()` | B — production-shaped with host policy dependency | Verifies signature, persistent presence, revocation, expiry, actor/org/scope constraints, legacy delegation validation, and agent access policy. Additionally **re-walks the full ancestry at every call** — ancestor existence, revocation, expiry, containment on every axis, depth and cycles — so nothing is trusted from issuance. Host policy completeness remains host-owned. |
| `revokeDelegatedCapability()` | A for direct and descendant revocation | Persists direct delegation revocation and audits it. Descendants no longer need a store cascade: lineage is re-resolved at every evaluation, so revoking one link refuses its whole subtree without any descendant record being rewritten. |
| `createCapabilityClaim()` | B — production-shaped, revocation incomplete | Signs claims with claim id, actor, org, trust domain, issued/expiry metadata, nonce, and audit event. Claim revocation store is not implemented. |
| `verifyCapabilityClaim()` | B — production-shaped, revocation incomplete | Verifies signature, expiry, actor/org/trust-domain expectations, and audits result. Claim revocation is a remaining blocker. |

## Lifecycle model

Runtime lifecycle artifacts are signed envelopes owned by the portable runtime and persisted by host ports:

- execution grants authorize a one-time runtime execution handoff;
- delegated capabilities authorize constrained downstream access, bounded by a lineage that is validated at issuance and re-validated at every use (see `docs/enterprise/AOC_DELEGATED_CAPABILITIES_DERIVED_AUTHORITY.md`);
- capability claims assert actor/org/trust-domain capability facts;
- replay protection records nonces/jtis for issued artifacts;
- lifecycle audit records every transition or denial attempt.

The runtime remains registry-free. It does not import PMFreak, Supabase, Next.js, or registry bootstrap code.

## Grant lifecycle state machine

```text
issued -> validated -> consumed
issued -> validated_denied(expired|revoked|scope_mismatch|signature_invalid)
issued -> revoked -> denied(grant_revoked)
consumed -> replay_denied(grant_replayed)
```

Host requirements:

- `persistGrant()` must durably store the signed grant.
- `markGrantConsumed()` must be atomic and single-winner.
- `isGrantConsumed()` and `isGrantRevoked()` must reflect durable state.
- `revokeGrant()` must survive process restart when production revocation is required.

Reason codes include `grant_replayed`, `grant_revoked`, `grant_expired`, `grant_signature_invalid`, and `grant_scope_mismatch`.

## Delegation lifecycle state machine

```text
issued -> validated -> allowed
issued -> denied(invalid|expired|scope_mismatch|signature_invalid|policy_denied)
issued -> revoked -> denied(delegation_revoked)
```

Host requirements:

- `persistDelegation()` must durably store signed delegations.
- `validateDelegation()` may enforce host-specific hierarchy, parent grant, actor, resource, and policy rules.
- `revokeDelegation()` must record revocation durably.
- Descendant cascade or descendant flagging is not hard-coded; hosts that support delegation trees must implement cascade semantics in their store/policy layer.

Reason codes include `delegation_invalid`, `delegation_expired`, `delegation_revoked`, `delegation_scope_mismatch`, `delegation_signature_invalid`, and `delegation_policy_denied`.

## Capability claim lifecycle

Claims are signed with `claimId`, `issuedAt`, `expiresAt`, `trustDomain`, `actorId`, `orgId`, and `nonce`. Verification checks signature, expiry, and expected actor/org/trust-domain values.

Remaining blocker: claim revocation storage is not implemented in Track 2.5. Production hosts that need claim revocation must add a claim revocation store before relying on long-lived claims.

## Replay protection model

Execution grants, delegated capabilities, and capability claims include nonces. The runtime calls `ReplayProtectionPort.recordNonce()` on issuance. Hosts must make nonce uniqueness durable for their deployment model.

Grant consumption replay prevention is stronger than nonce uniqueness: `ExecutionGrantStorePort.markGrantConsumed()` is the required atomic method for one-time consumption. The runtime intentionally does not fake atomicity.

## Audit guarantee model

Every lifecycle transition attempts to emit a structured lifecycle audit event through `AuditSinkPort.emitLifecycleAudit()`.

Covered events:

- `grant_issued`, `grant_validated`, `grant_consumed`, `grant_replayed`, `grant_revoked`
- `delegation_issued`, `delegation_validated`, `delegation_revoked`, `delegation_denied`
- `claim_issued`, `claim_verified`, `claim_denied`
- `lifecycle_error`

Audit events include runtime id, trust domain, actor/subject ids when known, org/tenant ids when known, artifact ids, reason codes, timestamp, and decision/result.

Production audit durability is host-owned. Hosts should not acknowledge audit success until their audit sink meets the organization's durability and retention requirements.

## Durable host port requirements

Required lifecycle ports:

- `ExecutionGrantStorePort`
- `DelegationStorePort` as `lifecycleDelegationStore`
- `ReplayProtectionPort`
- `AuditSinkPort` as `lifecycleAuditSink`
- `RuntimeSignerPort`

The existing policy, identity, capability registry, legacy delegation, agent access, and authorization audit ports remain host-provided.

## Mock/demo limitations

`examples/enterprise-runtime-host/mock-ports.ts` provides in-memory stores only for local demonstration. They are not production durable, not cross-process consistent, and not safe as a replay/revocation authority after restart.

## Remaining production blockers

1. Capability claim revocation store is not yet part of the runtime contract.
2. Delegation descendant cascade behavior is a host-store responsibility and not standardized.
3. Key rotation and multi-key verification policy remain signer-port responsibilities.
4. Audit delivery failure policy is limited to a best-effort `lifecycle_error` attempt; hosts needing fail-closed audit must enforce it at the port boundary.
