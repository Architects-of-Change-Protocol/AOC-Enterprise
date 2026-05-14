# Governance Treaty Layer (AOC Core)

Governance treaties add **durable, multi-runtime governance state** on top of transient runtime negotiations.

## Why treaties exist
- Negotiations are ephemeral and usually bilateral.
- Treaties preserve sovereign alignment across trust domains, coalitions, and delegated authority blocs.

## Treaty vs negotiation
- Negotiation: temporary, proposal-driven, session-scoped.
- Treaty: persistent, lifecycle-managed, quorum-governed, amendable, and dispute-aware.

## Treaty vs legal contract
This is **not legal contract automation**. Treaty objects are protocol governance artifacts used by AOC runtimes to enforce technical authority boundaries.

## Lifecycle philosophy
Treaties are created in `proposed`, then activated. They can be suspended, disputed, expired, or revoked. Revoked treaties are terminal; expired treaties require extension amendment.

## Quorum authority model
Authority decisions are only valid when quorum rules are satisfied over active participants and role requirements. Suspended/exited participants do not count; observers are excluded from authority quorum unless explicitly included.

## Delegated sovereignty blocs
`delegated_sovereignty_bloc` treaty type models durable, delegated governance coordination across sovereign runtimes.

## Disputes and arbitration
Disputes can be raised and assigned to arbitrators/audit witnesses. Open disputes block authority expansion. Resolution requires attestation references.

## Attestation continuity
Treaties carry references to attestation evidence for creation, amendments, disputes, quorum, and authority decisions. No cryptography is implemented in this module; attestation layer integration is reference-only.

## Integration seams
The module is intentionally lightweight and pure-function based, so existing runtime negotiation, execution fabric, distributed governance, capability runtime, audit plane, trust posture, and AI governance profile flows can call into treaty checks without rewrites.

## Current limitations
- In-memory/object-level semantics only.
- No persistence adapter in this module.
- No distributed consensus.
- No legal interpretation/external workflow integration.
