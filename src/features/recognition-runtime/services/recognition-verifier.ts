import type { ActionRequest } from '../domain/action-request.js';
import type { PolicyContext } from '../domain/policy.js';
import type { RecognitionDecision, RecognitionDecisionType } from '../domain/recognition-decision.js';
import type { RuntimeContext } from '../runtime/runtime-context.js';
import type { ActorRegistry } from './actor-registry.js';
import { mapAuthorityDecisionType, requiresAuthorityChain, type AuthorityGraphIntegration } from './authority-graph-integration.js';
import type { CapabilityTokenService } from './capability-token-service.js';
import type { EvidenceLedger } from './evidence-ledger.js';
import type { PassportService } from './passport-service.js';
import type { PolicyEvaluator } from './policy-evaluator.js';
import type { RevocationEngine } from './revocation-engine.js';
import type { TrustDomainService } from './trust-domain-service.js';

const RECOGNIZED_DECISION_TYPES: readonly RecognitionDecisionType[] = ['allow', 'require_human_approval', 'require_more_evidence'];

export class RecognitionVerifier {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly actorRegistry: ActorRegistry,
    private readonly trustDomainService: TrustDomainService,
    private readonly passportService: PassportService,
    private readonly capabilityTokenService: CapabilityTokenService,
    private readonly policyEvaluator: PolicyEvaluator,
    private readonly revocationEngine: RevocationEngine,
    private readonly evidenceLedger: EvidenceLedger,
    private readonly authorityGraph?: AuthorityGraphIntegration,
  ) {}

  verifyAction(request: ActionRequest): RecognitionDecision {
    const now = this.ctx.clock.now();
    const actor = this.actorRegistry.getActor(request.actorId);
    const trustDomain = this.trustDomainService.getTrustDomain(request.trustDomainId);
    const passport = request.passportId !== undefined ? this.passportService.getPassport(request.passportId) : undefined;
    const capabilityToken =
      request.capabilityTokenId !== undefined ? this.capabilityTokenService.getCapabilityToken(request.capabilityTokenId) : undefined;
    const principalActor = request.principalActorId !== undefined ? this.actorRegistry.getActor(request.principalActorId) : undefined;
    const capabilityCheck = capabilityToken
      ? this.capabilityTokenService.checkCapabilityForAction(capabilityToken, request.action, request.resource)
      : undefined;
    const revocation = this.revocationEngine.checkRevocation({
      actorId: request.actorId,
      ...(request.passportId !== undefined ? { passportId: request.passportId } : {}),
      ...(request.capabilityTokenId !== undefined ? { capabilityTokenId: request.capabilityTokenId } : {}),
    });

    const context: PolicyContext = {
      now,
      issuerAccepted: this.trustDomainService.isIssuerAccepted(request.trustDomainId, actor?.issuerId),
      revocation,
      ...(actor !== undefined ? { actor } : {}),
      ...(principalActor !== undefined ? { principalActor } : {}),
      ...(trustDomain !== undefined ? { trustDomain } : {}),
      ...(passport !== undefined ? { passport } : {}),
      ...(capabilityToken !== undefined ? { capabilityToken } : {}),
      ...(capabilityCheck !== undefined ? { capabilityCheck } : {}),
    };

    const result = this.policyEvaluator.evaluatePolicies(request, context);
    const decisionId = this.ctx.idGenerator.next('decision');

    let decisionType = result.decisionType;
    let reasonCode = result.reasonCode;
    let reason = result.reason;
    let authorityDecisionId: string | undefined;
    let authorityProofId: string | undefined;

    // Recognition alone only proves a capability token exists; it does not prove the
    // authority behind it is legitimate. For agent actions (or acting-for-a-principal
    // actions) that Recognition already deems viable, Authority Graph must additionally
    // prove the authority chain before the action can be allowed to proceed.
    if (this.authorityGraph && RECOGNIZED_DECISION_TYPES.includes(decisionType) && requiresAuthorityChain(actor?.type, request.actorId, request.principalActorId)) {
      const authorityDecision = this.authorityGraph.verifyAuthority({
        id: request.id,
        actorId: request.actorId,
        trustDomainId: request.trustDomainId,
        action: request.action,
        resourceScope: request.resource,
        requestedAt: now,
        ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
        ...(request.capabilityTokenId !== undefined ? { capabilityTokenId: request.capabilityTokenId } : {}),
      });
      authorityDecisionId = authorityDecision.id;
      authorityProofId = authorityDecision.proofId;
      if (!authorityDecision.valid) {
        decisionType = mapAuthorityDecisionType(authorityDecision.type);
        reasonCode = authorityDecision.reasonCode;
        reason = authorityDecision.reason;
      }
    }

    const auditEvent = this.evidenceLedger.recordAuditEvent({
      eventType: 'recognition_decision',
      actorId: request.actorId,
      trustDomainId: request.trustDomainId,
      requestId: request.id,
      decisionId,
      payload: {
        action: request.action,
        resource: request.resource,
        decisionType,
        reasonCode,
        policyResults: result.policyResults,
        ...(authorityDecisionId !== undefined ? { authorityDecisionId } : {}),
      },
      ...(request.passportId !== undefined ? { passportId: request.passportId } : {}),
      ...(request.capabilityTokenId !== undefined ? { capabilityTokenId: request.capabilityTokenId } : {}),
    });

    return {
      id: decisionId,
      requestId: request.id,
      type: decisionType,
      recognized: RECOGNIZED_DECISION_TYPES.includes(decisionType),
      reasonCode,
      reason,
      actorId: request.actorId,
      trustDomainId: request.trustDomainId,
      evaluatedAt: now,
      policyResults: result.policyResults,
      auditEventId: auditEvent.id,
      ...(result.riskLevel !== undefined ? { riskLevel: result.riskLevel } : {}),
      ...(result.requiredEvidence !== undefined ? { requiredEvidence: result.requiredEvidence } : {}),
      ...(result.requiredApproverActorIds !== undefined ? { requiredApproverActorIds: result.requiredApproverActorIds } : {}),
      ...(authorityDecisionId !== undefined ? { authorityDecisionId } : {}),
      ...(authorityProofId !== undefined ? { authorityProofId } : {}),
    };
  }
}
