/**
 * Compatibility shim (PR-004). The PR-002 minimal decision store evolved
 * into the Soberanía Enterprise Governance Store v1 — `../governance-store/` is
 * its home. This module preserves the historical import path; every symbol
 * re-exported here is the v1 contract. The legacy method surface
 * (`persistEvaluation`, `getRequestById`, …) still exists on the v1
 * `GovernanceStore` interface, implemented on top of the append-oriented
 * model — see `docs/enterprise/GOVERNANCE_STORE_MIGRATION_V1.md`.
 *
 * @deprecated Import from `../governance-store/index.js` (or the package's
 * `/enterprise` export) instead.
 */

export type {
  GovernanceStore,
  EnterpriseEventRecord,
  EnterpriseVersionRecord,
  GovernanceDecisionTraceRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  PersistEvaluationOutcome,
} from '../governance-store/governance-store.js';

export type {
  GovernanceRecord,
  GovernanceRequestRecord,
  GovernanceEvaluationRecord,
  GovernanceTraceRecord,
} from '../governance-store/contracts.js';
