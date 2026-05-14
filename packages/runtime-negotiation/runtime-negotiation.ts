import { submitNegotiationProposal } from './negotiation-proposal';
import { NegotiationEnvelope, NegotiationProposal, RuntimeNegotiation } from './types';

export function createRuntimeNegotiation(input: Omit<RuntimeNegotiation, 'status' | 'createdAt' | 'resolvedAt'>): RuntimeNegotiation {
  return {
    ...input,
    status: 'proposed',
    createdAt: new Date().toISOString()
  };
}

export function submitRuntimeNegotiationProposal(proposal: NegotiationProposal): NegotiationProposal {
  return submitNegotiationProposal(proposal);
}

export function approveRuntimeNegotiation(
  negotiation: RuntimeNegotiation,
  envelope: NegotiationEnvelope,
  options?: { conditional?: boolean; conditions?: string[] }
): RuntimeNegotiation {
  if (negotiation.status === 'revoked') throw new Error('revoked negotiations cannot reactivate');
  if (negotiation.status === 'expired') throw new Error('expired negotiations require a new negotiation');
  if (!envelope.envelopeId) throw new Error('approved negotiations require negotiation envelope');
  if (options?.conditional && !(options.conditions && options.conditions.length)) {
    throw new Error('conditionally approved negotiations require explicit conditions');
  }

  return {
    ...negotiation,
    status: options?.conditional ? 'conditionally_approved' : 'approved',
    resolvedAt: new Date().toISOString()
  };
}

export function denyRuntimeNegotiation(negotiation: RuntimeNegotiation): RuntimeNegotiation {
  if (negotiation.status === 'revoked') throw new Error('revoked negotiations cannot reactivate');
  return { ...negotiation, status: 'denied', resolvedAt: new Date().toISOString() };
}

export function revokeRuntimeNegotiation(negotiation: RuntimeNegotiation): RuntimeNegotiation {
  return { ...negotiation, status: 'revoked', resolvedAt: new Date().toISOString() };
}

export function expireRuntimeNegotiation(negotiation: RuntimeNegotiation): RuntimeNegotiation {
  if (negotiation.status === 'approved' || negotiation.status === 'conditionally_approved') {
    throw new Error('approved negotiations should be revoked, not expired');
  }
  return { ...negotiation, status: 'expired', resolvedAt: new Date().toISOString() };
}
