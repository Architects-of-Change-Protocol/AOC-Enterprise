import type { Actor } from '../../recognition-runtime/domain/actor.js';
import type { EvidenceItem } from '../../recognition-runtime/domain/evidence.js';
import type { RecognitionCapabilityToken } from '../../recognition-runtime/domain/capability-token.js';
import type { Passport } from '../../recognition-runtime/domain/passport.js';
import type { TrustDomain } from '../../recognition-runtime/domain/trust-domain.js';
import { createAocRecognitionRuntime, type AocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import { createAuthorityGraphRuntime, type AuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../authority-graph/runtime/authority-runtime-context.js';
import { ApprovalRuntime } from '../../approval-runtime/runtime/approval-runtime.js';
import { createApprovalRuntimeContext } from '../../approval-runtime/runtime/approval-runtime-context.js';
import {
  createExternalAgentStandingIntegration,
  createHandshakeRuntimeContext,
  ExternalAgentHandshakeRuntime,
} from '../../external-agent-handshake/runtime/index.js';
import {
  buildDatasysHandshakeWorld,
  PROJECT_SCOPE as HANDSHAKE_PROJECT_SCOPE,
  READ_PROJECT_SUMMARY,
  TRUST_DOMAIN_ID as HANDSHAKE_TRUST_DOMAIN_ID,
  TRUSTED_PARTNER_AGENT_ID,
  TRUSTED_PARTNER_ISSUER_ID,
  UNKNOWN_AGENT_ID as HANDSHAKE_UNKNOWN_AGENT_ID,
} from '../../external-agent-handshake/fixtures/datasys-handshake.fixture.js';
import { submitTrustedPartnerHandshakeRequest } from '../../external-agent-handshake/fixtures/known-partner-agent.fixture.js';
import type { EnforcementRecognitionIntegration, RecognitionVerificationInput, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import { createActionEnforcementRuntime, type ActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { AocGuard, createAocGuard } from '../sdk/aoc-guard.js';

export const NOW = '2026-01-01T00:00:00.000Z';

export const TRUST_DOMAIN_ID = HANDSHAKE_TRUST_DOMAIN_ID;
export const PROJECT_SCOPE = HANDSHAKE_PROJECT_SCOPE;

export const DATASYS_ACTOR_ID = 'actor-datasys';
export const VICTOR_ACTOR_ID = 'actor-victor-valverde';
export const PMFREAK_ACTOR_ID = 'actor-pmfreak-closure-agent';
export const UNKNOWN_AGENT_ACTOR_ID = 'actor-unknown-external-agent';
export { TRUSTED_PARTNER_AGENT_ID };

export const DRAFT_CLOSURE_EMAIL = 'draft_closure_email';
export const SUMMARIZE_PROJECT_STATUS = 'summarize_project_status';
export const PREPARE_INVOICE_SUPPORT = 'prepare_invoice_support';
export const SEND_CLIENT_FOLLOW_UP = 'send_client_follow_up';
export { READ_PROJECT_SUMMARY };
export const APPROVE_PAYMENT = 'approve_payment';
export const SIGN_CONTRACT = 'sign_contract';
export const CHANGE_BANK_ACCOUNT = 'change_bank_account';

export const PMFREAK_DRAFTING_TOKEN_ID = 'cap-pmfreak-drafting';
export const PMFREAK_INVOICE_TOKEN_ID = 'cap-pmfreak-invoice-support';
export const PMFREAK_COMMUNICATION_TOKEN_ID = 'cap-pmfreak-communication';
export const PMFREAK_PAYMENT_TOKEN_ID = 'cap-pmfreak-payment';
export const VICTOR_FINANCIAL_TOKEN_ID = 'cap-victor-financial';
export const VICTOR_LEGAL_TOKEN_ID = 'cap-victor-legal';

export const EMAIL_THREAD_EVIDENCE: readonly EvidenceItem[] = [{ type: 'email_thread', reference: 'thread:HMP-14665' }];

export interface DatasysEnforcementWorld {
  readonly trustDomainId: string;
  readonly trustDomain: TrustDomain;
  readonly datasys: Actor;
  readonly victor: Actor;
  readonly pmfreak: Actor;
  readonly pmfreakPassport: Passport;
  readonly victorPassport: Passport;
  readonly pmfreakDraftingToken: RecognitionCapabilityToken;
  readonly pmfreakInvoiceToken: RecognitionCapabilityToken;
  readonly pmfreakCommunicationToken: RecognitionCapabilityToken;
  readonly pmfreakPaymentToken: RecognitionCapabilityToken;
  readonly victorFinancialToken: RecognitionCapabilityToken;
  readonly victorLegalToken: RecognitionCapabilityToken;
  readonly trustedPartnerPassport: Passport;
  readonly trustedPartnerToken: RecognitionCapabilityToken;
}

export interface DatasysEnforcementFixture {
  readonly recognitionCtx: RuntimeContext;
  readonly authorityRuntime: AuthorityGraphRuntime;
  readonly approvalRuntime: ApprovalRuntime;
  readonly handshakeRuntime: ExternalAgentHandshakeRuntime;
  readonly recognitionRuntime: AocRecognitionRuntime;
  readonly world: DatasysEnforcementWorld;
  readonly enforcementRuntime: ActionEnforcementRuntime;
  readonly aocGuard: AocGuard;
}

/**
 * Bridges a fully-composed Recognition Runtime (itself wired to Authority
 * Graph, Approval Runtime and External Agent Handshake) onto Action
 * Enforcement's structural `EnforcementRecognitionIntegration`. Reads
 * `passportId`/`capabilityTokenId`/`evidence` off the enforcement request's
 * free-form `metadata` bag, since `RecognitionVerificationInput` deliberately
 * does not carry Recognition Runtime's own primitive IDs.
 */
export function bridgeRecognitionRuntime(recognitionRuntime: AocRecognitionRuntime): EnforcementRecognitionIntegration {
  return {
    verifyAction(input: RecognitionVerificationInput): RecognitionVerificationResult {
      const metadata = input.metadata ?? {};
      const passportId = typeof metadata.passportId === 'string' ? metadata.passportId : undefined;
      const capabilityTokenId = typeof metadata.capabilityTokenId === 'string' ? metadata.capabilityTokenId : undefined;
      const evidence = Array.isArray(metadata.evidence) ? (metadata.evidence as readonly EvidenceItem[]) : undefined;

      const request = recognitionRuntime.buildActionRequest({
        actorId: input.actorId,
        trustDomainId: input.trustDomainId,
        action: input.action,
        resource: input.resourceScope,
        ...(input.actionRequestId !== undefined ? { id: input.actionRequestId } : {}),
        ...(input.principalActorId !== undefined ? { principalActorId: input.principalActorId } : {}),
        ...(passportId !== undefined ? { passportId } : {}),
        ...(capabilityTokenId !== undefined ? { capabilityTokenId } : {}),
        ...(evidence !== undefined ? { evidence } : {}),
        ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
        ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
        ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
      });
      const decision = recognitionRuntime.submitActionRequest(request);

      return {
        id: decision.id,
        type: decision.type,
        allowed: decision.type === 'allow',
        recognized: decision.recognized,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        actionRequestId: request.id,
        ...(decision.authorityDecisionId !== undefined ? { authorityDecisionId: decision.authorityDecisionId } : {}),
        ...(decision.authorityProofId !== undefined ? { authorityProofId: decision.authorityProofId } : {}),
        ...(decision.approvalRequestId !== undefined ? { approvalRequestId: decision.approvalRequestId } : {}),
        ...(decision.approvalDecisionId !== undefined ? { approvalDecisionId: decision.approvalDecisionId } : {}),
        ...(decision.approvalProofId !== undefined ? { approvalProofId: decision.approvalProofId } : {}),
      };
    },
  };
}

/**
 * Builds the full "Datasys Agent Republic" world across all four upstream
 * Soberanía runtimes, then composes Action Enforcement on top through the
 * structural Recognition Runtime bridge. This is the shared fixture every
 * other action-enforcement fixture and integration/demo test builds on.
 */
export function buildDatasysEnforcementFixture(): DatasysEnforcementFixture {
  const recognitionCtx: RuntimeContext = { clock: createManualClock(NOW), idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(NOW), { authorityGraph: authorityRuntime });
  const handshakeRuntime = new ExternalAgentHandshakeRuntime(createHandshakeRuntimeContext(NOW));
  buildDatasysHandshakeWorld(handshakeRuntime);
  const externalAgentHandshake = createExternalAgentStandingIntegration(handshakeRuntime);

  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime, externalAgentHandshake);

  const datasys = recognitionRuntime.registerActor({ id: DATASYS_ACTOR_ID, type: 'organization', displayName: 'Datasys' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: TRUST_DOMAIN_ID,
    name: 'Datasys Agent Republic',
    issuerActorId: datasys.id,
    acceptedIssuerIds: [datasys.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });
  const victor = recognitionRuntime.registerActor({ id: VICTOR_ACTOR_ID, type: 'human', displayName: 'Victor Valverde', issuerId: datasys.id, trustDomainId: trustDomain.id });
  const pmfreak = recognitionRuntime.registerActor({ id: PMFREAK_ACTOR_ID, type: 'agent', displayName: 'PMFreak Closure Agent', issuerId: datasys.id, trustDomainId: trustDomain.id });
  recognitionRuntime.registerActor({ id: UNKNOWN_AGENT_ACTOR_ID, type: 'external', displayName: 'Unknown External Agent', status: 'unknown' });
  const trustedPartner = recognitionRuntime.registerActor({
    id: TRUSTED_PARTNER_AGENT_ID,
    type: 'external',
    displayName: 'Trusted Partner Research Agent',
    issuerId: datasys.id,
    trustDomainId: trustDomain.id,
  });

  const victorPassport = recognitionRuntime.issuePassport({ id: 'passport-victor', type: 'human_passport', subjectActorId: victor.id, issuerActorId: datasys.id, trustDomainId: trustDomain.id });
  const pmfreakPassport = recognitionRuntime.issuePassport({ id: 'passport-pmfreak', type: 'agent_passport', subjectActorId: pmfreak.id, issuerActorId: datasys.id, trustDomainId: trustDomain.id });
  const trustedPartnerPassport = recognitionRuntime.issuePassport({
    id: 'passport-trusted-partner',
    type: 'agent_passport',
    subjectActorId: trustedPartner.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
  });

  const pmfreakDraftingToken = recognitionRuntime.issueCapabilityToken({
    id: PMFREAK_DRAFTING_TOKEN_ID,
    subjectActorId: pmfreak.id,
    principalActorId: victor.id,
    issuerActorId: victor.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.drafting',
    actions: [DRAFT_CLOSURE_EMAIL, SUMMARIZE_PROJECT_STATUS],
    resourceScopes: [PROJECT_SCOPE],
    evidenceRequirements: [{ action: DRAFT_CLOSURE_EMAIL, requiredEvidenceTypes: ['email_thread'] }],
    riskLevel: 'medium',
  });

  const pmfreakInvoiceToken = recognitionRuntime.issueCapabilityToken({
    id: PMFREAK_INVOICE_TOKEN_ID,
    subjectActorId: pmfreak.id,
    principalActorId: victor.id,
    issuerActorId: victor.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.invoice_support',
    actions: [PREPARE_INVOICE_SUPPORT],
    resourceScopes: [PROJECT_SCOPE],
    evidenceRequirements: [{ action: PREPARE_INVOICE_SUPPORT, requiredEvidenceTypes: ['invoice_backup'] }],
    riskLevel: 'medium',
  });

  const pmfreakCommunicationToken = recognitionRuntime.issueCapabilityToken({
    id: PMFREAK_COMMUNICATION_TOKEN_ID,
    subjectActorId: pmfreak.id,
    principalActorId: victor.id,
    issuerActorId: victor.id,
    trustDomainId: trustDomain.id,
    capability: 'project_closure.client_communication',
    actions: [SEND_CLIENT_FOLLOW_UP],
    resourceScopes: [PROJECT_SCOPE],
    approvalRequirement: { actions: [SEND_CLIENT_FOLLOW_UP], requiredApproverActorIds: [victor.id] },
    riskLevel: 'high',
  });

  const pmfreakPaymentToken = recognitionRuntime.issueCapabilityToken({
    id: PMFREAK_PAYMENT_TOKEN_ID,
    subjectActorId: pmfreak.id,
    principalActorId: victor.id,
    issuerActorId: victor.id,
    trustDomainId: trustDomain.id,
    capability: 'payments.approval',
    actions: [APPROVE_PAYMENT],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'critical',
  });

  const victorFinancialToken = recognitionRuntime.issueCapabilityToken({
    id: VICTOR_FINANCIAL_TOKEN_ID,
    subjectActorId: victor.id,
    principalActorId: victor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'finance.bank_details',
    actions: [CHANGE_BANK_ACCOUNT],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'critical',
  });

  const victorLegalToken = recognitionRuntime.issueCapabilityToken({
    id: VICTOR_LEGAL_TOKEN_ID,
    subjectActorId: victor.id,
    principalActorId: victor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: 'legal.contracts',
    actions: [SIGN_CONTRACT],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'critical',
  });

  const trustedPartnerToken = recognitionRuntime.issueCapabilityToken({
    id: 'cap-trusted-partner-read',
    subjectActorId: trustedPartner.id,
    principalActorId: trustedPartner.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    capability: READ_PROJECT_SUMMARY,
    actions: [READ_PROJECT_SUMMARY],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'low',
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, datasys.id);
  const victorGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-victor-project-closure',
    issuerActorId: datasys.id,
    subjectActorId: victor.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-project-manager',
    capability: 'project_closure.management',
    actions: [DRAFT_CLOSURE_EMAIL, SUMMARIZE_PROJECT_STATUS, PREPARE_INVOICE_SUPPORT, SEND_CLIENT_FOLLOW_UP, APPROVE_PAYMENT],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
  });
  authorityRuntime.createDelegationGrant({
    id: 'delegation-grant-pmfreak-project-closure',
    delegatorActorId: victor.id,
    delegateActorId: pmfreak.id,
    delegateActorType: 'agent',
    trustDomainId: trustDomain.id,
    sourceAuthorityGrantId: victorGrant.id,
    capability: 'project_closure.drafting',
    actions: [DRAFT_CLOSURE_EMAIL, SUMMARIZE_PROJECT_STATUS, PREPARE_INVOICE_SUPPORT, SEND_CLIENT_FOLLOW_UP, APPROVE_PAYMENT],
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  approvalRuntime.registerApproverRecognitionStatus(victor.id, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(pmfreak.id, 'agent');

  const enforcementCtx = createEnforcementRuntimeContext(NOW);
  const recognitionIntegration = bridgeRecognitionRuntime(recognitionRuntime);
  const enforcementRuntime = createActionEnforcementRuntime(enforcementCtx, recognitionIntegration);
  const aocGuard = createAocGuard(enforcementRuntime);

  const world: DatasysEnforcementWorld = {
    trustDomainId: trustDomain.id,
    trustDomain,
    datasys,
    victor,
    pmfreak,
    pmfreakPassport,
    victorPassport,
    pmfreakDraftingToken,
    pmfreakInvoiceToken,
    pmfreakCommunicationToken,
    pmfreakPaymentToken,
    victorFinancialToken,
    victorLegalToken,
    trustedPartnerPassport,
    trustedPartnerToken,
  };

  return { recognitionCtx, authorityRuntime, approvalRuntime, handshakeRuntime, recognitionRuntime, world, enforcementRuntime, aocGuard };
}

/** Runs (and accepts) the Trusted Partner Research Agent's handshake so its visa/ingress grant are active. */
export function acceptTrustedPartnerHandshake(fixture: DatasysEnforcementFixture) {
  const request = submitTrustedPartnerHandshakeRequest(fixture.handshakeRuntime);
  return fixture.handshakeRuntime.decideHandshake(request.id);
}

export { HANDSHAKE_UNKNOWN_AGENT_ID, TRUSTED_PARTNER_ISSUER_ID };
