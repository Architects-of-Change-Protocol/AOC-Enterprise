import type { ApprovalDecision } from '../domain/approval-decision.js';
import type { ApprovalProof } from '../domain/approval-proof.js';
import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApprovalRequirement } from '../domain/approval-requirement.js';
import type { ApprovalProofStatus, ApprovalRequestStatus } from '../domain/approval-status.js';
import type { ApproverRule } from '../domain/approver-rule.js';
import { ApprovalProofNotFoundError, ApprovalRequestNotFoundError } from '../runtime/approval-runtime-errors.js';

/**
 * In-memory store for approval requirements, approver rules, requests,
 * decisions and proofs. Pure storage and lookup -- issuance and policy
 * rules live in the services layer, mirroring AuthorityGraphStore.
 */
export class ApprovalStore {
  private readonly requirements = new Map<string, ApprovalRequirement>();
  private readonly approverRules = new Map<string, ApproverRule>();
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly decisions = new Map<string, ApprovalDecision>();
  private readonly proofs = new Map<string, ApprovalProof>();
  private readonly proofsByDecisionId = new Map<string, string>();
  private readonly approverRecognitionStatus = new Map<string, string>();

  putRequirement(requirement: ApprovalRequirement): ApprovalRequirement {
    this.requirements.set(requirement.id, requirement);
    return requirement;
  }

  getRequirement(approvalRequirementId: string): ApprovalRequirement | undefined {
    return this.requirements.get(approvalRequirementId);
  }

  getRequirementsByTrustDomain(trustDomainId: string): readonly ApprovalRequirement[] {
    return [...this.requirements.values()].filter((requirement) => requirement.trustDomainId === trustDomainId);
  }

  putApproverRule(rule: ApproverRule): ApproverRule {
    this.approverRules.set(rule.id, rule);
    return rule;
  }

  getApproverRule(approverRuleId: string): ApproverRule | undefined {
    return this.approverRules.get(approverRuleId);
  }

  getApproverRulesByTrustDomain(trustDomainId: string): readonly ApproverRule[] {
    return [...this.approverRules.values()].filter((rule) => rule.trustDomainId === trustDomainId);
  }

  putRequest(request: ApprovalRequest): ApprovalRequest {
    this.requests.set(request.id, request);
    return request;
  }

  getRequest(approvalRequestId: string): ApprovalRequest | undefined {
    return this.requests.get(approvalRequestId);
  }

  getPendingRequests(): readonly ApprovalRequest[] {
    return [...this.requests.values()].filter((request) => request.status === 'pending');
  }

  getRequestsByTrustDomain(trustDomainId: string): readonly ApprovalRequest[] {
    return [...this.requests.values()].filter((request) => request.trustDomainId === trustDomainId);
  }

  getRequestsByActionRequestId(actionRequestId: string): readonly ApprovalRequest[] {
    return [...this.requests.values()].filter((request) => request.actionRequestId === actionRequestId);
  }

  updateRequestStatus(approvalRequestId: string, status: ApprovalRequestStatus): ApprovalRequest {
    const existing = this.requests.get(approvalRequestId);
    if (!existing) {
      throw new ApprovalRequestNotFoundError(approvalRequestId);
    }
    const updated: ApprovalRequest = { ...existing, status };
    this.requests.set(approvalRequestId, updated);
    return updated;
  }

  putDecision(decision: ApprovalDecision): ApprovalDecision {
    this.decisions.set(decision.id, decision);
    return decision;
  }

  getDecision(approvalDecisionId: string): ApprovalDecision | undefined {
    return this.decisions.get(approvalDecisionId);
  }

  getDecisionsByRequestId(approvalRequestId: string): readonly ApprovalDecision[] {
    return [...this.decisions.values()].filter((decision) => decision.approvalRequestId === approvalRequestId);
  }

  getDecisionsByApproverActorId(approverActorId: string): readonly ApprovalDecision[] {
    return [...this.decisions.values()].filter((decision) => decision.approverActorId === approverActorId);
  }

  putProof(proof: ApprovalProof): ApprovalProof {
    this.proofs.set(proof.id, proof);
    this.proofsByDecisionId.set(proof.approvalDecisionId, proof.id);
    return proof;
  }

  getProof(approvalProofId: string): ApprovalProof | undefined {
    return this.proofs.get(approvalProofId);
  }

  getProofsByRequestId(approvalRequestId: string): readonly ApprovalProof[] {
    return [...this.proofs.values()].filter((proof) => proof.approvalRequestId === approvalRequestId);
  }

  getProofByDecisionId(approvalDecisionId: string): ApprovalProof | undefined {
    const proofId = this.proofsByDecisionId.get(approvalDecisionId);
    return proofId !== undefined ? this.proofs.get(proofId) : undefined;
  }

  updateProofStatus(approvalProofId: string, status: ApprovalProofStatus, patch: Partial<ApprovalProof> = {}): ApprovalProof {
    const existing = this.proofs.get(approvalProofId);
    if (!existing) {
      throw new ApprovalProofNotFoundError(approvalProofId);
    }
    const updated: ApprovalProof = { ...existing, ...patch, status };
    this.proofs.set(approvalProofId, updated);
    return updated;
  }

  /**
   * Registers an actor's approver-recognition status for deterministic, local
   * (non-Recognition-Runtime) approver checks -- e.g. fixtures marking an
   * actor as rogue/unknown/suspended/revoked. See
   * services/approval-actor-recognition-integration.ts for the structural
   * integration that prefers Recognition Runtime's ActorRegistry when available.
   */
  registerApproverRecognitionStatus(actorId: string, status: string): void {
    this.approverRecognitionStatus.set(actorId, status);
  }

  getApproverRecognitionStatus(actorId: string): string | undefined {
    return this.approverRecognitionStatus.get(actorId);
  }
}
