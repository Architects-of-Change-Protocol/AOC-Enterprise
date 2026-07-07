import type { EvidenceRequirement, EvidenceRequirementSource, EvidenceRequirementType } from '../domain/evidence-requirement.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceRequirementNotFoundError } from './evidence-runtime-errors.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { EvidenceStore } from './evidence-store.js';

export interface CreateEvidenceRequirementInput {
  readonly type: EvidenceRequirementType;
  readonly source: EvidenceRequirementSource;
  readonly sourceRequirementId?: string;
  readonly sourceRuleId?: string;
  readonly policyPackVersionId?: string;
  readonly policyDecisionId?: string;
  readonly approvalRequestId?: string;
  readonly recognitionDecisionId?: string;
  readonly enforcementDecisionId?: string;
  readonly trustDomainId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly description: string;
  readonly required: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Structural item shape shared by every "from a foreign runtime's own evidence requirement" convenience method -- see policy/approval/recognition/enforcement integrations for the concrete callers. */
export interface StructuralEvidenceRequirementItem {
  readonly id: string;
  readonly type: EvidenceRequirementType;
  readonly description: string;
  readonly required: boolean;
  readonly sourceRuleId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FromPolicyPackRequirementInput {
  readonly trustDomainId: string;
  readonly policyDecisionId?: string;
  readonly policyPackVersionId?: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly capability?: string;
  readonly resourceScope?: string;
  readonly requirement: StructuralEvidenceRequirementItem;
}

export interface FromApprovalRequirementInput {
  readonly trustDomainId: string;
  readonly approvalRequestId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly requirement: StructuralEvidenceRequirementItem;
}

export interface FromRecognitionRequirementInput {
  readonly trustDomainId: string;
  readonly recognitionDecisionId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly requirement: StructuralEvidenceRequirementItem;
}

export interface FromEnforcementRequirementInput {
  readonly trustDomainId: string;
  readonly enforcementDecisionId: string;
  readonly actorId?: string;
  readonly action?: string;
  readonly resourceScope?: string;
  readonly requirement: StructuralEvidenceRequirementItem;
}

/**
 * Creates and transitions EvidenceRequirements. This service never
 * re-evaluates the rules of the runtime a requirement originated from (a
 * policy pack, Approval Runtime, Recognition Runtime, Action Enforcement) --
 * it only represents that runtime's own requirement, and only this service
 * (via EvidenceSatisfactionService) decides whether evidence on file closes
 * it out.
 */
export class EvidenceRequirementService {
  constructor(
    private readonly ctx: EvidenceRuntimeContext,
    private readonly store: EvidenceStore,
    private readonly ledger: EvidenceLedger,
  ) {}

  create(input: CreateEvidenceRequirementInput): EvidenceRequirement {
    const requirement: EvidenceRequirement = {
      id: this.ctx.ids.nextId('evidence-requirement'),
      type: input.type,
      source: input.source,
      trustDomainId: input.trustDomainId,
      description: input.description,
      required: input.required,
      status: 'open',
      createdAt: this.ctx.clock.now(),
      ...(input.sourceRequirementId !== undefined ? { sourceRequirementId: input.sourceRequirementId } : {}),
      ...(input.sourceRuleId !== undefined ? { sourceRuleId: input.sourceRuleId } : {}),
      ...(input.policyPackVersionId !== undefined ? { policyPackVersionId: input.policyPackVersionId } : {}),
      ...(input.policyDecisionId !== undefined ? { policyDecisionId: input.policyDecisionId } : {}),
      ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
      ...(input.recognitionDecisionId !== undefined ? { recognitionDecisionId: input.recognitionDecisionId } : {}),
      ...(input.enforcementDecisionId !== undefined ? { enforcementDecisionId: input.enforcementDecisionId } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    this.store.saveRequirement(requirement);
    this.ledger.recordEvent({
      type: 'evidence_requirement_created',
      requirementId: requirement.id,
      trustDomainId: requirement.trustDomainId,
      payload: { source: requirement.source, type: requirement.type, required: requirement.required },
    });
    return requirement;
  }

  fromPolicyPackRequirement(input: FromPolicyPackRequirementInput): EvidenceRequirement {
    return this.create({
      type: input.requirement.type,
      source: 'policy_pack',
      sourceRequirementId: input.requirement.id,
      trustDomainId: input.trustDomainId,
      description: input.requirement.description,
      required: input.requirement.required,
      ...(input.requirement.sourceRuleId !== undefined ? { sourceRuleId: input.requirement.sourceRuleId } : {}),
      ...(input.policyPackVersionId !== undefined ? { policyPackVersionId: input.policyPackVersionId } : {}),
      ...(input.policyDecisionId !== undefined ? { policyDecisionId: input.policyDecisionId } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
      ...(input.requirement.metadata !== undefined ? { metadata: input.requirement.metadata } : {}),
    });
  }

  fromApprovalRequirement(input: FromApprovalRequirementInput): EvidenceRequirement {
    return this.create({
      type: input.requirement.type,
      source: 'approval',
      sourceRequirementId: input.requirement.id,
      trustDomainId: input.trustDomainId,
      approvalRequestId: input.approvalRequestId,
      description: input.requirement.description,
      required: input.requirement.required,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
      ...(input.requirement.metadata !== undefined ? { metadata: input.requirement.metadata } : {}),
    });
  }

  fromRecognitionRequirement(input: FromRecognitionRequirementInput): EvidenceRequirement {
    return this.create({
      type: input.requirement.type,
      source: 'recognition',
      sourceRequirementId: input.requirement.id,
      trustDomainId: input.trustDomainId,
      recognitionDecisionId: input.recognitionDecisionId,
      description: input.requirement.description,
      required: input.requirement.required,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.requirement.metadata !== undefined ? { metadata: input.requirement.metadata } : {}),
    });
  }

  fromEnforcementRequirement(input: FromEnforcementRequirementInput): EvidenceRequirement {
    return this.create({
      type: input.requirement.type,
      source: 'action_enforcement',
      sourceRequirementId: input.requirement.id,
      trustDomainId: input.trustDomainId,
      enforcementDecisionId: input.enforcementDecisionId,
      description: input.requirement.description,
      required: input.requirement.required,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.resourceScope !== undefined ? { resourceScope: input.resourceScope } : {}),
      ...(input.requirement.metadata !== undefined ? { metadata: input.requirement.metadata } : {}),
    });
  }

  markSatisfied(id: string): EvidenceRequirement {
    return this.transition(id, 'satisfied', 'evidence_requirement_satisfied');
  }

  markPartiallySatisfied(id: string): EvidenceRequirement {
    return this.transition(id, 'partially_satisfied', 'evidence_requirement_satisfied');
  }

  markRejected(id: string, reasonCode: string, reason: string): EvidenceRequirement {
    return this.transition(id, 'rejected', 'evidence_requirement_rejected', { reasonCode, reason });
  }

  markWaived(id: string, reasonCode: string, reason: string): EvidenceRequirement {
    return this.transition(id, 'waived', 'evidence_requirement_satisfied', { reasonCode, reason });
  }

  markExpired(id: string): EvidenceRequirement {
    return this.transition(id, 'expired', 'evidence_requirement_rejected');
  }

  get(id: string): EvidenceRequirement | undefined {
    return this.store.getRequirement(id);
  }

  private transition(
    id: string,
    status: EvidenceRequirement['status'],
    eventType: 'evidence_requirement_satisfied' | 'evidence_requirement_rejected',
    extraPayload: Readonly<Record<string, unknown>> = {},
  ): EvidenceRequirement {
    const existing = this.store.getRequirement(id);
    if (!existing) {
      throw new EvidenceRequirementNotFoundError(id);
    }
    const now = this.ctx.clock.now();
    const updated = this.store.updateRequirement(id, {
      status,
      ...(status === 'satisfied' || status === 'partially_satisfied' || status === 'waived' ? { satisfiedAt: now } : {}),
    });
    if (!updated) {
      throw new EvidenceRequirementNotFoundError(id);
    }
    this.ledger.recordEvent({
      type: eventType,
      requirementId: id,
      trustDomainId: existing.trustDomainId,
      payload: { status, ...extraPayload },
    });
    return updated;
  }
}
