# Runtime Operational State

Deterministic runtime-local operational continuity layer for session lifecycle, replay continuity, and orchestration progression.

- Not persistence infrastructure.
- Not database abstraction.
- Storage-agnostic snapshot/hydration boundary for future federation + vault integration.

## Model
Tracks continuity identifiers, counters, lifecycle markers, replay metadata, active grants/delegations, and audit lineage.

## Snapshot/Hydration
Snapshots are pure JSON and deterministic. Hydration validates continuity IDs, sequence monotonicity, replay integrity, and snapshot compatibility version.
