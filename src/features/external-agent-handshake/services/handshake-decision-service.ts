import type { AgentVisa } from '../domain/agent-visa.js';
import type { ExternalCapabilityRiskLevel } from '../domain/external-capability-request.js';
import type { ExternalTrustIssuer } from '../domain/external-trust-issuer.js';
import type { HandshakeChallenge } from '../domain/handshake-challenge.js';
import type { HandshakeDecision, HandshakeDecisionType } from '../domain/handshake-decision.js';
import type { HandshakeApprovalCheckResult, HandshakeAuthorityCheckResult, HandshakePolicy, HandshakePolicyContext } from '../domain/handshake-policy.js';
import type { HandshakeProof } from '../domain/handshake-proof.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import type { IngressGrant } from '../domain/ingress-grant.js';
import type { HandshakeRuntimeContext } from '../runtime/handshake-runtime-context.js';
import { HandshakeRequestNotFoundError } from '../runtime/handshake-runtime-errors.js';
import type { AgentVisaService } from './agent-visa-service.js';
import { HandshakePolicyEvaluator } from './handshake-policy-evaluator.js';
import type { HandshakeLedger } from './handshake-ledger.js';
import type { HandshakeProofService } from './handshake-proof-service.js';
import type { HandshakeStore } from './handshake-store.js';
import type { IngressGrantService } from './ingress-grant-service.js';

export interface DecideHandshakeInput {
  readonly handshakeRequestId: string;
  readonly riskLevel: ExternalCapabilityRiskLevel;
  readonly issuer?: ExternalTrustIssuer;
  readonly trustBoundary?: TrustBoundary;
  readonly challenge?: HandshakeChallenge;
  readonly authorityCheck?: HandshakeAuthorityCheckResult;
  readonly approvalCheck?: HandshakeApprovalCheckResult;
  readonly duplicateActiveRequest?: HandshakeRequest;
  readonly localActorId?: string;
  readonly ttlMinutes?: number;
}

export interface HandshakeDecisionResult {
  readonly decision: HandshakeDecision;
  readonly request: HandshakeRequest;
  readonly visa?: AgentVisa;
  readonly ingressGrant?: IngressGrant;
  readonly proof?: HandshakeProof;
}

const EVENT_TYPE_BY_DECISION_TYPE: Readonly<Record<HandshakeDecisionType, 'handshake_accepted' | 'handshake_accepted_limited' | 'handshake_requires_approval' | 'handshake_rejected' | 'handshake_quarantined' | 'handshake_expired' | 'handshake_revoked'>> = {
  accepted: 'handshake_accepted',
  accepted_limited: 'handshake_accepted_limited',
  requires_approval: 'handshake_requires_approval',
  rejected: 'handshake_rejected',
  quarantined: 'handshake_quarantined',
  expired: 'handshake_expired',
  revoked: 'handshake_revoked',
};

const REQUEST_STATUS_BY_DECISION_TYPE: Readonly<Record<HandshakeDecisionType, HandshakeRequest['status']>> = {
  accepted: 'accepted',
  accepted_limited: 'accepted_limited',
  requires_approval: 'requires_approval',
  rejected: 'rejected',
  quarantined: 'quarantined',
  expired: 'expired',
  revoked: 'revoked',
};

/**
 * Turns a HandshakeRequest into a final HandshakeDecision: accepted,
 * accepted_limited, requires_approval, rejected or quarantined. Acceptance
 * (full or limited) issues an AgentVisa, an IngressGrant and a
 * HandshakeProof; every other terminal outcome (rejected/quarantined) still
 * produces a HandshakeProof recording that nothing was granted.
 * requires_approval is deliberately non-terminal: no visa, ingress grant or
 * proof exists until the request is re-decided with a satisfied approvalCheck.
 */
export class HandshakeDecisionService {
  private readonly evaluator: HandshakePolicyEvaluator;

  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    private readonly store: HandshakeStore,
    private readonly ledger: HandshakeLedger,
    policies: readonly HandshakePolicy[],
    private readonly agentVisaService: AgentVisaService,
    private readonly ingressGrantService: IngressGrantService,
    private readonly proofService: HandshakeProofService,
  ) {
    this.evaluator = new HandshakePolicyEvaluator(policies);
  }

  decideHandshake(input: DecideHandshakeInput): HandshakeDecisionResult {
    const request = this.requireRequest(input.handshakeRequestId);
    const now = this.ctx.clock.now();

    const context: HandshakePolicyContext = {
      now,
      request,
      riskLevel: input.riskLevel,
      allowedCapabilities: request.requestedCapabilities.map((capabilityRequest) => capabilityRequest.capability),
      allowedActions: [...request.requestedActions],
      allowedResourceScopes: [...request.requestedResourceScopes],
      requiresApprovalSoFar: false,
      ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
      ...(input.trustBoundary !== undefined ? { trustBoundary: input.trustBoundary } : {}),
      ...(input.challenge !== undefined ? { challenge: input.challenge } : {}),
      ...(request.authorityPresentation !== undefined ? { authorityPresentation: request.authorityPresentation } : {}),
      ...(input.authorityCheck !== undefined ? { authorityCheck: input.authorityCheck } : {}),
      ...(input.approvalCheck !== undefined ? { approvalCheck: input.approvalCheck } : {}),
      ...(input.duplicateActiveRequest !== undefined ? { duplicateActiveRequest: input.duplicateActiveRequest } : {}),
    };

    const evaluation = this.evaluator.evaluate(context);

    const approvalPatch = input.approvalCheck
      ? {
          ...(input.approvalCheck.approvalRequestId !== undefined ? { approvalRequestId: input.approvalCheck.approvalRequestId } : {}),
          ...(input.approvalCheck.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalCheck.approvalDecisionId } : {}),
          ...(input.approvalCheck.approvalProofId !== undefined ? { approvalProofId: input.approvalCheck.approvalProofId } : {}),
        }
      : {};

    if (evaluation.decisionType === 'accepted' || evaluation.decisionType === 'accepted_limited') {
      return this.finalizeAccepted(request, evaluation.decisionType, {
        allowedCapabilities: evaluation.allowedCapabilities,
        allowedActions: evaluation.allowedActions,
        allowedResourceScopes: evaluation.allowedResourceScopes,
        reasonCode: evaluation.reasonCode,
        reason: evaluation.reason,
        requestPatch: approvalPatch,
        ...(input.ttlMinutes !== undefined ? { ttlMinutes: input.ttlMinutes } : {}),
        ...(input.localActorId !== undefined ? { localActorId: input.localActorId } : {}),
        ...(input.approvalCheck?.approvalProofId !== undefined ? { approvalProofId: input.approvalCheck.approvalProofId } : {}),
      });
    }

    return this.finalizeNonAccepted(request, evaluation.decisionType, evaluation.reasonCode, evaluation.reason, approvalPatch);
  }

  accept(handshakeRequestId: string, reasonCode: string, reason: string, options: { readonly ttlMinutes?: number; readonly localActorId?: string } = {}): HandshakeDecisionResult {
    const request = this.requireRequest(handshakeRequestId);
    return this.finalizeAccepted(request, 'accepted', {
      allowedCapabilities: request.requestedCapabilities.map((c) => c.capability),
      allowedActions: [...request.requestedActions],
      allowedResourceScopes: [...request.requestedResourceScopes],
      reasonCode,
      reason,
      ...(options.ttlMinutes !== undefined ? { ttlMinutes: options.ttlMinutes } : {}),
      ...(options.localActorId !== undefined ? { localActorId: options.localActorId } : {}),
    });
  }

  acceptLimited(
    handshakeRequestId: string,
    allowed: { readonly capabilities: readonly string[]; readonly actions: readonly string[]; readonly resourceScopes: readonly string[] },
    reasonCode: string,
    reason: string,
    options: { readonly ttlMinutes?: number; readonly localActorId?: string } = {},
  ): HandshakeDecisionResult {
    const request = this.requireRequest(handshakeRequestId);
    return this.finalizeAccepted(request, 'accepted_limited', {
      allowedCapabilities: allowed.capabilities,
      allowedActions: allowed.actions,
      allowedResourceScopes: allowed.resourceScopes,
      reasonCode,
      reason,
      ...(options.ttlMinutes !== undefined ? { ttlMinutes: options.ttlMinutes } : {}),
      ...(options.localActorId !== undefined ? { localActorId: options.localActorId } : {}),
    });
  }

  reject(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.finalizeNonAccepted(this.requireRequest(handshakeRequestId), 'rejected', reasonCode, reason);
  }

  quarantine(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.finalizeNonAccepted(this.requireRequest(handshakeRequestId), 'quarantined', reasonCode, reason);
  }

  requireApproval(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.finalizeNonAccepted(this.requireRequest(handshakeRequestId), 'requires_approval', reasonCode, reason);
  }

  private requireRequest(handshakeRequestId: string): HandshakeRequest {
    const request = this.store.getHandshakeRequest(handshakeRequestId);
    if (!request) {
      throw new HandshakeRequestNotFoundError(handshakeRequestId);
    }
    return request;
  }

  private finalizeAccepted(
    request: HandshakeRequest,
    type: 'accepted' | 'accepted_limited',
    options: {
      readonly allowedCapabilities: readonly string[];
      readonly allowedActions: readonly string[];
      readonly allowedResourceScopes: readonly string[];
      readonly reasonCode: string;
      readonly reason: string;
      readonly ttlMinutes?: number;
      readonly localActorId?: string;
      readonly approvalProofId?: string;
      readonly requestPatch?: Partial<HandshakeRequest>;
    },
  ): HandshakeDecisionResult {
    const now = this.ctx.clock.now();
    const deniedCapabilities = request.requestedCapabilities.map((c) => c.capability).filter((c) => !options.allowedCapabilities.includes(c));
    const deniedActions = request.requestedActions.filter((a) => !options.allowedActions.includes(a));
    const deniedResourceScopes = request.requestedResourceScopes.filter((s) => !options.allowedResourceScopes.includes(s));

    const decisionId = this.ctx.ids.nextId('handshake-decision');

    const visa = this.agentVisaService.issueAgentVisa({
      handshakeRequestId: request.id,
      handshakeDecisionId: decisionId,
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      allowedCapabilities: options.allowedCapabilities,
      allowedActions: options.allowedActions,
      allowedResourceScopes: options.allowedResourceScopes,
      ...(request.requestedDataDomains !== undefined ? { dataDomains: request.requestedDataDomains } : {}),
      ...(request.externalAgent.externalIssuerId !== undefined ? { externalIssuerId: request.externalAgent.externalIssuerId } : {}),
      ...(request.externalAgent.externalTrustDomainId !== undefined ? { externalTrustDomainId: request.externalAgent.externalTrustDomainId } : {}),
      ...(options.ttlMinutes !== undefined ? { ttlMinutes: options.ttlMinutes } : {}),
      ...(options.localActorId !== undefined ? { localActorId: options.localActorId } : {}),
    });

    const ingressGrant = this.ingressGrantService.issueIngressGrant(
      {
        agentVisaId: visa.id,
        localTrustDomainId: request.localTrustDomainId,
        externalAgentId: request.externalAgent.id,
        actions: options.allowedActions,
        resourceScopes: options.allowedResourceScopes,
        capabilities: options.allowedCapabilities,
      },
      visa,
    );

    const proof = this.proofService.createProof({
      handshakeRequestId: request.id,
      handshakeDecisionId: decisionId,
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      passportPresentationId: request.passportPresentation.id,
      decisionType: type,
      accepted: true,
      visaId: visa.id,
      ingressGrantId: ingressGrant.id,
      evidenceHashes: [request.passportPresentation.presentationHash],
      ...(request.authorityPresentation !== undefined ? { authorityPresentationId: request.authorityPresentation.id } : {}),
      ...(options.approvalProofId !== undefined ? { approvalProofId: options.approvalProofId } : {}),
    });

    const decision: HandshakeDecision = {
      id: decisionId,
      handshakeRequestId: request.id,
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      type,
      accepted: true,
      reasonCode: options.reasonCode,
      reason: options.reason,
      allowedCapabilities: options.allowedCapabilities,
      allowedActions: options.allowedActions,
      allowedResourceScopes: options.allowedResourceScopes,
      deniedCapabilities,
      deniedActions,
      deniedResourceScopes,
      requiresApproval: false,
      visaId: visa.id,
      ingressGrantId: ingressGrant.id,
      proofId: proof.id,
      decidedAt: now,
      ...(options.approvalProofId !== undefined ? { approvalProofId: options.approvalProofId } : {}),
    };
    this.store.putHandshakeDecision(decision);

    const updatedRequest = this.store.updateHandshakeRequestStatus(request.id, REQUEST_STATUS_BY_DECISION_TYPE[type], {
      ...options.requestPatch,
    });

    this.ledger.recordEvent({
      type: EVENT_TYPE_BY_DECISION_TYPE[type],
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      handshakeRequestId: request.id,
      handshakeDecisionId: decisionId,
      handshakeProofId: proof.id,
      visaId: visa.id,
      ingressGrantId: ingressGrant.id,
      payload: { reasonCode: options.reasonCode },
    });
    this.ledger.recordEvent({
      type: 'handshake_proof_created',
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      handshakeRequestId: request.id,
      handshakeDecisionId: decisionId,
      handshakeProofId: proof.id,
      payload: { proofHash: proof.proofHash },
    });

    return { decision, request: updatedRequest, visa, ingressGrant, proof };
  }

  private finalizeNonAccepted(
    request: HandshakeRequest,
    type: 'requires_approval' | 'rejected' | 'quarantined' | 'expired' | 'revoked',
    reasonCode: string,
    reason: string,
    requestPatch: Partial<HandshakeRequest> = {},
  ): HandshakeDecisionResult {
    const now = this.ctx.clock.now();
    const decisionId = this.ctx.ids.nextId('handshake-decision');
    const requestedCapabilities = request.requestedCapabilities.map((c) => c.capability);

    const decision: HandshakeDecision = {
      id: decisionId,
      handshakeRequestId: request.id,
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      type,
      accepted: false,
      reasonCode,
      reason,
      allowedCapabilities: type === 'requires_approval' ? requestedCapabilities : [],
      allowedActions: type === 'requires_approval' ? [...request.requestedActions] : [],
      allowedResourceScopes: type === 'requires_approval' ? [...request.requestedResourceScopes] : [],
      deniedCapabilities: type === 'requires_approval' ? [] : requestedCapabilities,
      deniedActions: type === 'requires_approval' ? [] : [...request.requestedActions],
      deniedResourceScopes: type === 'requires_approval' ? [] : [...request.requestedResourceScopes],
      requiresApproval: type === 'requires_approval',
      decidedAt: now,
    };
    this.store.putHandshakeDecision(decision);

    let proofId: string | undefined;
    let createdProof: HandshakeProof | undefined;
    if (type !== 'requires_approval') {
      createdProof = this.proofService.createProof({
        handshakeRequestId: request.id,
        handshakeDecisionId: decisionId,
        localTrustDomainId: request.localTrustDomainId,
        externalAgentId: request.externalAgent.id,
        passportPresentationId: request.passportPresentation.id,
        decisionType: type,
        accepted: false,
        evidenceHashes: [request.passportPresentation.presentationHash],
        ...(request.authorityPresentation !== undefined ? { authorityPresentationId: request.authorityPresentation.id } : {}),
      });
      proofId = createdProof.id;
      this.store.putHandshakeDecision({ ...decision, proofId });
    }

    const updatedRequest = this.store.updateHandshakeRequestStatus(request.id, REQUEST_STATUS_BY_DECISION_TYPE[type], requestPatch);

    this.ledger.recordEvent({
      type: EVENT_TYPE_BY_DECISION_TYPE[type],
      localTrustDomainId: request.localTrustDomainId,
      externalAgentId: request.externalAgent.id,
      handshakeRequestId: request.id,
      handshakeDecisionId: decisionId,
      ...(proofId !== undefined ? { handshakeProofId: proofId } : {}),
      payload: { reasonCode },
    });

    return {
      decision: this.store.getHandshakeDecision(decisionId) ?? decision,
      request: updatedRequest,
      ...(createdProof !== undefined ? { proof: createdProof } : {}),
    };
  }
}
