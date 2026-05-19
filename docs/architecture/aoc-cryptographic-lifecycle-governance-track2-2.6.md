# AOC Cryptographic Lifecycle Governance (Track 2.6)

## Summary
Track 2.6 upgrades runtime cryptographic semantics from static signer verification to evolving trust governance:
- durable capability-claim lifecycle state,
- key-id aware signing and verification,
- rotation-aware trust checks,
- verification trust windows,
- explicit audit delivery policy behavior.

## Governance model
- `RuntimeSignerPort` now exposes `getCurrentKeyId()`, `getTrustedVerificationKeys()`, and `verifyWithKeyId()`.
- All signed envelopes include signer metadata (`signerId`, `keyId`, `algorithm`, `issuedBy`, `trustAnchorVersion`).
- Capability claims persist to `CapabilityClaimStorePort` and can be revoked independently.
- Claim verification enforces signature, trust, expiry, revocation, expected actor/org/trust-domain, and verification window checks.
- Audit policy is explicit via `auditDeliveryPolicy` (`fail-open`, `fail-closed`, `warn-only`).

## Production expectations
DEMO host adapters remain intentionally in-memory and non-durable. Production hosts should use durable claim/grant/delegation stores, audited key-rotation workflows (KMS/HSM), and explicit trust-anchor governance procedures.

## Remaining blockers
- No built-in distributed retry queue for audit sink delivery (host concern).
- Key material lifecycle (HSM-backed signing, revocation publication channels) remains host-owned.
- Trust anchor evolution and external attestation are modeled but not globally orchestrated by runtime.
