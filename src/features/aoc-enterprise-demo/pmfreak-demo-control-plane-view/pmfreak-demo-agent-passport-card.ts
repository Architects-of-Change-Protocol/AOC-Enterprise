import type { PMFreakAgentPassportResolution } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type { AgentPassportStatus } from '@aoc-enterprise/agent-governance';
import type { PMFreakProjectGovernanceScenarioRunResult } from '../pmfreak-project-governance-scenarios/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoAgentPassportCard, PMFreakDemoDecisionSeverity } from './pmfreak-demo-control-plane-view-types.js';

const PASSPORT_STATUS_SEVERITY: Record<AgentPassportStatus, PMFreakDemoDecisionSeverity> = {
  active: 'success',
  suspended: 'warning',
  draft: 'warning',
  issued: 'warning',
  revoked: 'danger',
  expired: 'danger',
};

const PASSPORT_STATUS_LABEL: Record<AgentPassportStatus, string> = {
  active: 'Active passport',
  suspended: 'Suspended passport',
  draft: 'Draft passport',
  issued: 'Issued passport (not yet active)',
  revoked: 'Revoked passport',
  expired: 'Expired passport',
};

/**
 * Builds a claim-safe agent passport card from a scenario run result. Never
 * re-derives passport status, runtime-guard, capability, or authority-scope
 * gating -- only relabels `result.passportResolution`'s own fields for
 * presentation, alongside the scenario's own `agentId` display identifier
 * (the real resolution itself carries no agent identifier -- it resolves a
 * concrete, already-issued passport object, not an agent-id lookup).
 */
export function createPMFreakDemoAgentPassportCard(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakDemoAgentPassportCard {
  const resolution: PMFreakAgentPassportResolution = result.passportResolution;
  const notes: string[] = ['AOC-governed agent', 'Passport-gated', 'Capability-gated', 'Authority-scoped'];
  if (!resolution.allowedByRuntimeGuard) notes.push('This action is not authorized by the real runtime guard.');
  if (!resolution.allowedByCapabilityToken) notes.push('No valid capability token authorizes this action.');
  if (!resolution.allowedByAuthorityScope) notes.push('This attempt falls outside the authority scope evaluated for this run.');

  const card: PMFreakDemoAgentPassportCard = {
    agentId: result.agentId,
    passportId: resolution.passportId,
    role: resolution.role,
    passportStatus: resolution.passportStatus,
    statusLabel: PASSPORT_STATUS_LABEL[resolution.passportStatus],
    statusSeverity: PASSPORT_STATUS_SEVERITY[resolution.passportStatus],
    allowedByRuntimeGuard: resolution.allowedByRuntimeGuard,
    allowedByCapabilityToken: resolution.allowedByCapabilityToken,
    allowedByAuthorityScope: resolution.allowedByAuthorityScope,
    capabilityTokenStatus: resolution.allowedByCapabilityToken ? 'satisfied' : 'missing',
    authorityStatus: resolution.allowedByAuthorityScope ? 'satisfied' : 'failed',
    notes,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(card);
  return card;
}
