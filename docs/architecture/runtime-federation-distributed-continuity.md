# Runtime Federation & Distributed Continuity

Infrastructure-agnostic federation substrate for deterministic continuity exchange between sovereign runtimes.

- No networking, consensus, locks, or orchestration.
- JSON-only federation envelopes.
- Replay continuity carries denied nonce lineage and ordering invariants.
- Reconciliation is deterministic and report-driven (`accepted`, `partially_merged`, `continuity_conflict`, `replay_conflict`, `lineage_conflict`, `rejected`).
- Federation attestation uses deterministic fingerprints (non-cryptographic for now).
- Lineage tracks continuity/restoration/federation ancestry for portability and future mesh compatibility.
