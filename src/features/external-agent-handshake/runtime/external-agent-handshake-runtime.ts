import type { AgentVisa } from '../domain/agent-visa.js';
import type { ExternalAgentDescriptor } from '../domain/external-agent-descriptor.js';
import type { ExternalAuthorityPresentation } from '../domain/external-authority-presentation.js';
import type { ExternalCapabilityRequest } from '../domain/external-capability-request.js';
import type { ExternalPassportPresentation } from '../domain/external-passport-presentation.js';
import type { ExternalTrustIssuer } from '../domain/external-trust-issuer.js';
import type { HandshakeChallenge, HandshakeChallengePurpose } from '../domain/handshake-challenge.js';
import type { HandshakeEvent } from '../domain/handshake-event.js';
import type { HandshakeProof } from '../domain/handshake-proof.js';
import type { HandshakeRequest } from '../domain/handshake-request.js';
import type { HandshakeVerificationInput, HandshakeVerificationResult, HandshakeVerificationResultType } from '../domain/handshake-verification.js';
import type { IngressGrant } from '../domain/ingress-grant.js';
import type { TrustBoundary } from '../domain/trust-boundary.js';
import { createDefaultHandshakePolicyChain } from '../policies/index.js';
import { AgentVisaService, type IssueAgentVisaInput } from '../services/agent-visa-service.js';
import { AuthorityPresentationService, type PresentAuthorityInput } from '../services/authority-presentation-service.js';
import { CapabilityRequestService, type CreateCapabilityRequestInput } from '../services/capability-request-service.js';
import { ExternalIssuerRegistry, type RegisterExternalIssuerInput } from '../services/external-issuer-registry.js';
import {
  createHandshakeApprovalRuntimeIntegration,
  type ApprovalRuntimeLike,
  type HandshakeApprovalRuntimeIntegration,
} from '../services/handshake-approval-runtime-integration.js';
import {
  createHandshakeAuthorityGraphIntegration,
  type AuthorityGraphRuntimeLike,
  type HandshakeAuthorityGraphIntegration,
} from '../services/handshake-authority-graph-integration.js';
import { HandshakeChallengeService, type IssueChallengeInput } from '../services/handshake-challenge-service.js';
import { HandshakeDecisionService, type HandshakeDecisionResult } from '../services/handshake-decision-service.js';
import { HandshakeExpirationService } from '../services/handshake-expiration-service.js';
import { HandshakeLedger, type HandshakeEventTrailFilter } from '../services/handshake-ledger.js';
import { HandshakeProofService } from '../services/handshake-proof-service.js';
import { HandshakeRequestService, type SubmitHandshakeRequestInput } from '../services/handshake-request-service.js';
import { HandshakeRevocationService } from '../services/handshake-revocation-service.js';
import { HandshakeStore } from '../services/handshake-store.js';
import { IngressGrantService, type IssueIngressGrantInput } from '../services/ingress-grant-service.js';
import { PassportPresentationService, type PresentPassportInput } from '../services/passport-presentation-service.js';
import { TrustBoundaryService, type CreateTrustBoundaryInput } from '../services/trust-boundary-service.js';
import { HandshakeRequestNotFoundError } from './handshake-runtime-errors.js';
import type { HandshakeRuntimeContext } from './handshake-runtime-context.js';

export interface ExternalAgentHandshakeRuntimeOptions {
  /** Structurally-typed AuthorityGraphRuntime (or compatible object) used to verify claimed authority presentations. */
  readonly authorityGraph?: AuthorityGraphRuntimeLike;
  /** Structurally-typed ApprovalRuntime (or compatible object) used to govern high-risk/unknown-issuer handshakes. */
  readonly approvalRuntime?: ApprovalRuntimeLike;
}

/**
 * Mirrors Recognition Runtime's HandshakeVerificationInput field-for-field
 * (plus a local actorId) so an ExternalAgentHandshakeRuntime instance
 * structurally satisfies Recognition Runtime's optional
 * ExternalAgentStandingIntegration without either feature importing the
 * other's types.
 */
export interface ExternalStandingVerificationInput {
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;
  readonly requestedAt: string;

  readonly externalAgentId?: string;
  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeProofId?: string;
}

export interface ExternalStandingVerificationResult {
  readonly type: HandshakeVerificationResultType;
  readonly valid: boolean;

  readonly visaId?: string;
  readonly ingressGrantId?: string;
  readonly handshakeDecisionId?: string;
  readonly handshakeProofId?: string;

  readonly reasonCode: string;
  readonly reason: string;
}

export interface ExternalAgentStandingIntegration {
  verifyExternalStanding(input: ExternalStandingVerificationInput): ExternalStandingVerificationResult;
}

const PENDING_REQUEST_RESULT_BY_STATUS: Readonly<Partial<Record<HandshakeRequest['status'], HandshakeVerificationResultType>>> = {
  submitted: 'handshake_pending',
  challenged: 'handshake_pending',
  verifying: 'handshake_pending',
  requires_approval: 'approval_required',
  rejected: 'handshake_rejected',
  quarantined: 'handshake_quarantined',
};

/**
 * Composes every External Agent Handshake service into the single runtime
 * API a caller (or Recognition Runtime, through the structural
 * ExternalAgentStandingIntegration) needs: submit a handshake, resolve it to
 * a decision, and verify whatever standing that decision produced for a
 * later action. This is the border-control layer for AOC trust domains --
 * it never bypasses local governance, and never fakes Recognition Runtime,
 * Authority Graph or Approval Runtime.
 */
export class ExternalAgentHandshakeRuntime {
  readonly store: HandshakeStore;
  readonly ledger: HandshakeLedger;
  readonly issuerRegistry: ExternalIssuerRegistry;
  readonly trustBoundaryService: TrustBoundaryService;
  readonly requestService: HandshakeRequestService;
  readonly challengeService: HandshakeChallengeService;
  readonly passportService: PassportPresentationService;
  readonly capabilityRequestService: CapabilityRequestService;
  readonly authorityPresentationService: AuthorityPresentationService;
  readonly decisionService: HandshakeDecisionService;
  readonly agentVisaService: AgentVisaService;
  readonly ingressGrantService: IngressGrantService;
  readonly proofService: HandshakeProofService;
  readonly expirationService: HandshakeExpirationService;
  readonly revocationService: HandshakeRevocationService;
  readonly authorityGraph: HandshakeAuthorityGraphIntegration | undefined;
  readonly approvalRuntime: HandshakeApprovalRuntimeIntegration | undefined;

  constructor(
    private readonly ctx: HandshakeRuntimeContext,
    options: ExternalAgentHandshakeRuntimeOptions = {},
  ) {
    this.store = new HandshakeStore();
    this.ledger = new HandshakeLedger(ctx, this.store);
    this.issuerRegistry = new ExternalIssuerRegistry(ctx, this.store);
    this.trustBoundaryService = new TrustBoundaryService(ctx, this.store);
    this.requestService = new HandshakeRequestService(ctx, this.store, this.ledger);
    this.challengeService = new HandshakeChallengeService(ctx, this.store, this.ledger);
    this.passportService = new PassportPresentationService(ctx, this.store, this.issuerRegistry);
    this.capabilityRequestService = new CapabilityRequestService(ctx, this.store, this.trustBoundaryService);
    this.authorityGraph = options.authorityGraph ? createHandshakeAuthorityGraphIntegration(options.authorityGraph) : undefined;
    this.authorityPresentationService = new AuthorityPresentationService(ctx, this.store, this.authorityGraph);
    this.agentVisaService = new AgentVisaService(ctx, this.store, this.ledger);
    this.ingressGrantService = new IngressGrantService(ctx, this.store, this.ledger);
    this.proofService = new HandshakeProofService(ctx, this.store);
    this.decisionService = new HandshakeDecisionService(
      ctx,
      this.store,
      this.ledger,
      createDefaultHandshakePolicyChain(),
      this.agentVisaService,
      this.ingressGrantService,
      this.proofService,
    );
    this.expirationService = new HandshakeExpirationService(ctx, this.store, this.agentVisaService, this.ingressGrantService);
    this.revocationService = new HandshakeRevocationService(ctx, this.store, this.ledger, this.agentVisaService, this.ingressGrantService);
    this.approvalRuntime = options.approvalRuntime ? createHandshakeApprovalRuntimeIntegration(options.approvalRuntime) : undefined;
  }

  // -- Registration / configuration ---------------------------------------

  registerExternalAgent(input: Omit<ExternalAgentDescriptor, 'firstSeenAt'> & { readonly firstSeenAt?: string }): ExternalAgentDescriptor {
    return this.store.putExternalAgent({ ...input, firstSeenAt: input.firstSeenAt ?? this.ctx.clock.now() });
  }

  registerExternalIssuer(input: RegisterExternalIssuerInput): ExternalTrustIssuer {
    return this.issuerRegistry.registerExternalIssuer(input);
  }

  trustExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.issuerRegistry.trustExternalIssuer(externalIssuerId);
  }

  limitExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.issuerRegistry.limitExternalIssuer(externalIssuerId);
  }

  suspendExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.issuerRegistry.suspendExternalIssuer(externalIssuerId);
  }

  revokeExternalIssuer(externalIssuerId: string): ExternalTrustIssuer {
    return this.issuerRegistry.revokeExternalIssuer(externalIssuerId);
  }

  createTrustBoundary(input: CreateTrustBoundaryInput): TrustBoundary {
    return this.trustBoundaryService.createTrustBoundary(input);
  }

  // -- Handshake assembly ---------------------------------------------------

  presentPassport(input: PresentPassportInput): ExternalPassportPresentation {
    return this.passportService.presentPassport(input);
  }

  presentAuthority(input: PresentAuthorityInput): ExternalAuthorityPresentation {
    return this.authorityPresentationService.presentAuthority(input);
  }

  createCapabilityRequest(input: CreateCapabilityRequestInput): ExternalCapabilityRequest {
    return this.capabilityRequestService.createCapabilityRequest(input);
  }

  submitHandshakeRequest(input: SubmitHandshakeRequestInput): HandshakeRequest {
    return this.requestService.submitHandshakeRequest(input);
  }

  getHandshakeRequest(handshakeRequestId: string): HandshakeRequest | undefined {
    return this.store.getHandshakeRequest(handshakeRequestId);
  }

  cancelHandshakeRequest(handshakeRequestId: string): HandshakeRequest {
    return this.requestService.cancelHandshakeRequest(handshakeRequestId);
  }

  issueChallenge(input: IssueChallengeInput): HandshakeChallenge {
    return this.challengeService.issueChallenge(input);
  }

  /** Deterministically computes the response an external agent that truly received the nonce would echo back -- useful for fixtures/tests exercising the "correct answer" path. */
  computeExpectedChallengeResponse(handshakeChallengeId: string): string | undefined {
    return this.challengeService.computeExpectedResponse(handshakeChallengeId);
  }

  answerChallenge(handshakeChallengeId: string, responseHash: string): HandshakeChallenge {
    return this.challengeService.answerChallenge(handshakeChallengeId, responseHash);
  }

  // -- Decisioning -----------------------------------------------------------

  /**
   * Runs the full deterministic policy chain for a submitted HandshakeRequest,
   * resolving trust boundary, issuer, challenge, authority and approval state
   * automatically. When the outcome is requires_approval and an Approval
   * Runtime integration is configured, this also creates the ApprovalRequest
   * the first time that state is reached.
   */
  decideHandshake(handshakeRequestId: string): HandshakeDecisionResult {
    const request = this.requireRequest(handshakeRequestId);
    const now = this.ctx.clock.now();
    const riskLevel = this.capabilityRequestService.computeAggregateRiskLevel(request.requestedCapabilities);
    const trustBoundary = this.trustBoundaryService.getTrustBoundaryForLocalDomain(request.localTrustDomainId);
    const issuer = request.externalAgent.externalIssuerId !== undefined ? this.issuerRegistry.getExternalIssuer(request.externalAgent.externalIssuerId) : undefined;
    const challenge = this.store.getHandshakeChallengeByRequestId(request.id);

    const authorityCheck = request.authorityPresentation
      ? this.authorityPresentationService.verifyAuthorityPresentation(request.authorityPresentation, {
          requestId: request.id,
          trustDomainId: request.localTrustDomainId,
          requestedAt: now,
        })
      : undefined;

    const primaryCapability = request.requestedCapabilities[0];
    const approvalCheck = this.approvalRuntime
      ? this.approvalRuntime.verifyApprovalForHandshake({
          handshakeRequestId: request.id,
          localTrustDomainId: request.localTrustDomainId,
          externalAgentId: request.externalAgent.id,
          action: request.requestedActions[0] ?? '',
          resourceScope: request.requestedResourceScopes[0] ?? '',
          requestedAt: now,
          ...(request.approvalRequestId !== undefined ? { approvalRequestId: request.approvalRequestId } : {}),
          ...(request.approvalDecisionId !== undefined ? { approvalDecisionId: request.approvalDecisionId } : {}),
          ...(request.approvalProofId !== undefined ? { approvalProofId: request.approvalProofId } : {}),
          ...(primaryCapability !== undefined ? { capability: primaryCapability.capability } : {}),
        })
      : undefined;

    const result = this.decisionService.decideHandshake({
      handshakeRequestId,
      riskLevel,
      ...(trustBoundary !== undefined ? { trustBoundary } : {}),
      ...(issuer !== undefined ? { issuer } : {}),
      ...(challenge !== undefined ? { challenge } : {}),
      ...(authorityCheck !== undefined ? { authorityCheck } : {}),
      ...(approvalCheck !== undefined ? { approvalCheck } : {}),
      ...(trustBoundary !== undefined ? { ttlMinutes: this.trustBoundaryService.computeMaxVisaTtlMinutes(trustBoundary, issuer?.maxVisaTtlMinutes) } : {}),
    });

    if (result.decision.type === 'requires_approval' && this.approvalRuntime && result.request.approvalRequestId === undefined) {
      const reference = this.approvalRuntime.createApprovalRequestForHandshake({
        handshakeRequestId: request.id,
        localTrustDomainId: request.localTrustDomainId,
        requestedByActorId: request.externalAgent.responsibleHumanActorId ?? request.localTrustDomainId,
        targetActorId: request.externalAgent.responsibleHumanActorId ?? request.localTrustDomainId,
        action: request.requestedActions[0] ?? '',
        resourceScope: request.requestedResourceScopes[0] ?? '',
        riskLevel,
        ...(primaryCapability !== undefined ? { capability: primaryCapability.capability } : {}),
      });
      const updatedRequest = this.store.updateHandshakeRequestStatus(request.id, 'requires_approval', { approvalRequestId: reference.approvalRequestId });
      return { ...result, request: updatedRequest };
    }

    return result;
  }

  acceptHandshake(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.decisionService.accept(handshakeRequestId, reasonCode, reason);
  }

  acceptHandshakeLimited(
    handshakeRequestId: string,
    allowed: { readonly capabilities: readonly string[]; readonly actions: readonly string[]; readonly resourceScopes: readonly string[] },
    reasonCode: string,
    reason: string,
  ): HandshakeDecisionResult {
    return this.decisionService.acceptLimited(handshakeRequestId, allowed, reasonCode, reason);
  }

  rejectHandshake(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.decisionService.reject(handshakeRequestId, reasonCode, reason);
  }

  quarantineHandshake(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.decisionService.quarantine(handshakeRequestId, reasonCode, reason);
  }

  requireApprovalForHandshake(handshakeRequestId: string, reasonCode: string, reason: string): HandshakeDecisionResult {
    return this.decisionService.requireApproval(handshakeRequestId, reasonCode, reason);
  }

  // -- Visa / ingress -----------------------------------------------------

  issueAgentVisa(input: IssueAgentVisaInput): AgentVisa {
    return this.agentVisaService.issueAgentVisa(input);
  }

  issueIngressGrant(input: IssueIngressGrantInput, visa: AgentVisa): IngressGrant {
    return this.ingressGrantService.issueIngressGrant(input, visa);
  }

  revokeAgentVisa(visaId: string, revokedByActorId: string, reason: string): AgentVisa {
    return this.revocationService.revokeAgentVisa(visaId, revokedByActorId, reason);
  }

  revokeIngressGrant(ingressGrantId: string, revokedByActorId: string, reason: string): IngressGrant {
    return this.revocationService.revokeIngressGrant(ingressGrantId, revokedByActorId, reason);
  }

  expireAgentVisa(visaId: string): AgentVisa {
    return this.agentVisaService.expireAgentVisa(visaId);
  }

  // -- Standing verification -------------------------------------------------

  /** The general-purpose verification entry point, keyed by external agent rather than local actor. */
  verifyVisaForAction(input: HandshakeVerificationInput): HandshakeVerificationResult {
    const visa = input.visaId !== undefined ? this.store.getAgentVisa(input.visaId) : this.store.getLatestVisaForAgent(input.externalAgentId, input.localTrustDomainId);

    if (!visa) {
      const request =
        input.handshakeRequestId !== undefined
          ? this.store.getHandshakeRequest(input.handshakeRequestId)
          : this.store.getLatestHandshakeRequestForAgent(input.externalAgentId, input.localTrustDomainId);
      return this.noStandingResult(request);
    }

    const visaVerification = this.agentVisaService.verifyAgentVisa(visa.id, input.requestedAt);
    if (!visaVerification.valid) {
      const type: HandshakeVerificationResultType =
        visaVerification.reasonCode === 'VISA_EXPIRED' ? 'visa_expired' : visaVerification.reasonCode === 'VISA_REVOKED' ? 'visa_revoked' : 'ingress_denied';
      return { type, valid: false, visaId: visa.id, reasonCode: visaVerification.reasonCode, reason: visaVerification.reason };
    }

    if (input.capability !== undefined && !visa.allowedCapabilities.includes(input.capability)) {
      return {
        type: 'capability_denied',
        valid: false,
        visaId: visa.id,
        reasonCode: 'CAPABILITY_DENIED',
        reason: `Agent visa ${visa.id} does not permit capability "${input.capability}".`,
      };
    }
    if (!visa.allowedResourceScopes.includes(input.resourceScope)) {
      return {
        type: 'scope_denied',
        valid: false,
        visaId: visa.id,
        reasonCode: 'SCOPE_DENIED',
        reason: `Agent visa ${visa.id} does not permit scope "${input.resourceScope}".`,
      };
    }
    if (!visa.allowedActions.includes(input.action)) {
      return {
        type: 'capability_denied',
        valid: false,
        visaId: visa.id,
        reasonCode: 'ACTION_DENIED',
        reason: `Agent visa ${visa.id} does not permit action "${input.action}".`,
      };
    }

    const grant = input.ingressGrantId !== undefined ? this.store.getIngressGrant(input.ingressGrantId) : this.store.queryIngressGrantsByVisa(visa.id).at(-1);
    if (!grant) {
      return { type: 'ingress_denied', valid: false, visaId: visa.id, reasonCode: 'INGRESS_MISSING', reason: `No ingress grant exists for agent visa ${visa.id}.` };
    }
    const ingressVerification = this.ingressGrantService.verifyIngressGrant(grant.id, input.requestedAt, { action: input.action, resourceScope: input.resourceScope });
    if (!ingressVerification.valid) {
      return { type: 'ingress_denied', valid: false, visaId: visa.id, ingressGrantId: grant.id, reasonCode: ingressVerification.reasonCode, reason: ingressVerification.reason };
    }

    return {
      type: 'standing_valid',
      valid: true,
      visaId: visa.id,
      ingressGrantId: grant.id,
      handshakeDecisionId: visa.handshakeDecisionId,
      reasonCode: 'STANDING_VALID',
      reason: `External agent ${visa.externalAgentId} has valid standing for this action.`,
    };
  }

  /** The structural entry point Recognition Runtime calls through ExternalAgentStandingIntegration. */
  verifyExternalStanding(input: ExternalStandingVerificationInput): ExternalStandingVerificationResult {
    const result = this.verifyVisaForAction({
      localTrustDomainId: input.trustDomainId,
      externalAgentId: input.externalAgentId ?? input.actorId,
      action: input.action,
      resourceScope: input.resourceScope,
      requestedAt: input.requestedAt,
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.visaId !== undefined ? { visaId: input.visaId } : {}),
      ...(input.ingressGrantId !== undefined ? { ingressGrantId: input.ingressGrantId } : {}),
    });

    this.ledger.recordEvent({
      type: 'external_standing_evaluated',
      localTrustDomainId: input.trustDomainId,
      externalAgentId: input.externalAgentId ?? input.actorId,
      ...(result.visaId !== undefined ? { visaId: result.visaId } : {}),
      payload: { type: result.type, reasonCode: result.reasonCode },
    });

    return {
      type: result.type,
      valid: result.valid,
      reasonCode: result.reasonCode,
      reason: result.reason,
      ...(result.visaId !== undefined ? { visaId: result.visaId } : {}),
      ...(result.ingressGrantId !== undefined ? { ingressGrantId: result.ingressGrantId } : {}),
      ...(result.handshakeDecisionId !== undefined ? { handshakeDecisionId: result.handshakeDecisionId } : {}),
      ...(result.handshakeProofId !== undefined ? { handshakeProofId: result.handshakeProofId } : {}),
    };
  }

  private noStandingResult(request: HandshakeRequest | undefined): HandshakeVerificationResult {
    if (!request) {
      return { type: 'handshake_required', valid: false, reasonCode: 'STANDING_MISSING', reason: 'No handshake has been submitted for this external agent.' };
    }
    const type = PENDING_REQUEST_RESULT_BY_STATUS[request.status] ?? 'handshake_required';
    return { type, valid: false, reasonCode: `HANDSHAKE_${request.status.toUpperCase()}`, reason: `Handshake request ${request.id} has status "${request.status}" and grants no standing.` };
  }

  private requireRequest(handshakeRequestId: string): HandshakeRequest {
    const request = this.store.getHandshakeRequest(handshakeRequestId);
    if (!request) {
      throw new HandshakeRequestNotFoundError(handshakeRequestId);
    }
    return request;
  }

  // -- Proof / ledger -----------------------------------------------------

  getHandshakeProof(handshakeDecisionId: string): HandshakeProof | undefined {
    return this.proofService.getProofByDecisionId(handshakeDecisionId);
  }

  getHandshakeTrail(filter?: HandshakeEventTrailFilter): readonly HandshakeEvent[] {
    return this.ledger.getEventTrail(filter);
  }
}

export function createExternalAgentHandshakeRuntime(ctx: HandshakeRuntimeContext, options?: ExternalAgentHandshakeRuntimeOptions): ExternalAgentHandshakeRuntime {
  return new ExternalAgentHandshakeRuntime(ctx, options);
}

/** Adapts an ExternalAgentHandshakeRuntime instance into the structural ExternalAgentStandingIntegration Recognition Runtime optionally consumes. */
export function createExternalAgentStandingIntegration(runtime: ExternalAgentHandshakeRuntime): ExternalAgentStandingIntegration {
  return {
    verifyExternalStanding(input: ExternalStandingVerificationInput): ExternalStandingVerificationResult {
      return runtime.verifyExternalStanding(input);
    },
  };
}

export type { HandshakeChallengePurpose };
