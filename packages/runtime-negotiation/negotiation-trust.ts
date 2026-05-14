import { NegotiationTrustDecision, RuntimeTrustContext } from './types';

export function evaluateTrustRecoveryEligibility(context: RuntimeTrustContext): boolean {
  return context.attestationContinuity && context.unresolvedFailures === 0 && context.escalationHistoryCount < 3;
}

export function evaluateNegotiationTrust(context: RuntimeTrustContext): NegotiationTrustDecision {
  const trustDelta = Math.min(context.sourceTrustPosture, context.targetTrustPosture) + context.federationHistoryScore - context.unresolvedFailures * 10;
  const degradationRisk = context.degradationSignals.length > 3 || !context.attestationContinuity
    ? 'critical'
    : context.degradationSignals.length > 1
      ? 'high'
      : context.unresolvedFailures > 0
        ? 'moderate'
        : 'low';

  const escalationRequired = degradationRisk === 'critical' || context.escalationHistoryCount > 2;
  const recoveryEligibility = evaluateTrustRecoveryEligibility(context);

  return {
    trustCompatible: trustDelta >= 40 && degradationRisk !== 'critical',
    trustDelta,
    degradationRisk,
    recoveryEligibility,
    escalationRequired
  };
}

export function degradeNegotiationTrust(context: RuntimeTrustContext, signal: string): RuntimeTrustContext {
  return {
    ...context,
    degradationSignals: [...context.degradationSignals, signal],
    unresolvedFailures: context.unresolvedFailures + 1
  };
}

export function recoverNegotiationTrust(context: RuntimeTrustContext): RuntimeTrustContext {
  if (!evaluateTrustRecoveryEligibility(context)) {
    throw new Error('trust recovery not eligible');
  }

  return {
    ...context,
    degradationSignals: [],
    unresolvedFailures: 0,
    escalationHistoryCount: Math.max(0, context.escalationHistoryCount - 1)
  };
}
