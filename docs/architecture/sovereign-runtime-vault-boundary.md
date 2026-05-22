# Sovereign Runtime Vault Boundary

## Sovereign runtime philosophy
The sovereign runtime vault boundary separates runtime continuity from concrete infrastructure, allowing runtime state to remain deterministic and portable across environments.

## BYOS philosophy
Vault contracts are storage-agnostic and explicitly BYOS-compatible: persistence location and provider are externalized behind adapter contracts.

## Runtime portability model
Portable vault boundaries encapsulate runtime persistence envelopes with identity, continuity, isolation, and attestation semantics.

## Vault isolation semantics
Isolation validates tenant/workspace/runtime/trust-domain ownership and continuity lineage coherence. Drift and replay contamination are rejected through structured validation reports.

## Continuity portability
Vault export/import preserves continuity epoch/version, operational sequence, restoration lineage, and replay lineage.

## Replay lineage preservation
Replay lineage IDs and denied nonce lineage are carried as deterministic continuity metadata.

## Runtime mobility semantics
Runtime mobility is enabled by exportable boundaries that can be hydrated in compatible runtime contexts with monotonic continuity constraints.

## Federation preparation
Boundary identity includes federation compatibility version and sovereign scope to prepare for future distributed synchronization.

## Why storage vendors remain abstracted
Abstraction preserves sovereignty, limits lock-in, enables local/hybrid/enterprise deployment, and supports future cryptographic hardening without runtime redesign.
