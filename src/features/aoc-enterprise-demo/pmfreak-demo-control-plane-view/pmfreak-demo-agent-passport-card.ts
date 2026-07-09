import type { PMFreakAgentPassportResolution, PMFreakAgentPassportStatus } from '../pmfreak-agent-passport/index.js';
import { assertNoPMFreakDemoControlPlaneOverclaim } from './pmfreak-demo-control-plane-claim-safety.js';
import type { PMFreakDemoAgentPassportCard, PMFreakDemoDecisionSeverity } from './pmfreak-demo-control-plane-view-types.js';

const PASSPORT_STATUS_SEVERITY: Record<PMFreakAgentPassportStatus, PMFreakDemoDecisionSeverity> = {
  active: 'success',
  suspended: 'warning',
  draft: 'warning',
  revoked: 'danger',
  expired: 'danger',
};

const PASSPORT_STATUS_LABEL: Record<PMFreakAgentPassportStatus, string> = {
  active: 'Active passport',
  suspended: 'Suspended passport',
  draft: 'Draft passport',
  revoked: 'Revoked passport',
  expired: 'Expired passport',
};

/**
 * Builds a claim-safe agent passport card from an already-computed
 * `PMFreakAgentPassportResolution`. Never re-derives passport status,
 * capability, or authority-scope gating -- only relabels the resolution's
 * own fields for presentation.
 */
export function createPMFreakDemoAgentPassportCard(resolution: PMFreakAgentPassportResolution): PMFreakDemoAgentPassportCard {
  const notes: string[] = ['AOC-governed agent', 'Passport-gated', 'Capability-gated', 'Authority-scoped'];
  if (!resolution.allowedByPassport) notes.push('This action is not authorized by the current demo passport.');
  if (!resolution.allowedByCapability) notes.push('The demo passport does not currently hold the capability token required for this action.');
  if (!resolution.allowedByAuthorityScope) notes.push("This attempt falls outside the demo passport's authority scope.");

  const card: PMFreakDemoAgentPassportCard = {
    agentId: resolution.agentId,
    passportId: resolution.passportId,
    ...(resolution.role !== undefined ? { role: resolution.role } : {}),
    passportStatus: resolution.passportStatus,
    statusLabel: PASSPORT_STATUS_LABEL[resolution.passportStatus],
    statusSeverity: PASSPORT_STATUS_SEVERITY[resolution.passportStatus],
    allowedByPassport: resolution.allowedByPassport,
    allowedByCapability: resolution.allowedByCapability,
    allowedByAuthorityScope: resolution.allowedByAuthorityScope,
    capabilityTokenStatus: resolution.allowedByCapability ? 'satisfied' : 'missing',
    authorityStatus: resolution.allowedByAuthorityScope ? 'satisfied' : 'failed',
    notes,
  };

  assertNoPMFreakDemoControlPlaneOverclaim(card);
  return card;
}
