import type { Actor } from '../../recognition-runtime/domain/actor.js';
import type { Passport } from '../../recognition-runtime/domain/passport.js';
import type { RecognitionCapabilityToken } from '../../recognition-runtime/domain/capability-token.js';
import type { AuditEvent } from '../../recognition-runtime/domain/audit-event.js';
import type { AuthorityGrant } from '../../authority-graph/domain/authority-grant.js';
import type { DelegationGrant } from '../../authority-graph/domain/delegation-grant.js';
import type { RoleAssignment } from '../../authority-graph/domain/role-assignment.js';
import type { AuthorityDecision } from '../../authority-graph/domain/authority-decision.js';
import type { AuthorityProof } from '../../authority-graph/domain/authority-proof.js';
import type { ApprovalRequest } from '../../approval-runtime/domain/approval-request.js';
import type { ApprovalDecision } from '../../approval-runtime/domain/approval-decision.js';
import type { ApprovalProof } from '../../approval-runtime/domain/approval-proof.js';
import type { ExternalAgentDescriptor } from '../../external-agent-handshake/domain/external-agent-descriptor.js';
import type { HandshakeRequest } from '../../external-agent-handshake/domain/handshake-request.js';
import type { AgentVisa } from '../../external-agent-handshake/domain/agent-visa.js';
import type { IngressGrant } from '../../external-agent-handshake/domain/ingress-grant.js';
import type { TrustBoundary } from '../../external-agent-handshake/domain/trust-boundary.js';
import type { HandshakeEvent } from '../../external-agent-handshake/domain/handshake-event.js';
import type { EnforcementRequest } from '../../action-enforcement/domain/enforcement-request.js';
import type { EnforcementDecision } from '../../action-enforcement/domain/enforcement-decision.js';
import type { ExecutionResult } from '../../action-enforcement/domain/execution-result.js';
import type { SideEffectDescriptor } from '../../action-enforcement/domain/side-effect.js';
import type { EnforcementViolation } from '../../action-enforcement/domain/enforcement-violation.js';

import type { ControlPlaneRuntimeBundle } from '../fixtures/control-plane-demo.fixture.js';
import type {
  AocControlPlaneReadModel,
  AocDecisionSummary,
  AocOpenItem,
  AgentVisaRow,
  ApprovalDecisionRow,
  ApprovalProofRow,
  ApprovalRequestRow,
  AuditEventRow,
  AuthorityDecisionRow,
  AuthorityGrantRow,
  AuthorityProofRow,
  AuthorityViewModel,
  ApprovalViewModel,
  CapabilityTokenRow,
  DelegationGrantRow,
  EnforcementDecisionRow,
  EnforcementProofRow,
  EnforcementRequestRow,
  EnforcementViewModel,
  EnforcementViolationRow,
  ExecutionResultRow,
  ExternalAgentRow,
  ExternalAgentsViewModel,
  HandshakeRequestRow,
  IngressGrantRow,
  PassportRow,
  RecognitionDecisionRow,
  RecognitionViewModel,
  RecognizedActorRow,
  RoleAssignmentRow,
  SideEffectRow,
  TrustBoundaryRow,
} from '../domain/control-plane-view-model.js';
import type { AocDecisionStatus } from '../domain/control-plane-status.js';
import type { PolicyPackControlPlaneViewModel } from '../domain/policy-pack-view-model.js';
import { buildTimeline } from './control-plane-timeline-service.js';
import { computeHealth, computeMetrics } from './control-plane-metrics-service.js';
import { buildProofsViewModel, type HandshakeProofSource } from './control-plane-proof-service.js';
import { buildPolicyPackViewModel } from './control-plane-policy-pack-read-model-service.js';
import { buildPolicyPackTimeline } from './control-plane-policy-pack-timeline-service.js';
import { policyProofReferences, buildPolicyProofChains } from './control-plane-policy-pack-proof-service.js';

export interface BuildReadModelOptions {
  /** Injected clock for `generatedAt`; defaults to the demo world's trust domain creation time so output stays deterministic without a wall-clock read. */
  readonly now?: () => string;
}

const RECOGNIZED_DECISION_TYPES = new Set(['allow', 'require_human_approval', 'require_more_evidence']);

function payloadString(payload: Readonly<Record<string, unknown>>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function toActorRow(actor: Actor, fallbackTrustDomainId: string): RecognizedActorRow {
  return {
    id: actor.id,
    type: actor.type,
    status: actor.status,
    trustDomainId: actor.trustDomainId ?? fallbackTrustDomainId,
    displayName: actor.displayName,
    createdAt: actor.createdAt,
  };
}

function toPassportRow(passport: Passport): PassportRow {
  return {
    id: passport.id,
    actorId: passport.subjectActorId,
    issuerActorId: passport.issuerActorId,
    trustDomainId: passport.trustDomainId,
    status: passport.status,
    issuedAt: passport.issuedAt,
    ...(passport.expiresAt !== undefined ? { expiresAt: passport.expiresAt } : {}),
    ...(passport.proof !== undefined ? { passportHash: passport.proof.digest } : {}),
  };
}

function toCapabilityTokenRow(token: RecognitionCapabilityToken): CapabilityTokenRow {
  return {
    id: token.id,
    subjectActorId: token.subjectActorId,
    issuerActorId: token.issuerActorId,
    trustDomainId: token.trustDomainId,
    status: token.status,
    allowedActions: token.actions,
    resourceScopes: token.resourceScopes,
    requiresEvidence: token.evidenceRequirements.length > 0,
    requiresHumanApproval: token.approvalRequirement !== undefined,
    issuedAt: token.issuedAt,
    ...(token.expiresAt !== undefined ? { expiresAt: token.expiresAt } : {}),
    ...(token.proof !== undefined ? { tokenHash: token.proof.digest } : {}),
  };
}

function toRecognitionDecisionRow(event: AuditEvent): RecognitionDecisionRow {
  const type = payloadString(event.payload, 'decisionType');
  const decisionId = event.decisionId ?? event.id;
  return {
    id: decisionId,
    requestId: event.requestId ?? '',
    type,
    recognized: RECOGNIZED_DECISION_TYPES.has(type),
    actorId: event.actorId,
    trustDomainId: event.trustDomainId,
    reasonCode: payloadString(event.payload, 'reasonCode'),
    evaluatedAt: event.timestamp,
    auditEventId: event.id,
  };
}

function toAuditEventRow(event: AuditEvent): AuditEventRow {
  return {
    id: event.id,
    eventType: event.eventType,
    actorId: event.actorId,
    trustDomainId: event.trustDomainId,
    timestamp: event.timestamp,
    eventHash: event.eventHash,
    ...(event.previousHash !== undefined ? { previousHash: event.previousHash } : {}),
  };
}

function buildRecognitionViewModel(bundle: ControlPlaneRuntimeBundle): RecognitionViewModel {
  const trustDomainId = bundle.trustDomainId;
  const actors = bundle.knownActorIds
    .map((id) => bundle.recognitionRuntime.actorRegistry.getActor(id))
    .filter((actor): actor is Actor => actor !== undefined)
    .map((actor) => toActorRow(actor, trustDomainId));
  const passports = bundle.knownPassportIds
    .map((id) => bundle.recognitionRuntime.passportService.getPassport(id))
    .filter((passport): passport is Passport => passport !== undefined)
    .map(toPassportRow);
  const capabilityTokens = bundle.knownCapabilityTokenIds
    .map((id) => bundle.recognitionRuntime.capabilityTokenService.getCapabilityToken(id))
    .filter((token): token is RecognitionCapabilityToken => token !== undefined)
    .map(toCapabilityTokenRow);

  const auditEvents = bundle.recognitionRuntime.getAuditTrail({ trustDomainId });
  const decisions = auditEvents.filter((event) => event.eventType === 'recognition_decision').map(toRecognitionDecisionRow);

  return { actors, passports, capabilityTokens, decisions, auditEvents: auditEvents.map(toAuditEventRow) };
}

function toAuthorityGrantRow(grant: AuthorityGrant): AuthorityGrantRow {
  return {
    id: grant.id,
    issuerActorId: grant.issuerActorId,
    subjectActorId: grant.subjectActorId,
    trustDomainId: grant.trustDomainId,
    capability: grant.capability,
    actions: grant.actions,
    resourceScopes: grant.resourceScopes,
    status: grant.status,
    canDelegate: grant.canDelegate,
    issuedAt: grant.issuedAt,
    ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
  };
}

function toDelegationGrantRow(delegation: DelegationGrant): DelegationGrantRow {
  return {
    id: delegation.id,
    delegatorActorId: delegation.delegatorActorId,
    delegateActorId: delegation.delegateActorId,
    principalActorId: delegation.principalActorId,
    trustDomainId: delegation.trustDomainId,
    capability: delegation.capability,
    actions: delegation.actions,
    resourceScopes: delegation.resourceScopes,
    status: delegation.status,
    delegationDepth: delegation.delegationDepth,
    canRedelegate: delegation.canRedelegate,
    issuedAt: delegation.issuedAt,
    ...(delegation.expiresAt !== undefined ? { expiresAt: delegation.expiresAt } : {}),
  };
}

function toRoleAssignmentRow(role: RoleAssignment): RoleAssignmentRow {
  return {
    id: role.id,
    actorId: role.actorId,
    roleId: role.roleId,
    trustDomainId: role.trustDomainId,
    status: role.status,
    assignedAt: role.assignedAt,
    ...(role.expiresAt !== undefined ? { expiresAt: role.expiresAt } : {}),
  };
}

function toAuthorityDecisionRow(decision: AuthorityDecision): AuthorityDecisionRow {
  return {
    id: decision.id,
    requestId: decision.requestId,
    type: decision.type,
    valid: decision.valid,
    actorId: decision.actorId,
    ...(decision.principalActorId !== undefined ? { principalActorId: decision.principalActorId } : {}),
    trustDomainId: decision.trustDomainId,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    ...(decision.proofId !== undefined ? { proofId: decision.proofId } : {}),
    evaluatedAt: decision.evaluatedAt,
  };
}

function toAuthorityProofRow(proof: AuthorityProof): AuthorityProofRow {
  return {
    id: proof.id,
    requestId: proof.requestId,
    authorityDecisionId: proof.authorityDecisionId,
    trustDomainId: proof.trustDomainId,
    actorId: proof.actorId,
    decisionType: proof.decisionType,
    valid: proof.valid,
    proofHash: proof.proofHash,
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
    createdAt: proof.createdAt,
  };
}

/**
 * Authority Graph has no "list all decisions" query, but AuthorityProofService
 * does expose getAllProofs() and every decision -- valid or not -- produces a
 * proof. Decisions we drove directly (bundle.authorityDecisions) carry full
 * reasonCode/reason; decisions Recognition Runtime triggered internally via
 * its own Authority Graph integration are recovered from their proof alone,
 * so their reasonCode falls back to the proof's decisionType.
 */
function buildAuthorityViewModel(bundle: ControlPlaneRuntimeBundle): AuthorityViewModel {
  const trustDomainId = bundle.trustDomainId;
  const grants = bundle.authorityRuntime.store.getGrantsByTrustDomain(trustDomainId).map(toAuthorityGrantRow);
  const delegations = bundle.authorityRuntime.store.getDelegationsByTrustDomain(trustDomainId).map(toDelegationGrantRow);
  const roleAssignments = bundle.authorityRuntime.store.getRoleAssignmentsForTrustDomain(trustDomainId).map(toRoleAssignmentRow);

  const allProofs = bundle.authorityRuntime.proofService.getAllProofs();
  const capturedDecisionsById = new Map(bundle.authorityDecisions.map((decision) => [decision.id, decision]));

  const decisions: AuthorityDecisionRow[] = allProofs.map((proof) => {
    const captured = capturedDecisionsById.get(proof.authorityDecisionId);
    if (captured) return toAuthorityDecisionRow(captured);
    return {
      id: proof.authorityDecisionId,
      requestId: proof.requestId,
      type: proof.decisionType,
      valid: proof.valid,
      actorId: proof.actorId,
      ...(proof.principalActorId !== undefined ? { principalActorId: proof.principalActorId } : {}),
      trustDomainId: proof.trustDomainId,
      reasonCode: proof.decisionType,
      proofId: proof.id,
      evaluatedAt: proof.createdAt,
    };
  });
  const proofs = allProofs.map(toAuthorityProofRow);

  return { grants, delegations, roleAssignments, decisions, proofs };
}

function toApprovalRequestRow(request: ApprovalRequest, allDecisions: readonly ApprovalDecision[]): ApprovalRequestRow {
  const currentApprovals = allDecisions.filter((decision) => decision.approvalRequestId === request.id && decision.approved).length;
  return {
    id: request.id,
    trustDomainId: request.trustDomainId,
    actionRequestId: request.actionRequestId,
    requestedByActorId: request.requestedByActorId,
    targetActorId: request.targetActorId,
    action: request.action,
    resourceScope: request.resourceScope,
    riskLevel: request.riskLevel,
    status: request.status,
    minimumApprovals: request.requirement.minimumApprovals,
    currentApprovals,
    requiresSegregationOfDuties: request.requirement.requiresSegregationOfDuties,
    createdAt: request.createdAt,
    ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt } : {}),
  };
}

function toApprovalDecisionRow(decision: ApprovalDecision): ApprovalDecisionRow {
  return {
    id: decision.id,
    approvalRequestId: decision.approvalRequestId,
    type: decision.type,
    approved: decision.approved,
    approverActorId: decision.approverActorId,
    reasonCode: decision.reasonCode,
    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
    evidenceReviewed: decision.evidenceReviewed.map((evidence) => ({
      id: evidence.id,
      type: evidence.type,
      providedByActorId: evidence.providedByActorId,
      ...(evidence.description !== undefined ? { description: evidence.description } : {}),
      createdAt: evidence.createdAt,
    })),
    decidedAt: decision.decidedAt,
  };
}

function toApprovalProofRow(proof: ApprovalProof): ApprovalProofRow {
  return {
    id: proof.id,
    approvalRequestId: proof.approvalRequestId,
    approvalDecisionId: proof.approvalDecisionId,
    trustDomainId: proof.trustDomainId,
    status: proof.status,
    approved: proof.approved,
    proofHash: proof.proofHash,
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
    createdAt: proof.createdAt,
    ...(proof.expiresAt !== undefined ? { expiresAt: proof.expiresAt } : {}),
    ...(proof.revokedAt !== undefined ? { revokedAt: proof.revokedAt } : {}),
  };
}

function buildApprovalsViewModel(bundle: ControlPlaneRuntimeBundle): ApprovalViewModel {
  const trustDomainId = bundle.trustDomainId;
  const requests = bundle.approvalRuntime.store.getRequestsByTrustDomain(trustDomainId);
  const decisions = requests.flatMap((request) => bundle.approvalRuntime.store.getDecisionsByRequestId(request.id));
  const proofs = requests.flatMap((request) => bundle.approvalRuntime.store.getProofsByRequestId(request.id));
  return {
    requests: requests.map((request) => toApprovalRequestRow(request, decisions)),
    decisions: decisions.map(toApprovalDecisionRow),
    proofs: proofs.map(toApprovalProofRow),
    pendingCount: requests.filter((request) => request.status === 'pending').length,
  };
}

function toExternalAgentRow(agent: ExternalAgentDescriptor): ExternalAgentRow {
  return {
    id: agent.id,
    displayName: agent.displayName,
    type: agent.type,
    status: agent.status,
    ...(agent.externalIssuerId !== undefined ? { externalIssuerId: agent.externalIssuerId } : {}),
    ...(agent.externalTrustDomainId !== undefined ? { externalTrustDomainId: agent.externalTrustDomainId } : {}),
    firstSeenAt: agent.firstSeenAt,
    ...(agent.lastSeenAt !== undefined ? { lastSeenAt: agent.lastSeenAt } : {}),
  };
}

function toHandshakeRequestRow(request: HandshakeRequest): HandshakeRequestRow {
  return {
    id: request.id,
    externalAgentId: request.externalAgent.id,
    localTrustDomainId: request.localTrustDomainId,
    status: request.status,
    requestedActions: request.requestedActions,
    requestedResourceScopes: request.requestedResourceScopes,
    ...(request.approvalRequestId !== undefined ? { approvalRequestId: request.approvalRequestId } : {}),
    createdAt: request.createdAt,
    ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt } : {}),
  };
}

function toAgentVisaRow(visa: AgentVisa): AgentVisaRow {
  return {
    id: visa.id,
    externalAgentId: visa.externalAgentId,
    localTrustDomainId: visa.localTrustDomainId,
    status: visa.status,
    allowedCapabilities: visa.allowedCapabilities,
    allowedActions: visa.allowedActions,
    allowedResourceScopes: visa.allowedResourceScopes,
    issuedAt: visa.issuedAt,
    ...(visa.expiresAt !== undefined ? { expiresAt: visa.expiresAt } : {}),
  };
}

function toIngressGrantRow(grant: IngressGrant): IngressGrantRow {
  return {
    id: grant.id,
    agentVisaId: grant.agentVisaId,
    externalAgentId: grant.externalAgentId,
    localTrustDomainId: grant.localTrustDomainId,
    status: grant.status,
    actions: grant.actions,
    resourceScopes: grant.resourceScopes,
    capabilities: grant.capabilities,
    issuedAt: grant.issuedAt,
    ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
  };
}

function toTrustBoundaryRow(boundary: TrustBoundary): TrustBoundaryRow {
  return {
    id: boundary.id,
    localTrustDomainId: boundary.localTrustDomainId,
    ...(boundary.externalIssuerId !== undefined ? { externalIssuerId: boundary.externalIssuerId } : {}),
    status: boundary.status,
    allowedAgentTypes: boundary.allowedAgentTypes,
    requiresApprovalForUnknownIssuers: boundary.requiresApprovalForUnknownIssuers,
    requiresApprovalForHighRisk: boundary.requiresApprovalForHighRisk,
    maxVisaTtlMinutes: boundary.maxVisaTtlMinutes,
  };
}

function buildExternalAgentsViewModel(
  bundle: ControlPlaneRuntimeBundle,
  handshakeEvents: readonly HandshakeEvent[],
): ExternalAgentsViewModel {
  const trustDomainId = bundle.trustDomainId;
  const handshakeRequests = bundle.handshakeRuntime.store.queryHandshakeRequestsByTrustDomain(trustDomainId);

  const agentIds = new Set<string>(handshakeRequests.map((request) => request.externalAgent.id));
  const externalAgents = [...agentIds]
    .map((id) => bundle.handshakeRuntime.store.getExternalAgent(id))
    .filter((agent): agent is ExternalAgentDescriptor => agent !== undefined)
    .map(toExternalAgentRow);

  const visaIds = new Set<string>();
  const ingressGrantIds = new Set<string>();
  for (const event of handshakeEvents) {
    if (event.visaId !== undefined) visaIds.add(event.visaId);
    if (event.ingressGrantId !== undefined) ingressGrantIds.add(event.ingressGrantId);
  }
  const visas = [...visaIds]
    .map((id) => bundle.handshakeRuntime.store.getAgentVisa(id))
    .filter((visa): visa is AgentVisa => visa !== undefined)
    .map(toAgentVisaRow);
  const ingressGrants = [...ingressGrantIds]
    .map((id) => bundle.handshakeRuntime.store.getIngressGrant(id))
    .filter((grant): grant is IngressGrant => grant !== undefined)
    .map(toIngressGrantRow);
  const trustBoundaries = bundle.handshakeRuntime.store.getTrustBoundariesByLocalTrustDomain(trustDomainId).map(toTrustBoundaryRow);

  return {
    externalAgents,
    handshakeRequests: handshakeRequests.map(toHandshakeRequestRow),
    visas,
    ingressGrants,
    trustBoundaries,
  };
}

function toEnforcementRequestRow(request: EnforcementRequest): EnforcementRequestRow {
  return {
    id: request.id,
    mode: request.mode,
    status: request.status,
    trustDomainId: request.trustDomainId,
    actorId: request.actorId,
    ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
    action: request.action,
    ...(request.capability !== undefined ? { capability: request.capability } : {}),
    resourceScope: request.resourceScope,
    targetType: request.target.type,
    targetName: request.target.name,
    sideEffectType: request.intent.sideEffectType,
    ...(request.idempotencyKey !== undefined ? { idempotencyKey: request.idempotencyKey } : {}),
    submittedAt: request.submittedAt,
  };
}

function toEnforcementDecisionRow(decision: EnforcementDecision): EnforcementDecisionRow {
  return {
    id: decision.id,
    enforcementRequestId: decision.enforcementRequestId,
    type: decision.type,
    allowedToExecute: decision.allowedToExecute,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    ...(decision.recognitionDecisionId !== undefined ? { recognitionDecisionId: decision.recognitionDecisionId } : {}),
    ...(decision.authorityProofId !== undefined ? { authorityProofId: decision.authorityProofId } : {}),
    ...(decision.approvalProofId !== undefined ? { approvalProofId: decision.approvalProofId } : {}),
    ...(decision.handshakeProofId !== undefined ? { handshakeProofId: decision.handshakeProofId } : {}),
    ...(decision.policyDecisionId !== undefined ? { policyDecisionId: decision.policyDecisionId } : {}),
    ...(decision.policyProofId !== undefined ? { policyProofId: decision.policyProofId } : {}),
    ...(decision.policyPackVersionIds !== undefined ? { policyPackVersionIds: decision.policyPackVersionIds } : {}),
    ...(decision.policyMatchedRuleIds !== undefined ? { policyMatchedRuleIds: decision.policyMatchedRuleIds } : {}),
    ...(decision.policyReasonCode !== undefined ? { policyReasonCode: decision.policyReasonCode } : {}),
    ...(decision.policyReason !== undefined ? { policyReason: decision.policyReason } : {}),
    ...(decision.policyEffectiveRiskLevel !== undefined ? { policyEffectiveRiskLevel: decision.policyEffectiveRiskLevel } : {}),
    decidedAt: decision.decidedAt,
  };
}

function toExecutionResultRow(result: ExecutionResult): ExecutionResultRow {
  return {
    id: result.id,
    enforcementRequestId: result.enforcementRequestId,
    enforcementDecisionId: result.enforcementDecisionId,
    status: result.status,
    executed: result.executed,
    ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
    ...(result.startedAt !== undefined ? { startedAt: result.startedAt } : {}),
    ...(result.completedAt !== undefined ? { completedAt: result.completedAt } : {}),
  };
}

function toSideEffectRow(sideEffect: SideEffectDescriptor): SideEffectRow {
  return {
    id: sideEffect.id,
    enforcementRequestId: sideEffect.enforcementRequestId,
    type: sideEffect.type,
    status: sideEffect.status,
    executed: sideEffect.status === 'executed',
    ...(sideEffect.description !== undefined ? { description: sideEffect.description } : {}),
    plannedAt: sideEffect.plannedAt,
    ...(sideEffect.executedAt !== undefined ? { executedAt: sideEffect.executedAt } : {}),
  };
}

function toEnforcementViolationRow(violation: EnforcementViolation): EnforcementViolationRow {
  return {
    id: violation.id,
    enforcementRequestId: violation.enforcementRequestId,
    type: violation.type,
    severity: violation.severity,
    reasonCode: violation.reasonCode,
    reason: violation.reason,
    detectedAt: violation.detectedAt,
  };
}

function toEnforcementProofRow(proof: import('../../action-enforcement/domain/enforcement-proof.js').EnforcementProof): EnforcementProofRow {
  return {
    id: proof.id,
    enforcementRequestId: proof.enforcementRequestId,
    enforcementDecisionId: proof.enforcementDecisionId,
    allowedToExecute: proof.allowedToExecute,
    executed: proof.executed,
    ...(proof.recognitionDecisionId !== undefined ? { recognitionDecisionId: proof.recognitionDecisionId } : {}),
    ...(proof.authorityProofId !== undefined ? { authorityProofId: proof.authorityProofId } : {}),
    ...(proof.approvalProofId !== undefined ? { approvalProofId: proof.approvalProofId } : {}),
    ...(proof.handshakeProofId !== undefined ? { handshakeProofId: proof.handshakeProofId } : {}),
    ...(proof.policyDecisionId !== undefined ? { policyDecisionId: proof.policyDecisionId } : {}),
    ...(proof.policyProofId !== undefined ? { policyProofId: proof.policyProofId } : {}),
    ...(proof.policyPackVersionIds !== undefined ? { policyPackVersionIds: proof.policyPackVersionIds } : {}),
    ...(proof.policyMatchedRuleIds !== undefined ? { policyMatchedRuleIds: proof.policyMatchedRuleIds } : {}),
    proofHash: proof.proofHash,
    ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
    createdAt: proof.createdAt,
  };
}

function buildEnforcementViewModel(bundle: ControlPlaneRuntimeBundle): EnforcementViewModel {
  const trustDomainId = bundle.trustDomainId;
  const requests = bundle.enforcementRuntime.store.getRequestsByTrustDomain(trustDomainId);
  const decisions = requests.flatMap((request) => bundle.enforcementRuntime.store.getDecisionsByRequest(request.id));
  const results = requests.flatMap((request) => bundle.enforcementRuntime.store.getResultsByRequest(request.id));
  const sideEffects = requests.flatMap((request) => bundle.enforcementRuntime.store.getSideEffectsByRequest(request.id));
  const violations = requests.flatMap((request) => bundle.enforcementRuntime.store.getViolationsByRequest(request.id));
  const proofs = requests.flatMap((request) => bundle.enforcementRuntime.store.getProofsByRequest(request.id));
  return {
    requests: requests.map(toEnforcementRequestRow),
    decisions: decisions.map(toEnforcementDecisionRow),
    results: results.map(toExecutionResultRow),
    sideEffects: sideEffects.map(toSideEffectRow),
    violations: violations.map(toEnforcementViolationRow),
    proofs: proofs.map(toEnforcementProofRow),
  };
}

function collectHandshakeProofSources(bundle: ControlPlaneRuntimeBundle, handshakeEvents: readonly HandshakeEvent[]): HandshakeProofSource[] {
  const proofIds = new Set<string>();
  for (const event of handshakeEvents) {
    if (event.handshakeProofId !== undefined) proofIds.add(event.handshakeProofId);
  }
  return [...proofIds]
    .map((id) => bundle.handshakeRuntime.store.getHandshakeProof(id))
    .filter((proof): proof is NonNullable<typeof proof> => proof !== undefined)
    .map((proof) => ({
      id: proof.id,
      handshakeRequestId: proof.handshakeRequestId,
      proofHash: proof.proofHash,
      ...(proof.previousHash !== undefined ? { previousHash: proof.previousHash } : {}),
      createdAt: proof.createdAt,
    }));
}

function recognitionDecisionStatus(type: string): AocDecisionStatus {
  switch (type) {
    case 'allow':
      return 'allowed';
    case 'require_human_approval':
    case 'require_more_evidence':
      return 'requires_attention';
    case 'revoked':
      return 'revoked';
    case 'expired':
      return 'expired';
    default:
      return 'blocked';
  }
}

function approvalDecisionStatus(type: string): AocDecisionStatus {
  switch (type) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'requested_changes':
    case 'escalated':
      return 'requires_attention';
    case 'expired':
      return 'expired';
    case 'revoked':
      return 'revoked';
    default:
      return 'blocked';
  }
}

function enforcementDecisionStatus(decision: EnforcementDecisionRow): AocDecisionStatus {
  if (decision.allowedToExecute || decision.type === 'dry_run_allowed') return 'allowed';
  if (decision.type === 'duplicate_suppressed') return 'requires_attention';
  if (decision.type === 'approval_required' || decision.type === 'external_handshake_required' || decision.type === 'evidence_required') return 'pending';
  if (decision.type === 'expired') return 'expired';
  return 'blocked';
}

function buildRecentDecisions(recognition: RecognitionViewModel, authority: AuthorityViewModel, approvals: ApprovalViewModel, enforcement: EnforcementViewModel): AocDecisionSummary[] {
  const summaries: AocDecisionSummary[] = [];

  for (const decision of recognition.decisions) {
    summaries.push({
      id: decision.id,
      source: 'recognition',
      type: decision.type,
      status: recognitionDecisionStatus(decision.type),
      actorId: decision.actorId,
      reasonCode: decision.reasonCode,
      reason: decision.reason ?? decision.reasonCode,
      createdAt: decision.evaluatedAt,
    });
  }
  for (const decision of authority.decisions) {
    summaries.push({
      id: decision.id,
      source: 'authority',
      type: decision.type,
      status: decision.valid ? 'allowed' : 'blocked',
      actorId: decision.actorId,
      reasonCode: decision.reasonCode,
      reason: decision.reason ?? decision.reasonCode,
      createdAt: decision.evaluatedAt,
    });
  }
  for (const decision of approvals.decisions) {
    summaries.push({
      id: decision.id,
      source: 'approval',
      type: decision.type,
      status: approvalDecisionStatus(decision.type),
      ...(decision.approverActorId !== undefined ? { actorId: decision.approverActorId } : {}),
      reasonCode: decision.reasonCode,
      reason: decision.reason ?? decision.reasonCode,
      createdAt: decision.decidedAt,
    });
  }
  for (const decision of enforcement.decisions) {
    summaries.push({
      id: decision.id,
      source: 'enforcement',
      type: decision.type,
      status: enforcementDecisionStatus(decision),
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      createdAt: decision.decidedAt,
    });
  }

  return summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function buildOpenItems(
  approvals: ApprovalViewModel,
  externalAgents: ExternalAgentsViewModel,
  enforcement: EnforcementViewModel,
  policyPacks: PolicyPackControlPlaneViewModel,
): AocOpenItem[] {
  const items: AocOpenItem[] = [];

  for (const request of approvals.requests.filter((r) => r.status === 'pending')) {
    items.push({
      id: `open-approval-${request.id}`,
      source: 'approval',
      title: `Approval pending: ${request.action}`,
      description: `Requested by ${request.requestedByActorId} for ${request.resourceScope}.`,
      severity: request.riskLevel === 'critical' || request.riskLevel === 'high' ? 'danger' : 'warning',
      relatedId: request.id,
    });
  }
  for (const violation of enforcement.violations) {
    items.push({
      id: `open-violation-${violation.id}`,
      source: 'enforcement',
      title: `Enforcement violation: ${violation.type}`,
      description: violation.reason,
      severity: violation.severity === 'critical' || violation.severity === 'error' ? 'danger' : 'warning',
      relatedId: violation.enforcementRequestId,
    });
  }
  for (const visa of externalAgents.visas.filter((v) => v.status === 'expired' || v.status === 'revoked')) {
    items.push({
      id: `open-visa-${visa.id}`,
      source: 'handshake',
      title: `Visa ${visa.status}: ${visa.externalAgentId}`,
      description: `Agent visa for ${visa.externalAgentId} is ${visa.status}.`,
      severity: 'warning',
      relatedId: visa.id,
    });
  }
  for (const link of policyPacks.enforcementLinks.filter((l) => l.blockedByPolicy)) {
    items.push({
      id: `open-policy-blocked-${link.id}`,
      source: 'policy',
      title: `Policy pack blocked execution: ${link.action}`,
      description: link.reason ?? `Action ${link.action} for ${link.actorId} was blocked by policy pack evaluation.`,
      severity: 'danger',
      ...(link.enforcementDecisionId !== undefined ? { relatedId: link.enforcementDecisionId } : {}),
    });
  }
  for (const pack of policyPacks.packs.filter((p) => p.status === 'active' && p.demoOnly)) {
    items.push({
      id: `open-policy-demo-only-${pack.id}`,
      source: 'policy',
      title: `Demo-only policy pack active: ${pack.name}`,
      description: 'This policy pack is demo-only and is not legal advice or a certified compliance control.',
      severity: 'warning',
      relatedId: pack.id,
    });
  }
  for (const decision of policyPacks.decisions.filter((d) => d.type === 'denied')) {
    items.push({
      id: `open-policy-denied-${decision.id}`,
      source: 'policy',
      title: `Policy denied: ${decision.action}`,
      description: decision.reason,
      severity: 'warning',
      relatedId: decision.id,
    });
  }
  const policyProofIds = new Set(policyPacks.proofs.map((proof) => proof.id));
  for (const decision of policyPacks.decisions.filter((d) => d.proofId !== undefined && !policyProofIds.has(d.proofId))) {
    items.push({
      id: `open-policy-missing-proof-${decision.id}`,
      source: 'policy',
      title: `Missing policy proof for decision ${decision.id}`,
      description: `Policy decision ${decision.id} references proof ${decision.proofId} which was not found in the policy pack read model.`,
      severity: 'warning',
      relatedId: decision.id,
    });
  }

  return items;
}

/**
 * Assembles the full AocControlPlaneReadModel from a live ControlPlaneRuntimeBundle
 * by reading each runtime's own stores, ledgers and getters. Every row is a
 * direct projection of a real domain object the corresponding runtime
 * returned -- this function makes no governance decisions of its own.
 */
export function buildControlPlaneReadModel(bundle: ControlPlaneRuntimeBundle, options: BuildReadModelOptions = {}): AocControlPlaneReadModel {
  const trustDomainId = bundle.trustDomainId;

  const recognition = buildRecognitionViewModel(bundle);
  const authority = buildAuthorityViewModel(bundle);
  const approvals = buildApprovalsViewModel(bundle);
  const handshakeEvents = bundle.handshakeRuntime.getHandshakeTrail({ localTrustDomainId: trustDomainId });
  const externalAgents = buildExternalAgentsViewModel(bundle, handshakeEvents);
  const enforcement = buildEnforcementViewModel(bundle);

  const policyPacks = buildPolicyPackViewModel({
    ...(bundle.policyPackRuntime !== undefined ? { policyPackRuntime: bundle.policyPackRuntime } : {}),
    enforcementRequests: enforcement.requests,
    enforcementDecisions: enforcement.decisions,
    enforcementProofs: enforcement.proofs,
  });
  const policyProofs = policyProofReferences(policyPacks.proofs);
  const policyProofsById = new Map(policyPacks.proofs.map((proof) => [proof.id, proof]));
  const policyProofChains = buildPolicyProofChains(enforcement.proofs, policyProofsById);

  const handshakeProofs = collectHandshakeProofSources(bundle, handshakeEvents);
  const proofs = buildProofsViewModel({ recognition, authority, approvals, enforcement, handshakeProofs, policyProofs, policyProofChains });

  const baseTimeline = buildTimeline({
    recognitionEvents: bundle.recognitionRuntime.getAuditTrail({ trustDomainId }),
    authorityEvents: bundle.authorityRuntime.getAuthorityEvents({ trustDomainId }),
    approvalEvents: bundle.approvalRuntime.getApprovalTrail({ trustDomainId }),
    handshakeEvents,
    enforcementEvents: bundle.enforcementRuntime.store.getEvents({ trustDomainId }),
  });
  const policyTimeline = buildPolicyPackTimeline({
    events: policyPacks.events,
    enforcementLinks: policyPacks.enforcementLinks,
    enforcementDecisions: enforcement.decisions,
  });
  const timeline = [...baseTimeline, ...policyTimeline].sort((a, b) => (a.timestamp !== b.timestamp ? (a.timestamp < b.timestamp ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const emergencyDenyActive = bundle.enforcementRuntime.isEmergencyDenyActive();
  const metrics = [...computeMetrics({ recognition, authority, approvals, externalAgents, enforcement, emergencyDenyActive }), ...policyPacks.metrics];
  const health = computeHealth({ recognition, authority, approvals, externalAgents, enforcement, emergencyDenyActive });
  const recentDecisions = buildRecentDecisions(recognition, authority, approvals, enforcement).slice(0, 10);
  const openItems = buildOpenItems(approvals, externalAgents, enforcement, policyPacks);

  const now = options.now ?? (() => bundle.world.trustDomain.updatedAt);

  return {
    trustDomainId,
    generatedAt: now(),
    overview: { metrics, health, recentDecisions, openItems },
    recognition,
    authority,
    approvals,
    externalAgents,
    enforcement,
    proofs,
    policyPacks,
    timeline,
  };
}
