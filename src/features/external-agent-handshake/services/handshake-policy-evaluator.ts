import type { HandshakeDecisionType } from '../domain/handshake-decision.js';
import type { HandshakePolicy, HandshakePolicyContext, HandshakePolicyResult } from '../domain/handshake-policy.js';

export interface HandshakePolicyEvaluationResult {
  readonly decisionType: HandshakeDecisionType;
  readonly requiresApproval: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly allowedCapabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly allowedResourceScopes: readonly string[];
  readonly policyResults: readonly HandshakePolicyResult[];
}

const HARD_STOP_DECISION_TYPES: ReadonlySet<HandshakeDecisionType> = new Set(['rejected', 'quarantined', 'expired', 'revoked']);

/**
 * Runs every HandshakePolicy, in the fixed order supplied, over a mutable
 * working context. Unlike Approval Runtime's evaluator (pure short-circuit),
 * this evaluator must support partial acceptance: individual policies may
 * narrow the allowed capability/action/scope sets and continue, or flag
 * requiresApproval and continue, rather than only ever passing or hard-failing.
 * A hard-stop outcome (rejected/quarantined/expired/revoked) still
 * short-circuits immediately -- revocation and expiration always win.
 */
export class HandshakePolicyEvaluator {
  constructor(private readonly policies: readonly HandshakePolicy[]) {}

  evaluate(initialContext: HandshakePolicyContext): HandshakePolicyEvaluationResult {
    const policyResults: HandshakePolicyResult[] = [];
    let context = initialContext;
    let requiresApproval = false;
    let limited = false;
    let lastReasonCode = 'ALL_HANDSHAKE_POLICIES_SATISFIED';
    let lastReason = 'All handshake policies were satisfied.';

    for (const policy of this.policies) {
      const outcome = policy.evaluate(context);
      policyResults.push({
        policyId: outcome.policyId,
        passed: outcome.passed,
        reasonCode: outcome.reasonCode,
        reason: outcome.reason,
        severity: outcome.severity,
        ...(outcome.metadata !== undefined ? { metadata: outcome.metadata } : {}),
      });

      if (!outcome.passed && outcome.decisionType !== undefined && HARD_STOP_DECISION_TYPES.has(outcome.decisionType)) {
        return {
          decisionType: outcome.decisionType,
          requiresApproval: false,
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          allowedCapabilities: [],
          allowedActions: [],
          allowedResourceScopes: [],
          policyResults,
        };
      }

      if (outcome.requiresApproval !== undefined) {
        requiresApproval = outcome.requiresApproval;
        lastReasonCode = outcome.reasonCode;
        lastReason = outcome.reason;
      }

      if (outcome.allowedCapabilities !== undefined && outcome.allowedCapabilities.length < context.allowedCapabilities.length) {
        limited = true;
      }
      if (outcome.allowedActions !== undefined && outcome.allowedActions.length < context.allowedActions.length) {
        limited = true;
      }
      if (outcome.allowedResourceScopes !== undefined && outcome.allowedResourceScopes.length < context.allowedResourceScopes.length) {
        limited = true;
      }

      context = {
        ...context,
        allowedCapabilities: outcome.allowedCapabilities ?? context.allowedCapabilities,
        allowedActions: outcome.allowedActions ?? context.allowedActions,
        allowedResourceScopes: outcome.allowedResourceScopes ?? context.allowedResourceScopes,
        requiresApprovalSoFar: requiresApproval,
      };
    }

    if (context.allowedCapabilities.length === 0 || context.allowedActions.length === 0 || context.allowedResourceScopes.length === 0) {
      return {
        decisionType: 'rejected',
        requiresApproval: false,
        reasonCode: 'NO_ALLOWED_ACCESS_REMAINING',
        reason: 'No requested capability, action or resource scope survived policy evaluation.',
        allowedCapabilities: [],
        allowedActions: [],
        allowedResourceScopes: [],
        policyResults,
      };
    }

    const decisionType: HandshakeDecisionType = requiresApproval ? 'requires_approval' : limited ? 'accepted_limited' : 'accepted';

    return {
      decisionType,
      requiresApproval,
      reasonCode: requiresApproval || limited ? lastReasonCode : 'ALL_HANDSHAKE_POLICIES_SATISFIED',
      reason: requiresApproval || limited ? lastReason : 'All handshake policies were satisfied.',
      allowedCapabilities: context.allowedCapabilities,
      allowedActions: context.allowedActions,
      allowedResourceScopes: context.allowedResourceScopes,
      policyResults,
    };
  }
}
