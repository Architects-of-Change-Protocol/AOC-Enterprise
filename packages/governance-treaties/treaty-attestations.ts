import { TreatyAttestationPurpose, TreatyAttestationRef } from './types';

export function createTreatyAttestationRef(treatyId: string, purpose: TreatyAttestationPurpose, attestationRef: string): TreatyAttestationRef {
  return { treatyAttestationId: `${treatyId}:${purpose}:${attestationRef}`, treatyId, purpose, attestationRef, createdAt: new Date().toISOString() };
}
export const attachTreatyAttestation = (attestations: TreatyAttestationRef[], attestation: TreatyAttestationRef): TreatyAttestationRef[] => [...attestations, attestation];

export function validateTreatyAttestationContinuity(treatyId: string, attestations: TreatyAttestationRef[]): { continuous: boolean; missingPurposes: TreatyAttestationPurpose[] } {
  const required: TreatyAttestationPurpose[] = ['treaty_creation', 'amendment', 'dispute', 'quorum', 'authority_decision'];
  const available = new Set(attestations.filter((a) => a.treatyId === treatyId).map((a) => a.purpose));
  const missingPurposes = required.filter((p) => !available.has(p));
  return { continuous: missingPurposes.length === 0, missingPurposes };
}
