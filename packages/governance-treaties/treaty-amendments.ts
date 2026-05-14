import { GovernanceTreaty, TreatyAmendment, TreatyParticipant, TreatyQuorumRule } from './types';
import { validateQuorumForAmendment } from './treaty-quorum';

export const proposeTreatyAmendment = (amendment: Omit<TreatyAmendment, 'status' | 'proposedAt' | 'resolvedAt'>): TreatyAmendment => ({ ...amendment, status: 'proposed', proposedAt: new Date().toISOString() });
export const approveTreatyAmendment = (amendment: TreatyAmendment): TreatyAmendment => ({ ...amendment, status: 'approved', resolvedAt: new Date().toISOString() });
export const denyTreatyAmendment = (amendment: TreatyAmendment): TreatyAmendment => ({ ...amendment, status: 'denied', resolvedAt: new Date().toISOString() });

export function applyTreatyAmendment(treaty: GovernanceTreaty, amendment: TreatyAmendment, quorumRule: TreatyQuorumRule, participants: TreatyParticipant[]): GovernanceTreaty {
  if (amendment.status !== 'approved') throw new Error('only approved amendments can be applied');
  const needsQuorum = ['expand_authority', 'extend_expiration', 'revoke_treaty'].includes(amendment.amendmentType);
  if (needsQuorum && !validateQuorumForAmendment(quorumRule, participants).satisfied) throw new Error('amendment quorum not satisfied');
  if (amendment.amendmentType === 'emergency_constraint' && amendment.attestationRefs.length === 0) throw new Error('emergency constraints require attestation');
  if (amendment.amendmentType === 'expand_authority') return { ...treaty, authorityScopeRefs: [...treaty.authorityScopeRefs, ...((amendment.proposedChanges.authorityScopeRefs as string[]) ?? [])] };
  if (amendment.amendmentType === 'extend_expiration') return { ...treaty, expiresAt: amendment.proposedChanges.expiresAt as string };
  if (amendment.amendmentType === 'revoke_treaty') return { ...treaty, status: 'revoked', revokedAt: new Date().toISOString() };
  return treaty;
}
