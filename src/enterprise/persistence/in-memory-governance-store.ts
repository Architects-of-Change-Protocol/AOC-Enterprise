/**
 * Compatibility shim (PR-004): the in-memory store now lives in
 * `../governance-store/in-memory-governance-store.js` and implements the
 * full Governance Store v1 semantics (append-oriented aggregates,
 * idempotency, reconstruction, verification, tenant scope). The factory
 * signature is backward compatible — zero-argument construction still works.
 *
 * @deprecated Import from `../governance-store/index.js` instead.
 */
export { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
export type { CreateGovernanceStoreOptions } from '../governance-store/in-memory-governance-store.js';
