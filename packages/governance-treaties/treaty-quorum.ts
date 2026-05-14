import { TreatyParticipant, TreatyQuorumRule } from './types';

export interface QuorumEvaluationResult { satisfied: boolean; reasons: string[]; }

export const createTreatyQuorumRule = (rule: TreatyQuorumRule): TreatyQuorumRule => rule;

export function evaluateTreatyQuorum(rule: TreatyQuorumRule, participants: TreatyParticipant[], options?: { emergencyOverride?: boolean; includeObserversForAuthority?: boolean }): QuorumEvaluationResult {
  const reasons: string[] = [];
  const active = participants.filter((p) => !p.suspendedAt && !p.exitedAt);
  const quorumPool = options?.includeObserversForAuthority ? active : active.filter((p) => p.participantRole !== 'observer');
  if (quorumPool.length < rule.minimumParticipants) reasons.push('insufficient active participants');
  const votingWeight = quorumPool.reduce((sum, p) => sum + p.votingWeight, 0);
  if (votingWeight < rule.minimumVotingWeight) reasons.push('insufficient voting weight');
  const roleSet = new Set(quorumPool.map((p) => p.participantRole));
  for (const role of rule.requiredRoles) if (!roleSet.has(role)) reasons.push(`missing required role: ${role}`);
  if (options?.emergencyOverride && rule.emergencyOverrideAllowed) reasons.length = 0;
  if (rule.humanReviewRequired) reasons.push('human review required');
  return { satisfied: reasons.length === 0, reasons };
}

export const validateQuorumForAmendment = (rule: TreatyQuorumRule, participants: TreatyParticipant[], emergencyOverride?: boolean): QuorumEvaluationResult =>
  evaluateTreatyQuorum(rule, participants, { emergencyOverride });

export const validateQuorumForAuthorityDecision = (rule: TreatyQuorumRule, participants: TreatyParticipant[], includeObserversForAuthority?: boolean): QuorumEvaluationResult =>
  evaluateTreatyQuorum(rule, participants, { includeObserversForAuthority });
