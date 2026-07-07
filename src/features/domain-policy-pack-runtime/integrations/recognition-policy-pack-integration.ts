import type { PolicyEvaluationInput } from '../domain/policy-pack-evaluation.js';
import type { PolicyPackDecisionType } from '../domain/policy-pack-decision.js';
import type { PolicyEvidenceRequirement } from '../domain/policy-pack-evidence.js';
import type { PolicyApprovalRequirement } from '../domain/policy-pack-approval.js';
import type { PolicyRiskLevel } from '../domain/policy-pack-effect.js';
import type { PolicyPackRuntime } from '../services/policy-pack-runtime.js';

export interface PolicyRecognitionEvaluationInput {
  readonly actionRequestId?: string;

  readonly trustDomainId: string;
  readonly actorId: string;
  readonly actorType?: string;
  readonly principalActorId?: string;

  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;

  readonly riskLevel: PolicyRiskLevel;

  readonly domain?: string;
  readonly jurisdiction?: string;
  readonly country?: string;
  readonly industry?: string;
  readonly customerId?: string;

  readonly dataDomains?: readonly string[];

  readonly requestedAt: string;

  readonly hasApprovalProof?: boolean;
  readonly hasAuthorityProof?: boolean;
  readonly hasHandshakeProof?: boolean;
  readonly evidenceIds?: readonly string[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Recognition Runtime's own RecognitionDecisionType values that a policy
 * pack evaluation is allowed to steer recognition towards. This is a
 * closed, deliberately small subset -- a policy pack may only ever push
 * recognition *more* restrictive (deny or demand more evidence/approval),
 * never bypass Recognition Runtime's own passport/capability/revocation/
 * expiry checks, and never itself grant an 'allow'.
 */
export type PolicyRecognitionOverrideType = 'policy_violation' | 'require_more_evidence' | 'require_human_approval';

export interface PolicyRecognitionEvaluationResult {
  /** Present only when the policy pack evaluation should steer Recognition Runtime's decision; absent means "no override -- proceed with Recognition Runtime's own decision unchanged". */
  readonly recognitionOverrideType?: PolicyRecognitionOverrideType;

  readonly policyDecisionId?: string;
  readonly policyProofId?: string;

  readonly reasonCode: string;
  readonly reason: string;

  readonly evidenceRequirements?: readonly PolicyEvidenceRequirement[];
  readonly approvalRequirements?: readonly PolicyApprovalRequirement[];

  readonly effectiveRiskLevel?: PolicyRiskLevel;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RecognitionPolicyPackIntegration {
  evaluatePolicyForRecognition(input: PolicyRecognitionEvaluationInput): PolicyRecognitionEvaluationResult;
}

/**
 * Decision types that never override Recognition Runtime's own decision:
 * 'warning' and 'not_applicable' are explicitly non-blocking per product
 * spec ("policy_warning should not block by itself",
 * "policy_not_applicable should not change existing behavior"); 'allowed'
 * is likewise a pass-through -- an explicit policy allow can never grant
 * recognition on its own, it can only decline to add a restriction.
 * 'limited' has no Recognition Runtime equivalent (recognition is binary,
 * not partially scoped) so it fails closed to 'policy_violation'.
 */
const DECISION_TYPE_TO_RECOGNITION_OVERRIDE: Readonly<Record<PolicyPackDecisionType, PolicyRecognitionOverrideType | undefined>> = {
  allowed: undefined,
  warning: undefined,
  not_applicable: undefined,
  denied: 'policy_violation',
  invalid_input: 'policy_violation',
  limited: 'policy_violation',
  requires_authority: 'policy_violation',
  requires_external_standing: 'policy_violation',
  requires_evidence: 'require_more_evidence',
  requires_approval: 'require_human_approval',
};

/**
 * Structural adapter Recognition Runtime's verifier can optionally consult
 * for domain-specific constraints. This module never imports
 * recognition-runtime's RecognitionVerifier/RecognitionDecision types --
 * the caller is responsible for wiring this adapter in as an optional,
 * named constructor dependency (mirroring AuthorityGraphIntegration/
 * ApprovalRuntimeIntegration) and for never letting a missing override here
 * (undefined) be read as anything other than "defer entirely to Recognition
 * Runtime's own passport/capability/revocation/expiry/rogue-actor checks".
 */
export function createRecognitionPolicyPackIntegration(runtime: PolicyPackRuntime): RecognitionPolicyPackIntegration {
  return {
    evaluatePolicyForRecognition(input: PolicyRecognitionEvaluationInput): PolicyRecognitionEvaluationResult {
      const evaluationInput: PolicyEvaluationInput = {
        id: input.actionRequestId ?? `policy-recognition-eval-${input.trustDomainId}-${input.actorId}-${input.action}-${input.resourceScope}-${input.requestedAt}`,
        trustDomainId: input.trustDomainId,
        actorId: input.actorId,
        action: input.action,
        resourceScope: input.resourceScope,
        riskLevel: input.riskLevel,
        requestedAt: input.requestedAt,
        hasAuthorityProof: input.hasAuthorityProof ?? false,
        hasApprovalProof: input.hasApprovalProof ?? false,
        hasHandshakeProof: input.hasHandshakeProof ?? false,
        hasRequiredEvidence: input.evidenceIds !== undefined && input.evidenceIds.length > 0,
        ...(input.actorType !== undefined ? { actorType: input.actorType } : {}),
        ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
        ...(input.capability !== undefined ? { capability: input.capability } : {}),
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.industry !== undefined ? { industry: input.industry } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.dataDomains !== undefined ? { dataDomains: input.dataDomains } : {}),
        ...(input.evidenceIds !== undefined ? { evidenceIds: input.evidenceIds } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };

      const { decision } = runtime.evaluatePolicy(evaluationInput);
      const recognitionOverrideType = DECISION_TYPE_TO_RECOGNITION_OVERRIDE[decision.type];

      return {
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        evidenceRequirements: decision.evidenceRequirements,
        approvalRequirements: decision.approvalRequirements,
        effectiveRiskLevel: decision.effectiveRiskLevel,
        ...(recognitionOverrideType !== undefined ? { recognitionOverrideType } : {}),
        ...(decision.id !== undefined ? { policyDecisionId: decision.id } : {}),
        ...(decision.proofId !== undefined ? { policyProofId: decision.proofId } : {}),
      };
    },
  };
}
