import { NegotiationBoundaryDecision, RuntimeBoundaryContext, RuntimeNegotiation } from './types';

export function validateIsolationExceptions(negotiation: RuntimeNegotiation, context: RuntimeBoundaryContext): string[] {
  const reasons: string[] = [];
  for (const isolationException of negotiation.isolationExceptions) {
    if (context.sourceIsolationProfile === 'strict' || context.targetIsolationProfile === 'strict') {
      reasons.push(`isolation exception blocked under strict profile: ${isolationException}`);
    }
  }
  return reasons;
}

export function evaluateNegotiationBoundaries(
  negotiation: RuntimeNegotiation,
  context: RuntimeBoundaryContext
): NegotiationBoundaryDecision {
  const incompatibilityReasons: string[] = [];
  const blockedCapabilities: string[] = [];
  const blockedExecutionScopes: string[] = [];
  const requiredHumanReviews: string[] = [];
  const trustWarnings: string[] = [];

  if (context.blockedRuntimeTypes.includes(context.sourceRuntimeType) || context.blockedRuntimeTypes.includes(context.targetRuntimeType)) {
    incompatibilityReasons.push('runtime type blocked by policy');
  }

  const missingCapabilities = negotiation.requestedAuthorities.filter(
    (authority) => !context.sourceCapabilities.includes(authority) || !context.targetCapabilities.includes(authority)
  );
  blockedCapabilities.push(...missingCapabilities);

  for (const scope of negotiation.requestedExecutionScopes) {
    if (context.executionRestrictions.includes(scope)) {
      blockedExecutionScopes.push(scope);
    }
  }

  const blockedModes = negotiation.requestedFederationModes.filter((mode) => context.federationRestrictions.includes(mode));
  if (blockedModes.length) incompatibilityReasons.push(`federation modes restricted: ${blockedModes.join(',')}`);

  if (negotiation.negotiationType === 'ai_execution_request') {
    const aiBlocked = negotiation.requestedExecutionScopes.filter((scope) => context.aiGovernanceRestrictions.includes(scope));
    blockedExecutionScopes.push(...aiBlocked);
    if (aiBlocked.length) requiredHumanReviews.push('ai_execution_request_restricted_scope');
  }

  incompatibilityReasons.push(...validateIsolationExceptions(negotiation, context));

  if (blockedCapabilities.length || blockedExecutionScopes.length) {
    trustWarnings.push('requested authority exceeds mutual capability boundary');
  }

  const compatible = incompatibilityReasons.length === 0 && blockedCapabilities.length === 0 && blockedExecutionScopes.length === 0;
  return { compatible, incompatibilityReasons, blockedCapabilities, blockedExecutionScopes, requiredHumanReviews, trustWarnings };
}

export function validateNegotiationCompatibility(decision: NegotiationBoundaryDecision): boolean {
  return decision.compatible && !decision.requiredHumanReviews.length;
}
