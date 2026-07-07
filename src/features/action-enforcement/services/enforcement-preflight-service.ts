import type { EnforcementRecognitionIntegration, RecognitionVerificationInput } from '../domain/enforcement-context.js';
import type { EnforcementDecision, EnforcementDecisionType } from '../domain/enforcement-decision.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { EnforcementViolationType } from '../domain/enforcement-violation.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { AdapterRegistry } from './adapter-registry.js';
import type { EnforcementDecisionService } from './enforcement-decision-service.js';
import type { EnforcementLedger } from './enforcement-ledger.js';
import type { EnforcementPolicyEvaluator } from './enforcement-policy-evaluator.js';
import type { EnforcementStore } from './enforcement-store.js';
import type { IdempotencyService } from './idempotency-service.js';
import { PolicyPackEnforcementService, policyPackViolationType, severityForPolicyPackResult } from './policy-pack-enforcement-service.js';

const DECISION_TO_VIOLATION: Readonly<Partial<Record<EnforcementDecisionType, EnforcementViolationType>>> = {
  execution_blocked: 'recognition_denied',
  expired: 'request_expired',
  adapter_denied: 'adapter_denied',
  emergency_denied: 'emergency_denied',
  duplicate_suppressed: 'idempotency_violation',
  external_handshake_required: 'external_standing_missing',
  invalid_request: 'recognition_denied',
};

const DOMAIN_POLICY_PACK_POLICY_ID = 'domain_policy_pack';

export class EnforcementPreflightService {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
    private readonly ledger: EnforcementLedger,
    private readonly decisionService: EnforcementDecisionService,
    private readonly policyEvaluator: EnforcementPolicyEvaluator,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly idempotencyService: IdempotencyService,
    private readonly recognitionIntegration: EnforcementRecognitionIntegration,
    private readonly isEmergencyDenyActive: () => boolean,
    private readonly policyPackService: PolicyPackEnforcementService = new PolicyPackEnforcementService(ctx),
  ) {}

  /** Runs the full preflight pipeline. Never invokes anything -- it only ever produces an EnforcementDecision. */
  preflight(request: EnforcementRequest): EnforcementDecision {
    const now = this.ctx.clock.now();

    this.ledger.recordEvent({
      type: 'preflight_started',
      trustDomainId: request.trustDomainId,
      enforcementRequestId: request.id,
      actorId: request.actorId,
      ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
      payload: { action: request.action, mode: request.mode },
    });

    const verificationInput: RecognitionVerificationInput = {
      actorId: request.actorId,
      trustDomainId: request.trustDomainId,
      action: request.action,
      resourceScope: request.resourceScope,
      requestedAt: now,
      ...(request.actionRequestId !== undefined ? { actionRequestId: request.actionRequestId } : {}),
      ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
      ...(request.capability !== undefined ? { capability: request.capability } : {}),
      ...(request.approvalProofId !== undefined ? { approvalProofId: request.approvalProofId } : {}),
      ...(request.approvalRequestId !== undefined ? { approvalRequestId: request.approvalRequestId } : {}),
      ...(request.approvalDecisionId !== undefined ? { approvalDecisionId: request.approvalDecisionId } : {}),
      ...(request.visaId !== undefined ? { visaId: request.visaId } : {}),
      ...(request.ingressGrantId !== undefined ? { ingressGrantId: request.ingressGrantId } : {}),
      ...(request.handshakeProofId !== undefined ? { handshakeProofId: request.handshakeProofId } : {}),
      ...(request.metadata !== undefined ? { metadata: request.metadata } : {}),
    };
    const recognitionResult = this.recognitionIntegration.verifyAction(verificationInput);
    const mapped = this.decisionService.mapRecognitionResult(recognitionResult);

    const adapter = request.target.adapterId !== undefined ? this.adapterRegistry.getAdapter(request.target.adapterId) : undefined;
    const idempotency = this.idempotencyService.check(request.idempotencyKey, request.id);

    /**
     * Computed unconditionally, exactly like recognitionResult/adapter/
     * idempotency above -- this never itself blocks or allows anything. When
     * no policy pack integration is configured it deterministically resolves
     * to policy_not_applicable/allowed, so the policy chain below behaves
     * identically to before this integration existed.
     */
    const policyPackResult = this.policyPackService.evaluatePolicyPackForRequest(request, now, recognitionResult);

    const evaluation = this.policyEvaluator.evaluate({
      now,
      request,
      recognitionResult,
      recognitionMappedDecisionType: mapped.decisionType,
      recognitionMappedReasonCode: mapped.reasonCode,
      recognitionMappedReason: mapped.reason,
      ...(adapter !== undefined ? { adapter } : {}),
      emergencyDeny: this.isEmergencyDenyActive(),
      idempotency,
      policyPackResult,
    });

    /**
     * Gated on whether a policy pack integration is configured at all --
     * never on whether this particular result carries a `policyDecisionId`.
     * A fail-closed synthetic result (integration threw, or returned a
     * malformed result) has no real policy decision to reference, but it
     * still came from a configured integration and must still be
     * attached/audited. An unconfigured runtime never reaches any of this,
     * so its decisions/events stay byte-for-byte identical to before this
     * integration existed.
     */
    const policyPackConfigured = this.policyPackService.isConfigured();

    const decision = this.decisionService.createDecision({
      enforcementRequestId: request.id,
      type: evaluation.decisionType,
      reasonCode: evaluation.reasonCode,
      reason: evaluation.reason,
      policyResults: evaluation.policyResults,
      recognitionResult,
      ...(policyPackConfigured ? { policyPackResult } : {}),
      ...(request.idempotencyKey !== undefined ? { idempotencyKey: request.idempotencyKey } : {}),
      ...(request.visaId !== undefined ? { visaId: request.visaId } : {}),
      ...(request.ingressGrantId !== undefined ? { ingressGrantId: request.ingressGrantId } : {}),
      ...(request.handshakeDecisionId !== undefined ? { handshakeDecisionId: request.handshakeDecisionId } : {}),
      ...(request.handshakeProofId !== undefined ? { handshakeProofId: request.handshakeProofId } : {}),
    });

    /**
     * `policy_pack_evaluated` fires whenever a policy pack integration is
     * configured -- regardless of whether the policy chain ever reached
     * `domain_policy_pack` -- so the audit trail always shows that a policy
     * pack was consulted, even when an earlier core AOC policy already
     * blocked the request. It never changes `decision` itself.
     */
    const policyPackChainResult = evaluation.policyResults.find((result) => result.policyId === DOMAIN_POLICY_PACK_POLICY_ID);
    const policyPackBlockedThisDecision = policyPackChainResult !== undefined && !policyPackChainResult.passed;

    if (policyPackConfigured) {
      this.ledger.recordEvent({
        type: 'policy_pack_evaluated',
        trustDomainId: request.trustDomainId,
        enforcementRequestId: request.id,
        enforcementDecisionId: decision.id,
        actorId: request.actorId,
        payload: {
          type: policyPackResult.type,
          reasonCode: policyPackResult.reasonCode,
          allowed: policyPackResult.allowed,
          policyDecisionId: policyPackResult.policyDecisionId,
        },
      });

      if (policyPackBlockedThisDecision) {
        this.ledger.recordEvent({
          type: 'policy_pack_blocked',
          trustDomainId: request.trustDomainId,
          enforcementRequestId: request.id,
          enforcementDecisionId: decision.id,
          actorId: request.actorId,
          payload: { type: policyPackResult.type, reasonCode: policyPackResult.reasonCode },
        });
      } else if (policyPackResult.type === 'policy_warning') {
        this.ledger.recordEvent({
          type: 'policy_pack_warning_recorded',
          trustDomainId: request.trustDomainId,
          enforcementRequestId: request.id,
          enforcementDecisionId: decision.id,
          actorId: request.actorId,
          payload: { reasonCode: policyPackResult.reasonCode },
        });
      }
    }

    if (decision.allowedToExecute) {
      this.store.updateRequestStatus(request.id, 'preflight_passed');
      this.ledger.recordEvent({
        type: 'preflight_passed',
        trustDomainId: request.trustDomainId,
        enforcementRequestId: request.id,
        enforcementDecisionId: decision.id,
        actorId: request.actorId,
        payload: { decisionType: decision.type },
      });
      return decision;
    }

    this.store.updateRequestStatus(request.id, decision.type === 'dry_run_allowed' ? 'preflight_passed' : 'preflight_failed');
    this.ledger.recordEvent({
      type: 'preflight_failed',
      trustDomainId: request.trustDomainId,
      enforcementRequestId: request.id,
      enforcementDecisionId: decision.id,
      actorId: request.actorId,
      payload: { decisionType: decision.type, reasonCode: decision.reasonCode },
    });

    const violationType = policyPackBlockedThisDecision ? policyPackViolationType(policyPackResult) : DECISION_TO_VIOLATION[decision.type];
    if (violationType) {
      const violation = this.store.saveViolation({
        id: this.ctx.ids.nextId('enforcement-violation'),
        enforcementRequestId: request.id,
        type: violationType,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        severity: policyPackBlockedThisDecision
          ? severityForPolicyPackResult(policyPackResult)
          : decision.type === 'emergency_denied' || decision.type === 'adapter_denied'
            ? 'critical'
            : 'error',
        detectedAt: now,
        ...(policyPackBlockedThisDecision
          ? {
              metadata: {
                ...(policyPackResult.policyDecisionId !== undefined ? { policyDecisionId: policyPackResult.policyDecisionId } : {}),
                ...(policyPackResult.policyProofId !== undefined ? { policyProofId: policyPackResult.policyProofId } : {}),
              },
            }
          : {}),
      });
      this.ledger.recordEvent({
        type: 'enforcement_violation_recorded',
        trustDomainId: request.trustDomainId,
        enforcementRequestId: request.id,
        enforcementDecisionId: decision.id,
        violationId: violation.id,
        actorId: request.actorId,
        payload: { violationType: violation.type, reasonCode: violation.reasonCode },
      });
    }

    return decision;
  }
}
