// Domain
export type { PMFreakAgentRole, PMFreakAgentRoleProfile } from './domain/pmfreak-agent-role.js';
export { PMFREAK_AGENT_ROLES } from './domain/pmfreak-agent-role.js';

export type { PMFreakPassportValidationStatus } from './domain/pmfreak-passport-validation-status.js';
export {
  PMFREAK_PASSPORT_VALIDATION_STATUSES,
  satisfiesPMFreakPassportValidationStatus,
} from './domain/pmfreak-passport-validation-status.js';

export type {
  PMFreakPassportAttestorRole,
  PMFreakPassportAttestation,
} from './domain/pmfreak-passport-attestation.js';

export type {
  PMFreakEvidenceRequirementType,
  PMFreakEvidenceRequirementStatus,
  PMFreakEvidenceRequirementMirror,
} from './domain/pmfreak-evidence-requirement-mirror.js';

export type {
  PMFreakApprovalRequirementType,
  PMFreakApprovalRiskLevel,
  PMFreakApprovalEvidenceRequirementMirror,
  PMFreakApprovalRequirementMirror,
} from './domain/pmfreak-approval-requirement-mirror.js';

export type {
  PMFreakCapabilityTokenRiskLevel,
  PMFreakCapabilityTokenStatus,
  PMFreakCapabilityConstraintsMirror,
  PMFreakCapabilityDelegationMirror,
  PMFreakCapabilityEvidenceRequirementMirror,
  PMFreakCapabilityApprovalRequirementMirror,
  PMFreakCapabilityTokenMirror,
} from './domain/pmfreak-capability-token-mirror.js';

export type { PMFreakProjectPhase, PMFreakAuthorityScope } from './domain/pmfreak-authority-scope.js';
export {
  isWorkspaceWithinPMFreakAuthorityScope,
  isProjectWithinPMFreakAuthorityScope,
  isProjectPhaseWithinPMFreakAuthorityScope,
  isCustomerWithinPMFreakAuthorityScope,
} from './domain/pmfreak-authority-scope.js';

export type { PMFreakPassportActionDecision } from './domain/pmfreak-passport-action-decision.js';
export { PMFREAK_PASSPORT_ACTION_DECISION_PRIORITY } from './domain/pmfreak-passport-action-decision.js';

// Services
export type { BuildPMFreakAgentEnrollmentInputOptions } from './services/pmfreak-agent-enrollment-builder.js';
export { buildPMFreakAgentEnrollmentInput } from './services/pmfreak-agent-enrollment-builder.js';

export type {
  IssuePMFreakAgentPassportDeps,
  IssuePMFreakAgentPassportResult,
} from './services/pmfreak-agent-passport-issuance-service.js';
export { issuePMFreakAgentPassport } from './services/pmfreak-agent-passport-issuance-service.js';

export type { BuildPMFreakAgentRuntimeActionRequestOptions } from './services/pmfreak-agent-runtime-guard-service.js';
export {
  buildPMFreakAgentRuntimeActionRequest,
  evaluatePMFreakAgentRuntimeGuard,
  enforcePMFreakAgentRuntimeGuard,
} from './services/pmfreak-agent-runtime-guard-service.js';

export type { CreatePMFreakPassportAttestationInput } from './services/pmfreak-passport-attestation-service.js';
export { createPMFreakPassportAttestation } from './services/pmfreak-passport-attestation-service.js';

export type {
  ResolvePMFreakAgentPassportActionInput,
  PMFreakAgentPassportResolution,
} from './services/pmfreak-agent-passport-resolution-service.js';
export { resolvePMFreakAgentPassportAction } from './services/pmfreak-agent-passport-resolution-service.js';

// Fixtures
export { PMFREAK_AGENT_ROLE_PROFILES, findPMFreakAgentRoleProfile } from './fixtures/pmfreak-agent-role-fixtures.js';
export type { PMFreakPassportScenarioFixture } from './fixtures/pmfreak-passport-scenario-fixtures.js';
export {
  PMFREAK_PASSPORT_SCENARIO_FIXTURES,
  findPMFreakPassportScenarioFixture,
} from './fixtures/pmfreak-passport-scenario-fixtures.js';
