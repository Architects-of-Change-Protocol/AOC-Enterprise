import type { RecognitionVerificationResult } from '../domain/enforcement-context.js';
import type { EnforcementDecision, EnforcementDecisionType } from '../domain/enforcement-decision.js';
import type { EnforcementPolicyResult } from '../domain/enforcement-verification.js';
import type { EnforcementPolicyPackEvaluationResult } from '../domain/policy-pack-enforcement.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import type { EnforcementStore } from './enforcement-store.js';

export interface MappedRecognitionOutcome {
  readonly decisionType: EnforcementDecisionType;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Recognition decision mapping (default-deny for anything not explicitly
 * listed): 'allow' is the only recognition outcome that ever permits real
 * execution. Every other known outcome maps to a specific, non-executable
 * EnforcementDecisionType; an unrecognized or missing recognition type always
 * blocks.
 */
const RECOGNITION_TYPE_MAP: Readonly<Record<string, EnforcementDecisionType>> = {
  allow: 'execute_allowed',
  require_human_approval: 'approval_required',
  require_more_evidence: 'evidence_required',
  unrecognized_actor: 'execution_blocked',
  rogue_actor: 'execution_blocked',
  invalid_capability: 'execution_blocked',
  revoked: 'execution_blocked',
  expired: 'expired',
  out_of_scope: 'execution_blocked',
  policy_violation: 'execution_blocked',
  deny: 'execution_blocked',
  invalid_passport: 'execution_blocked',
};

/** Only this decision type ever authorizes a real, live executor invocation. */
const EXECUTABLE_DECISION_TYPES: ReadonlySet<EnforcementDecisionType> = new Set(['execute_allowed']);

export interface CreateEnforcementDecisionInput {
  readonly enforcementRequestId: string;
  readonly type: EnforcementDecisionType;
  readonly reasonCode: string;
  readonly reason: string;
  readonly policyResults: readonly EnforcementPolicyResult[];
  readonly recognitionResult?: RecognitionVerificationResult;
  readonly idempotencyKey?: string;
  /**
   * External standing references (visaId/ingressGrantId/handshakeProofId)
   * echoed straight from the EnforcementRequest the caller submitted --
   * Recognition Runtime's own decision never carries these (handshake
   * standing is folded into its ordinary decision type/reason), so this is
   * the only place they are known.
   */
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;

  /** Set only when a policy pack integration actually evaluated this request -- see EnforcementDecision.policyDecisionId. */
  readonly policyPackResult?: EnforcementPolicyPackEvaluationResult;
}

export class EnforcementDecisionService {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
  ) {}

  /** Pure mapping from a (structurally typed) recognition result onto an EnforcementDecisionType. Default deny. */
  mapRecognitionResult(result: RecognitionVerificationResult | undefined): MappedRecognitionOutcome {
    if (!result || typeof result.type !== 'string' || result.type.length === 0) {
      return { decisionType: 'execution_blocked', reasonCode: 'RECOGNITION_MISSING', reason: 'No recognition verification result was returned.' };
    }

    const known = RECOGNITION_TYPE_MAP[result.type];
    if (known !== undefined) {
      return { decisionType: known, reasonCode: result.reasonCode, reason: result.reason };
    }

    if (result.allowed === true || result.recognized === true) {
      return { decisionType: 'execute_allowed', reasonCode: result.reasonCode, reason: result.reason };
    }

    return { decisionType: 'execution_blocked', reasonCode: 'RECOGNITION_INVALID', reason: `Unrecognized recognition decision type: ${result.type}.` };
  }

  isExecutable(type: EnforcementDecisionType): boolean {
    return EXECUTABLE_DECISION_TYPES.has(type);
  }

  createDecision(input: CreateEnforcementDecisionInput): EnforcementDecision {
    const recognitionResult = input.recognitionResult;
    const handshakeDecisionId = input.handshakeDecisionId ?? recognitionResult?.handshakeDecisionId;
    const handshakeProofId = input.handshakeProofId ?? recognitionResult?.handshakeProofId;
    const decision: EnforcementDecision = {
      id: this.ctx.ids.nextId('enforcement-decision'),
      enforcementRequestId: input.enforcementRequestId,
      type: input.type,
      allowedToExecute: this.isExecutable(input.type),
      reasonCode: input.reasonCode,
      reason: input.reason,
      decidedAt: this.ctx.clock.now(),
      policyResults: input.policyResults,
      ...(recognitionResult?.id !== undefined ? { recognitionDecisionId: recognitionResult.id } : {}),
      ...(recognitionResult !== undefined ? { recognitionDecisionType: recognitionResult.type } : {}),
      ...(recognitionResult?.authorityDecisionId !== undefined ? { authorityDecisionId: recognitionResult.authorityDecisionId } : {}),
      ...(recognitionResult?.authorityProofId !== undefined ? { authorityProofId: recognitionResult.authorityProofId } : {}),
      ...(recognitionResult?.approvalRequestId !== undefined ? { approvalRequestId: recognitionResult.approvalRequestId } : {}),
      ...(recognitionResult?.approvalDecisionId !== undefined ? { approvalDecisionId: recognitionResult.approvalDecisionId } : {}),
      ...(recognitionResult?.approvalProofId !== undefined ? { approvalProofId: recognitionResult.approvalProofId } : {}),
      ...(handshakeDecisionId !== undefined ? { handshakeDecisionId } : {}),
      ...(handshakeProofId !== undefined ? { handshakeProofId } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    };
    const withPolicyMetadata = input.policyPackResult !== undefined ? this.attachPolicyMetadataToDecision(decision, input.policyPackResult) : decision;
    return this.store.saveDecision(withPolicyMetadata);
  }

  /**
   * Pure merge of a policy pack evaluation result onto an already-built
   * decision. The caller (`EnforcementPreflightService`) only ever invokes
   * this when a policy pack integration is actually configured
   * (`PolicyPackEnforcementService.isConfigured()`) -- an unconfigured
   * runtime's decisions must stay byte-for-byte identical to before this
   * integration existed, so this method is never called at all in that
   * case. `policyDecisionId`/`policyProofId`/`policyPackVersionIds`/
   * `policyMatchedRuleIds` are attached only when present -- a fail-closed
   * synthetic result (integration threw, or returned a malformed result)
   * has no real policy decision to reference, but its reasonCode/reason are
   * still attached so the block is auditable. Never touches
   * `type`/`allowedToExecute`: whether a policy result blocks execution is
   * decided by the policy chain, not here.
   */
  attachPolicyMetadataToDecision(decision: EnforcementDecision, result: EnforcementPolicyPackEvaluationResult): EnforcementDecision {
    return {
      ...decision,
      ...(result.policyDecisionId !== undefined ? { policyDecisionId: result.policyDecisionId } : {}),
      ...(result.policyProofId !== undefined ? { policyProofId: result.policyProofId } : {}),
      ...(result.policyPackVersionIds !== undefined ? { policyPackVersionIds: result.policyPackVersionIds } : {}),
      ...(result.matchedRuleIds !== undefined ? { policyMatchedRuleIds: result.matchedRuleIds } : {}),
      policyReasonCode: result.reasonCode,
      policyReason: result.reason,
      ...(result.effectiveRiskLevel !== undefined ? { policyEffectiveRiskLevel: result.effectiveRiskLevel } : {}),
    };
  }

  getDecision(enforcementDecisionId: string): EnforcementDecision | undefined {
    return this.store.getDecision(enforcementDecisionId);
  }

  getDecisionsByRequest(enforcementRequestId: string): readonly EnforcementDecision[] {
    return this.store.getDecisionsByRequest(enforcementRequestId);
  }
}
