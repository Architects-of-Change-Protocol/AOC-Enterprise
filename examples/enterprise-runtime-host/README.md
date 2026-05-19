# Enterprise Runtime Host Example

This example shows how an external host composes `createAocEnterpriseRuntime()` with explicit host-provided ports.

## DEMO ONLY lifecycle stores

`mock-ports.ts` includes in-memory implementations for:

- execution grant persistence and one-time consumption;
- delegated capability persistence and revocation;
- replay protection for nonces/jtis;
- lifecycle audit event capture.

These stores are **DEMO ONLY — not production durable**. They reset on process restart, do not provide cross-process consistency, and are not suitable for production runtime lifecycle integrity.

## Production host responsibilities

Production hosts must replace the demo stores with durable host infrastructure:

- `ExecutionGrantStorePort` must persist grants, revocations, and consumed state. `markGrantConsumed()` must be atomic and must return `consumed: false` for duplicate consumption so the runtime can report `grant_replayed`.
- `DelegationStorePort` must persist delegations and revocations durably. If a host supports delegation hierarchies, it is responsible for descendant cascade/flag behavior during revocation.
- `ReplayProtectionPort` must enforce nonce/jti uniqueness within the runtime scope until expiry. Use a TTL-backed durable or distributed store when multiple workers can issue or verify lifecycle artifacts.
- `AuditSinkPort.emitLifecycleAudit()` should durably record lifecycle transitions (`grant_issued`, `grant_consumed`, `delegation_revoked`, `claim_verified`, and denial/replay events). If audit durability is required, do not acknowledge events before the audit sink is durable.
- `RuntimeSignerPort` must use host-controlled signing/verification and key rotation appropriate to the trust domain.

## Atomicity expectations

The runtime does not fake database atomicity. Grant consumption safety depends on the host implementation of `ExecutionGrantStorePort.markGrantConsumed()`. In production this should be a compare-and-set, unique insert, transaction, or equivalent single-winner operation.

## Replay protection expectations

Execution grants, delegated capabilities, and capability claims carry nonces. The host replay store decides the durability and distribution guarantees for those nonces. Production hosts should align TTLs with artifact expiry and trust-domain policy.
