import type { DemoScenario, DemoScenarioId } from '../domain/demo-scenario.js';
import {
  ADAPTER_DENIES_DANGEROUS_ACTION_SCENARIO,
  evaluateAdapterDeniesDangerousActionAssertions,
  executeAdapterDeniesDangerousActionScenario,
} from './adapter-denies-dangerous-action.scenario.js';
import {
  APPROVAL_REQUIRED_BLOCK_SCENARIO,
  evaluateApprovalRequiredBlockAssertions,
  executeApprovalRequiredBlockScenario,
} from './approval-required-block.scenario.js';
import {
  APPROVAL_UNLOCKS_EXECUTION_SCENARIO,
  evaluateApprovalUnlocksExecutionAssertions,
  executeApprovalUnlocksExecutionScenario,
} from './approval-unlocks-execution.scenario.js';
import {
  EMERGENCY_DENY_SHUTDOWN_SCENARIO,
  evaluateEmergencyDenyShutdownAssertions,
  executeEmergencyDenyShutdownScenario,
} from './emergency-deny-shutdown.scenario.js';
import {
  EVIDENCE_REQUIRED_BLOCK_SCENARIO,
  evaluateEvidenceRequiredBlockAssertions,
  executeEvidenceRequiredBlockScenario,
} from './evidence-required-block.scenario.js';
import {
  EXPIRED_VISA_BLOCK_SCENARIO,
  evaluateExpiredVisaBlockAssertions,
  executeExpiredVisaBlockScenario,
} from './expired-visa-block.scenario.js';
import {
  EXTERNAL_AGENT_LIMITED_VISA_SCENARIO,
  evaluateExternalAgentLimitedVisaAssertions,
  executeExternalAgentLimitedVisaScenario,
} from './external-agent-limited-visa.scenario.js';
import {
  FULL_PROOF_CHAIN_AUDIT_SCENARIO,
  evaluateFullProofChainAuditAssertions,
  executeFullProofChainAuditScenario,
} from './full-proof-chain-audit.scenario.js';
import {
  IDEMPOTENCY_DUPLICATE_SUPPRESSED_SCENARIO,
  evaluateIdempotencyDuplicateSuppressedAssertions,
  executeIdempotencyDuplicateSuppressedScenario,
} from './idempotency-duplicate-suppressed.scenario.js';
import {
  INTERNAL_AGENT_ALLOWED_SCENARIO,
  evaluateInternalAgentAllowedAssertions,
  executeInternalAgentAllowedScenario,
} from './internal-agent-allowed.scenario.js';
import type { ScenarioAssertionEvaluator, ScenarioExecutor } from './scenario-runtime-types.js';

export const ALL_DEMO_SCENARIOS: readonly DemoScenario[] = [
  INTERNAL_AGENT_ALLOWED_SCENARIO,
  APPROVAL_REQUIRED_BLOCK_SCENARIO,
  APPROVAL_UNLOCKS_EXECUTION_SCENARIO,
  EVIDENCE_REQUIRED_BLOCK_SCENARIO,
  EXTERNAL_AGENT_LIMITED_VISA_SCENARIO,
  EXPIRED_VISA_BLOCK_SCENARIO,
  ADAPTER_DENIES_DANGEROUS_ACTION_SCENARIO,
  IDEMPOTENCY_DUPLICATE_SUPPRESSED_SCENARIO,
  EMERGENCY_DENY_SHUTDOWN_SCENARIO,
  FULL_PROOF_CHAIN_AUDIT_SCENARIO,
];

export const SCENARIO_EXECUTORS: Readonly<Record<DemoScenarioId, ScenarioExecutor>> = {
  'internal-agent-allowed': executeInternalAgentAllowedScenario,
  'approval-required-block': executeApprovalRequiredBlockScenario,
  'approval-unlocks-execution': executeApprovalUnlocksExecutionScenario,
  'evidence-required-block': executeEvidenceRequiredBlockScenario,
  'external-agent-limited-visa': executeExternalAgentLimitedVisaScenario,
  'expired-visa-block': executeExpiredVisaBlockScenario,
  'adapter-denies-dangerous-action': executeAdapterDeniesDangerousActionScenario,
  'idempotency-duplicate-suppressed': executeIdempotencyDuplicateSuppressedScenario,
  'emergency-deny-shutdown': executeEmergencyDenyShutdownScenario,
  'full-proof-chain-audit': executeFullProofChainAuditScenario,
};

export const SCENARIO_ASSERTION_EVALUATORS: Readonly<Record<DemoScenarioId, ScenarioAssertionEvaluator>> = {
  'internal-agent-allowed': evaluateInternalAgentAllowedAssertions,
  'approval-required-block': evaluateApprovalRequiredBlockAssertions,
  'approval-unlocks-execution': evaluateApprovalUnlocksExecutionAssertions,
  'evidence-required-block': evaluateEvidenceRequiredBlockAssertions,
  'external-agent-limited-visa': evaluateExternalAgentLimitedVisaAssertions,
  'expired-visa-block': evaluateExpiredVisaBlockAssertions,
  'adapter-denies-dangerous-action': evaluateAdapterDeniesDangerousActionAssertions,
  'idempotency-duplicate-suppressed': evaluateIdempotencyDuplicateSuppressedAssertions,
  'emergency-deny-shutdown': evaluateEmergencyDenyShutdownAssertions,
  'full-proof-chain-audit': evaluateFullProofChainAuditAssertions,
};

export {
  ADAPTER_DENIES_DANGEROUS_ACTION_SCENARIO,
  APPROVAL_REQUIRED_BLOCK_SCENARIO,
  APPROVAL_UNLOCKS_EXECUTION_SCENARIO,
  EMERGENCY_DENY_SHUTDOWN_SCENARIO,
  EVIDENCE_REQUIRED_BLOCK_SCENARIO,
  EXPIRED_VISA_BLOCK_SCENARIO,
  EXTERNAL_AGENT_LIMITED_VISA_SCENARIO,
  FULL_PROOF_CHAIN_AUDIT_SCENARIO,
  IDEMPOTENCY_DUPLICATE_SUPPRESSED_SCENARIO,
  INTERNAL_AGENT_ALLOWED_SCENARIO,
};
export type { ScenarioAssertionEvaluator, ScenarioExecutionContext, ScenarioExecutionResult, ScenarioExecutor } from './scenario-runtime-types.js';
export { createTickingClock } from './scenario-runtime-types.js';
