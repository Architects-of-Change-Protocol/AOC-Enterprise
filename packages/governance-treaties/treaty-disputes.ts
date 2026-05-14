import { TreatyDispute, TreatyParticipant } from './types';

export const raiseTreatyDispute = (dispute: Omit<TreatyDispute, 'status' | 'raisedAt' | 'resolvedAt'>): TreatyDispute => ({ ...dispute, status: 'open', raisedAt: new Date().toISOString() });

export function assignTreatyArbitrator(dispute: TreatyDispute, participant: TreatyParticipant): TreatyDispute {
  if (!['arbitrator', 'audit_witness'].includes(participant.participantRole)) throw new Error('arbitrators must have role arbitrator or audit_witness');
  return { ...dispute, arbitratorRefs: [...dispute.arbitratorRefs, participant.participantId] };
}

export function resolveTreatyDispute(dispute: TreatyDispute, attestationRefs: string[]): TreatyDispute {
  if (!attestationRefs.length) throw new Error('dispute resolution requires attestation refs');
  return { ...dispute, status: 'resolved', attestationRefs: [...dispute.attestationRefs, ...attestationRefs], resolvedAt: new Date().toISOString() };
}

export const listOpenTreatyDisputes = (disputes: TreatyDispute[], treatyId: string): TreatyDispute[] => disputes.filter((d) => d.treatyId === treatyId && d.status === 'open');
