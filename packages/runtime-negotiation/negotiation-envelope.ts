import { NegotiationEnvelope } from './types';

export function createNegotiationEnvelope(input: NegotiationEnvelope): NegotiationEnvelope {
  const validation = validateNegotiationEnvelope(input);
  if (!validation.valid) {
    throw new Error(`Invalid negotiation envelope: ${validation.reasons.join('; ')}`);
  }
  return input;
}

export function validateNegotiationEnvelope(envelope: NegotiationEnvelope): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!envelope.requiredAttestationRefs.length) reasons.push('requiredAttestationRefs missing');
  if (!envelope.capabilityBoundaryRefs.length) reasons.push('capabilityBoundaryRefs missing');
  if (!envelope.executionRestrictions.length) reasons.push('executionRestrictions missing');
  if (!envelope.replayProtectionRefs.length) reasons.push('replayProtectionRefs missing');

  const notBefore = Date.parse(envelope.temporalConstraints.notBefore);
  const notAfter = Date.parse(envelope.temporalConstraints.notAfter);
  if (Number.isNaN(notBefore) || Number.isNaN(notAfter) || notBefore >= notAfter) {
    reasons.push('temporalConstraints invalid');
  }

  return { valid: reasons.length === 0, reasons };
}

export function resolveNegotiationEnvelope(envelope: NegotiationEnvelope, at: string): NegotiationEnvelope {
  const ts = Date.parse(at);
  const nb = Date.parse(envelope.temporalConstraints.notBefore);
  const na = Date.parse(envelope.temporalConstraints.notAfter);
  if (ts < nb || ts > na) {
    throw new Error('Negotiation envelope outside temporal constraints');
  }
  return envelope;
}
