import type { ApprovalRequest } from '../domain/approval-request.js';
import type { ApproverResolution, ApproverResolutionStatus } from '../domain/approver-resolution.js';
import type { ApproverRule } from '../domain/approver-rule.js';
import type { ApprovalRuntimeContext } from '../runtime/approval-runtime-context.js';
import type { ApprovalActorRecognitionIntegration } from './approval-actor-recognition-integration.js';
import type { ApprovalAuthorityGraphIntegration } from './approval-authority-graph-integration.js';
import type { ApprovalLedger } from './approval-ledger.js';
import type { ApprovalStore } from './approval-store.js';

export interface ResolveApproversInput {
  readonly request: ApprovalRequest;
  readonly candidateActorIds?: readonly string[];
}

/** Reverse role lookup: which actors hold a given role. Defaults to none when omitted. */
export type ApproverRoleLookup = (roleId: string) => readonly string[];

interface CandidateRejection {
  readonly actorId: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly status: ApproverResolutionStatus;
}

function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}

export class ApproverResolutionService {
  constructor(
    private readonly ctx: ApprovalRuntimeContext,
    private readonly store: ApprovalStore,
    private readonly ledger: ApprovalLedger,
    private readonly recognition: ApprovalActorRecognitionIntegration,
    private readonly authorityGraph?: ApprovalAuthorityGraphIntegration,
    private readonly roleLookup: ApproverRoleLookup = () => [],
  ) {}

  resolveApprovers(input: ResolveApproversInput): ApproverResolution {
    const { request } = input;
    const matchingRules = this.store
      .getApproverRulesByTrustDomain(request.trustDomainId)
      .filter((rule) => matchesPattern(rule.actionPattern, request.action))
      .filter((rule) => rule.resourceScopePattern === undefined || matchesPattern(rule.resourceScopePattern, request.resourceScope));

    const candidateActorIds = this.collectCandidates(input.candidateActorIds ?? [], request, matchingRules);

    const validApproverActorIds: string[] = [];
    const rejections: CandidateRejection[] = [];

    for (const actorId of candidateActorIds) {
      const rejection = this.evaluateCandidate(actorId, request, matchingRules);
      if (rejection) {
        rejections.push(rejection);
        continue;
      }
      validApproverActorIds.push(actorId);
    }

    const { status, reasonCode, reason } = this.summarize(validApproverActorIds, rejections);

    const resolution: ApproverResolution = {
      id: this.ctx.ids.nextId('approver-resolution'),
      approvalRequestId: request.id,
      trustDomainId: request.trustDomainId,
      status,
      candidateApproverActorIds: candidateActorIds,
      validApproverActorIds,
      rejectedCandidateActorIds: rejections.map((rejection) => rejection.actorId),
      reasonCode,
      reason,
      evaluatedAt: this.ctx.clock.now(),
    };

    this.ledger.recordEvent({
      type: 'approvers_resolved',
      trustDomainId: request.trustDomainId,
      approvalRequestId: request.id,
      payload: { status, validApproverActorIds, rejectedCandidateActorIds: resolution.rejectedCandidateActorIds },
    });

    return resolution;
  }

  private collectCandidates(explicit: readonly string[], request: ApprovalRequest, rules: readonly ApproverRule[]): readonly string[] {
    const candidates = new Set<string>(explicit);
    for (const actorId of request.requirement.requiredApproverActorIds ?? []) {
      candidates.add(actorId);
    }
    for (const roleId of request.requirement.requiredApproverRoleIds ?? []) {
      for (const actorId of this.roleLookup(roleId)) {
        candidates.add(actorId);
      }
    }
    for (const rule of rules) {
      for (const actorId of rule.allowedApproverActorIds ?? []) {
        candidates.add(actorId);
      }
      for (const roleId of rule.allowedApproverRoleIds ?? []) {
        for (const actorId of this.roleLookup(roleId)) {
          candidates.add(actorId);
        }
      }
    }
    return [...candidates];
  }

  private evaluateCandidate(actorId: string, request: ApprovalRequest, rules: readonly ApproverRule[]): CandidateRejection | undefined {
    const recognitionResult = this.recognition.getApproverRecognitionStatus(actorId);
    if (!recognitionResult.recognized) {
      return { actorId, reasonCode: recognitionResult.reasonCode, reason: recognitionResult.reason, status: 'no_valid_approver' };
    }

    const requiresSegregation = request.requirement.requiresSegregationOfDuties || rules.some((rule) => rule.requiresDifferentActorFromRequester);
    if (requiresSegregation && actorId === request.requestedByActorId) {
      return {
        actorId,
        reasonCode: 'APPROVER_IS_REQUESTER',
        reason: `Actor ${actorId} requested the action and cannot approve it under segregation of duties.`,
        status: 'conflict_of_interest',
      };
    }

    // Deliberately checks targetActorId only, not principalActorId: the principal names who an
    // agent's authority traces back to, not a beneficiary of this approval -- barring it would
    // block the human-in-the-loop review (e.g. Victor approving PMFreak's drafted email) this
    // policy exists to enable.
    const requiresTargetSegregation =
      request.requirement.requiresSegregationOfDuties || rules.some((rule) => rule.requiresDifferentActorFromBeneficiary);
    if (requiresTargetSegregation && actorId === request.targetActorId) {
      return {
        actorId,
        reasonCode: 'APPROVER_IS_BENEFICIARY',
        reason: `Actor ${actorId} is the target of the action and cannot approve it under segregation of duties.`,
        status: 'conflict_of_interest',
      };
    }

    const requiredCapability =
      request.requirement.requiredAuthorityCapability ?? rules.find((rule) => rule.requiredAuthorityCapability !== undefined)?.requiredAuthorityCapability;

    if (requiredCapability !== undefined) {
      if (!this.authorityGraph) {
        return {
          actorId,
          reasonCode: 'AUTHORITY_GRAPH_UNAVAILABLE',
          reason: `Actor ${actorId} requires authority capability "${requiredCapability}" but no Authority Graph integration is configured.`,
          status: 'authority_missing',
        };
      }
      const authorityResult = this.authorityGraph.verifyAuthority({
        requestId: request.id,
        actorId,
        trustDomainId: request.trustDomainId,
        action: requiredCapability,
        resourceScope: request.resourceScope,
        requestedAt: this.ctx.clock.now(),
        ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
      });
      if (!authorityResult.valid) {
        const status: ApproverResolutionStatus = authorityResult.type === 'scope_expansion_detected' ? 'out_of_scope' : 'authority_missing';
        return { actorId, reasonCode: authorityResult.reasonCode, reason: authorityResult.reason, status };
      }
    }

    const explicitlyAllowed =
      (request.requirement.requiredApproverActorIds !== undefined && request.requirement.requiredApproverActorIds.includes(actorId)) ||
      (request.requirement.requiredApproverRoleIds ?? []).some((roleId) => this.roleLookup(roleId).includes(actorId)) ||
      rules.some(
        (rule) =>
          (rule.allowedApproverActorIds ?? []).includes(actorId) ||
          (rule.allowedApproverRoleIds ?? []).some((roleId) => this.roleLookup(roleId).includes(actorId)),
      );

    if (!explicitlyAllowed && requiredCapability === undefined) {
      return {
        actorId,
        reasonCode: 'APPROVER_NOT_AUTHORIZED',
        reason: `Actor ${actorId} is not an allowed approver for this request.`,
        status: 'no_valid_approver',
      };
    }

    return undefined;
  }

  private summarize(
    validApproverActorIds: readonly string[],
    rejections: readonly CandidateRejection[],
  ): { readonly status: ApproverResolutionStatus; readonly reasonCode: string; readonly reason: string } {
    if (validApproverActorIds.length > 0) {
      return { status: 'approvers_found', reasonCode: 'APPROVERS_FOUND', reason: `Found ${validApproverActorIds.length} valid approver(s).` };
    }
    const priority: readonly ApproverResolutionStatus[] = ['out_of_scope', 'conflict_of_interest', 'authority_missing', 'no_valid_approver'];
    for (const status of priority) {
      const match = rejections.find((rejection) => rejection.status === status);
      if (match) {
        return { status, reasonCode: match.reasonCode, reason: match.reason };
      }
    }
    return { status: 'no_valid_approver', reasonCode: 'NO_VALID_APPROVER', reason: 'No candidate approver satisfied the requirement.' };
  }
}
