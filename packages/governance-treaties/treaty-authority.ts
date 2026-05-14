import { GovernanceTreaty, TreatyAuthorityDecision, TreatyParticipant, TreatyQuorumRule } from './types';
import { validateTreatyParticipantEligibility } from './treaty-participants';
import { validateQuorumForAuthorityDecision } from './treaty-quorum';

export function evaluateTreatyCapabilityBoundary(treaty: GovernanceTreaty, capabilityRef: string): boolean {
  return treaty.capabilityBoundaryRefs.includes(capabilityRef);
}
export function evaluateTreatyExecutionBoundary(treaty: GovernanceTreaty, executionRef: string): boolean {
  return treaty.executionBoundaryRefs.includes(executionRef);
}

export function evaluateTreatyAuthority(input: { treaty: GovernanceTreaty; runtimeId: string; requestedAuthorityRefs: string[]; capabilityRef: string; executionRef: string; quorumRule: TreatyQuorumRule; participants: TreatyParticipant[]; attestationRefs: string[]; isAuthorityExpansion?: boolean; }): TreatyAuthorityDecision {
  const reasons: string[] = [];
  if (input.treaty.status === 'suspended') reasons.push('suspended treaties cannot issue new authority');
  if (input.treaty.status === 'disputed' && input.isAuthorityExpansion) reasons.push('disputed treaties block authority expansion');
  if (input.treaty.status !== 'active' && input.treaty.status !== 'disputed') reasons.push(`treaty not active: ${input.treaty.status}`);
  if (!validateTreatyParticipantEligibility(input.treaty, input.runtimeId)) reasons.push('participant eligibility failed');
  if (!evaluateTreatyCapabilityBoundary(input.treaty, input.capabilityRef)) reasons.push('capability boundary blocked');
  if (!evaluateTreatyExecutionBoundary(input.treaty, input.executionRef)) reasons.push('execution boundary blocked');
  const blockedAuthorityRefs = input.requestedAuthorityRefs.filter((ref) => !input.treaty.authorityScopeRefs.includes(ref));
  if (blockedAuthorityRefs.length) reasons.push('authority scope blocked');
  const quorum = validateQuorumForAuthorityDecision(input.quorumRule, input.participants);
  if (!quorum.satisfied) reasons.push(...quorum.reasons);
  const requiredAttestations = input.treaty.attestationRefs.filter((a) => !input.attestationRefs.includes(a));
  if (requiredAttestations.length) reasons.push('attestation requirements unmet');
  return { allowed: reasons.length === 0, reasons, requiredQuorumSatisfied: quorum.satisfied, blockedAuthorityRefs, requiredHumanReviews: input.quorumRule.humanReviewRequired ? ['treaty_quorum_human_review'] : [], requiredAttestations };
}
