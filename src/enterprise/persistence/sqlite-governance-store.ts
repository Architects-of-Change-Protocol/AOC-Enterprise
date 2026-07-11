/**
 * Compatibility shim (PR-004): the SQLite store now lives in
 * `../governance-store/sqlite-governance-store.js` and implements the full
 * Governance Store v1 schema (`aoc.governance-store.schema.v1`), including
 * the non-destructive migration of PR-002 databases. The factory signature
 * is backward compatible — `createSqliteGovernanceStore(dbPath)` still works.
 *
 * @deprecated Import from `../governance-store/index.js` instead.
 */
export { createSqliteGovernanceStore } from '../governance-store/sqlite-governance-store.js';
export type { CreateSqliteGovernanceStoreOptions } from '../governance-store/sqlite-governance-store.js';
