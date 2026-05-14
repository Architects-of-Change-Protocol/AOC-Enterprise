import { NegotiationIntegrationDecision, RuntimeNegotiation } from './types';

export function resolveNegotiationIntegrationSeams(
  negotiation: RuntimeNegotiation,
  opts: { trustCompatible: boolean; boundaryCompatible: boolean; humanReviewRequired?: boolean }
): NegotiationIntegrationDecision {
  const approvedLike = negotiation.status === 'approved' || negotiation.status === 'conditionally_approved';
  const reasons: string[] = [];
  if (!opts.trustCompatible) reasons.push('trust negotiation incompatible');
  if (!opts.boundaryCompatible) reasons.push('boundary negotiation incompatible');
  if (!approvedLike) reasons.push('negotiation not approved');

  const aiEligible = negotiation.negotiationType !== 'ai_execution_request' || (opts.trustCompatible && opts.boundaryCompatible);

  return {
    executionContinuationEligible: approvedLike && opts.trustCompatible,
    federationExpansionEligible: approvedLike && negotiation.negotiationType === 'federation_expansion' && opts.boundaryCompatible,
    temporaryExecutionAuthorityEligible: approvedLike && negotiation.negotiationType === 'remote_execution_authority',
    aiExecutionEligible: aiEligible,
    distributedEscalationRequired: !!opts.humanReviewRequired || !opts.trustCompatible,
    humanReviewRequired: !!opts.humanReviewRequired,
    reasons
  };
}
