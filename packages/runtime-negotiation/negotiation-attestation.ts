import { NegotiationAttestation } from './types';

export function createNegotiationAttestation(attestation: NegotiationAttestation): NegotiationAttestation {
  const result = validateNegotiationAttestation(attestation);
  if (!result.valid) {
    throw new Error(`Invalid negotiation attestation: ${result.reasons.join('; ')}`);
  }
  return attestation;
}

export function validateNegotiationAttestation(attestation: NegotiationAttestation): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!attestation.evidenceRefs.length) reasons.push('missing explainable negotiation evidence refs');
  if (!attestation.trustBoundaryContinuityRef) reasons.push('missing trust boundary continuity ref');
  if (!attestation.replayChainRef) reasons.push('missing replay-safe negotiation chain ref');
  if (!attestation.temporaryAgreementRef) reasons.push('missing temporary sovereignty agreement ref');
  return { valid: reasons.length === 0, reasons };
}
