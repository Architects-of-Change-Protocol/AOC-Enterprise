import { NegotiationProposal } from './types';

export function submitNegotiationProposal(proposal: NegotiationProposal): NegotiationProposal {
  if (!proposal.explainabilityRefs.length) {
    throw new Error('Negotiation proposal requires explainability refs');
  }
  return proposal;
}
