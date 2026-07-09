export {
  AOC_PMFREAK_READ_ONLY_CONNECTOR_ID,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_NAME,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_VERSION,
  AOC_PMFREAK_SYSTEM_ID,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_CAPABILITIES,
  AOC_PMFREAK_FORBIDDEN_CONNECTOR_OPERATIONS,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_SAFE_LABELS,
  AOC_PMFREAK_READ_ONLY_CONNECTOR_DISCLAIMERS,
} from './pmfreak-read-only-connector-constants.js';

export type { AocPMFreakReadOnlyConnectorEnvironment, AocPMFreakReadOnlyConnectorSourceKind } from './pmfreak-read-only-connector-types.js';

export type { AocPMFreakReadOnlyConnectorDescriptor } from './pmfreak-read-only-connector-descriptor.js';
export { createAocPMFreakReadOnlyConnectorDescriptor } from './pmfreak-read-only-connector-descriptor.js';

export type { AocPMFreakReadOnlyConnectorConfig, AocPMFreakReadOnlyConnectorConfigInput, AocPMFreakReadOnlyConnectorRedactionMode } from './pmfreak-read-only-connector-config.js';
export { createAocPMFreakReadOnlyConnectorConfig } from './pmfreak-read-only-connector-config.js';

export type {
  AocPMFreakProjectStatus,
  AocPMFreakProjectPhase,
  AocPMFreakProjectReadModel,
  AocPMFreakAgentRole,
  AocPMFreakAgentStatus,
  AocPMFreakAgentReadModel,
  AocPMFreakMilestoneStatus,
  AocPMFreakMilestoneReadModel,
  AocPMFreakTaskStatus,
  AocPMFreakTaskReadModel,
  AocPMFreakRiskSeverity,
  AocPMFreakRiskStatus,
  AocPMFreakRiskReadModel,
  AocPMFreakEvidenceKind,
  AocPMFreakEvidenceReferenceReadModel,
  AocPMFreakApprovalKind,
  AocPMFreakApprovalReferenceReadModel,
  AocPMFreakActionProposalCategory,
  AocPMFreakActionProposalStatus,
  AocPMFreakActionProposalReadModel,
} from './pmfreak-read-models.js';

export type { AocPMFreakReadOnlySource } from './pmfreak-read-only-source.js';

export type { AocPMFreakConnectorSnapshot, AocPMFreakConnectorSnapshotCounts, CreateAocPMFreakConnectorSnapshotInput } from './pmfreak-connector-snapshot.js';
export { createAocPMFreakConnectorSnapshot } from './pmfreak-connector-snapshot.js';

export type { AocPMFreakConnectorHealth, AocPMFreakConnectorHealthStatus, CreateAocPMFreakConnectorHealthInput } from './pmfreak-connector-health.js';
export { createAocPMFreakConnectorHealth } from './pmfreak-connector-health.js';

export type { AocPMFreakConnectorError, AocPMFreakConnectorErrorCode } from './pmfreak-connector-errors.js';
export { AocPMFreakConnectorRuntimeError, createAocPMFreakConnectorError } from './pmfreak-connector-errors.js';

export { redactAocPMFreakConnectorValue, redactAocPMFreakConnectorSnapshot } from './pmfreak-redaction.js';

export { isAocPMFreakForbiddenConnectorOperation, assertAocPMFreakReadOnlyOperation } from './pmfreak-no-mutation-guard.js';

export type { AocPMFreakInMemorySourceFixtures } from './pmfreak-in-memory-source.js';
export { createInMemoryAocPMFreakReadOnlySource } from './pmfreak-in-memory-source.js';

export { createUnsupportedAocPMFreakRealReadOnlySource } from './pmfreak-real-source-adapter.js';

export {
  AOC_PMFREAK_DEMO_WORKSPACE_ID,
  AOC_PMFREAK_DEMO_TENANT_ID,
  AOC_PMFREAK_DEMO_PROJECT_ID,
  AOC_PMFREAK_DEMO_CUSTOMER_ID,
  AOC_PMFREAK_DEMO_AGENT_PLANNING_ID,
  AOC_PMFREAK_DEMO_AGENT_RISK_ID,
  AOC_PMFREAK_DEMO_AGENT_EVIDENCE_ID,
  AOC_PMFREAK_DEMO_AGENT_CLIENT_COMMUNICATION_ID,
  AOC_PMFREAK_DEMO_AGENT_BILLING_READINESS_ID,
  AOC_PMFREAK_DEMO_AGENT_CHANGE_CONTROL_ID,
  AOC_PMFREAK_DEMO_MILESTONE_PHASE_1_ID,
  AOC_PMFREAK_DEMO_MILESTONE_PHASE_2_ID,
  AOC_PMFREAK_DEMO_TASK_COLLECT_ACCEPTANCE_ID,
  AOC_PMFREAK_DEMO_TASK_SCHEDULE_REVIEW_ID,
  AOC_PMFREAK_DEMO_RISK_UNCONFIRMED_ACCEPTANCE_ID,
  AOC_PMFREAK_DEMO_EVIDENCE_CUSTOMER_ACCEPTANCE_MISSING_ID,
  AOC_PMFREAK_DEMO_EVIDENCE_DELIVERABLE_PRESENT_ID,
  AOC_PMFREAK_DEMO_APPROVAL_BILLING_REVIEW_MISSING_ID,
  AOC_PMFREAK_DEMO_APPROVAL_PM_APPROVAL_PRESENT_ID,
  AOC_PMFREAK_DEMO_PROPOSAL_MARK_READY_ID,
} from './pmfreak-read-only-connector-fixtures.js';

export type { AocPMFreakReadOnlyConnectorClient, CreateAocPMFreakReadOnlyConnectorClientInput } from './pmfreak-read-only-client.js';
export { createAocPMFreakReadOnlyConnectorClient } from './pmfreak-read-only-client.js';

export type { AocPMFreakReadOnlyConnectorClaimSafetyResult } from './pmfreak-read-only-claim-safety.js';
export {
  AOC_PMFREAK_READ_ONLY_CONNECTOR_PROHIBITED_OVERCLAIM_PHRASES,
  evaluateAocPMFreakReadOnlyConnectorClaimSafety,
  assertNoAocPMFreakReadOnlyConnectorOverclaim,
} from './pmfreak-read-only-claim-safety.js';
