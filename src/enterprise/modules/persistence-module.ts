/**
 * Compatibility shim (PR-004): the Persistence module evolved into the
 * Governance Store module (`aoc.enterprise.governance-store`) — see
 * `./governance-store-module.js` and
 * `docs/enterprise/GOVERNANCE_STORE_MIGRATION_V1.md`.
 *
 * @deprecated Import from `./governance-store-module.js` instead.
 */
export { createPersistenceModule, createGovernanceStoreModule, PERSISTENCE_MODULE_ID, GOVERNANCE_STORE_MODULE_ID } from './governance-store-module.js';
