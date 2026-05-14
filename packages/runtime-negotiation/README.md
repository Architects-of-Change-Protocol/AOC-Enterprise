# Runtime Sovereignty Negotiation Layer (AOC Core)

This module introduces governance-native runtime-to-runtime negotiation for AOC Core sovereign runtimes.

## Why runtime negotiation exists

AOC federation was previously static. This layer adds dynamic but bounded negotiation semantics so runtimes can establish temporary governance agreements without implicit trust transfer.

## Sovereignty negotiation philosophy

- Negotiation is explicit, typed, and explainable.
- Authority exchange is always bounded by capability and execution restrictions.
- Trust compatibility is evaluated, never assumed.
- Temporary agreements must be constrained by envelopes and attestation references.

## Temporary authority negotiation

Negotiations can request federation expansion, delegation extension, AI execution, isolation exceptions, remote execution authority, trust recovery, and emergency governance scopes. Approval requires a negotiation envelope with temporal limits and replay protections.

## Isolation exception handling

Isolation exceptions are evaluated against source/target isolation profiles. Strict isolation profiles block exceptions by default and force incompatibility.

## Trust negotiation semantics

Trust compatibility is derived from posture, federation history, degradation signals, attestation continuity, unresolved failures, and escalation history. Trust degradation and recovery functions are explicit and reversible only when eligibility criteria are met.

## Explainable runtime compatibility

Boundary decisions capture incompatibility reasons, blocked capabilities, blocked execution scopes, required human reviews, and trust warnings.

## Anti-authority-bleed positioning

This layer prevents unsafe sovereignty bleed by requiring:

- explicit capability boundary references
- explicit execution restrictions
- explicit attestation references
- replay-protection references
- explicit conditions for conditional approvals

## Relationship to execution fabric and sovereign runtimes

The module adds lightweight integration seams for execution continuation eligibility, federation expansion eligibility, temporary authority, AI execution continuation, escalation requirements, and human review continuation.

## Current limitations

- no cryptographic signing beyond reference-based attestation linkage
- no distributed consensus or multi-party conflict resolution
- no automatic trust escalation
- no network protocol for cross-runtime transport
- policy references are opaque strings; policy engine integration remains external
