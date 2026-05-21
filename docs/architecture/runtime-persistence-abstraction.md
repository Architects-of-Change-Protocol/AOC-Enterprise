# Runtime Persistence Abstraction

This document defines a storage-agnostic runtime persistence boundary for AOC-Enterprise. It introduces deterministic JSON persistence envelopes, adapter contracts, serialization/validation rules, and orchestration hooks.

## Philosophy
- Storage agnostic adapters only (no Supabase/Redis/filesystem/provider implementation).
- Deterministic envelope and serialization for portable recovery and federation payload compatibility.
- Persistence is an orchestration boundary layered over existing runtime operational state.

## Vault and Federation
- Vault integration can implement `RuntimePersistenceAdapter` later without changing runtime logic.
- Federation can exchange `RuntimePersistenceEnvelope` as portable recovery payloads.

## Recovery and Replay Continuity
- Envelope carries continuity IDs, lifecycle markers, denied nonces, and replay lineage metadata.
- Hydration enforces validation and continuity-replay preservation checks.

## Deterministic Persistence
- JSON-only, executable-reference-free payloads.
- Stable key ordering in serialization.
- Structured validation reports for compatibility and integrity checks.
