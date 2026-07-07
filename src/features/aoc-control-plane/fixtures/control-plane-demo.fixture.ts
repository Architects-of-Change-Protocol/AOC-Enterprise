import type { AuthorityDecision } from '../../authority-graph/domain/authority-decision.js';
import type { AuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import type { ApprovalRuntime } from '../../approval-runtime/runtime/approval-runtime.js';
import type { ExternalAgentHandshakeRuntime } from '../../external-agent-handshake/runtime/external-agent-handshake-runtime.js';
import type { HandshakeDecisionResult } from '../../external-agent-handshake/services/handshake-decision-service.js';
import type { AocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import type { ActionEnforcementRuntime } from '../../action-enforcement/runtime/action-enforcement-runtime.js';
import type { EnforcementOutcome } from '../../action-enforcement/domain/enforcement-outcome.js';
import type { AocGuard } from '../../action-enforcement/sdk/aoc-guard.js';
import {
  buildDatasysEnforcementFixture,
  DRAFT_CLOSURE_EMAIL,
  PMFREAK_ACTOR_ID,
  PROJECT_SCOPE,
  SEND_CLIENT_FOLLOW_UP,
  SIGN_CONTRACT,
  TRUST_DOMAIN_ID,
  TRUSTED_PARTNER_AGENT_ID,
  UNKNOWN_AGENT_ACTOR_ID,
  VICTOR_ACTOR_ID,
  VICTOR_LEGAL_TOKEN_ID,
  type DatasysEnforcementFixture,
} from '../../action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { buildDraftClosureEmailGuardInput } from '../../action-enforcement/fixtures/allowed-action.fixture.js';
import { approveSendClientFollowUp, buildSendClientFollowUpGuardInput } from '../../action-enforcement/fixtures/approval-required-action.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../../action-enforcement/fixtures/denied-action.fixture.js';
import { completeTrustedPartnerHandshake, buildTrustedPartnerReadGuardInput } from '../../action-enforcement/fixtures/external-agent-action.fixture.js';
import { buildApprovePaymentGuardInput, paymentsAdapter } from '../../action-enforcement/fixtures/side-effect-action.fixture.js';

/**
 * Deterministic demo state for the AOC Control Plane. Everything here is
 * produced by calling the real runtime facades of the five governance
 * modules -- Recognition, Authority Graph, Approval, External Agent
 * Handshake and Action Enforcement -- through their own public methods and
 * fixture builders. Nothing here fabricates a decision, proof or event: the
 * Control Plane read models are projections over exactly what these
 * runtimes returned.
 */
export interface ControlPlaneRuntimeBundle {
  readonly trustDomainId: string;
  readonly recognitionRuntime: AocRecognitionRuntime;
  readonly authorityRuntime: AuthorityGraphRuntime;
  readonly approvalRuntime: ApprovalRuntime;
  readonly handshakeRuntime: ExternalAgentHandshakeRuntime;
  readonly enforcementRuntime: ActionEnforcementRuntime;
  readonly aocGuard: AocGuard;
  readonly world: DatasysEnforcementFixture['world'];
  /**
   * Recognition Runtime exposes single-id getters (getActor/getPassport/
   * getCapabilityToken) but no "list all" query, so the Control Plane must
   * know which ids exist from the fixture that created them -- exactly the
   * "derive minimal read-model rows from fixture outputs" case.
   */
  readonly knownActorIds: readonly string[];
  readonly knownPassportIds: readonly string[];
  readonly knownCapabilityTokenIds: readonly string[];
  /** Authority decisions produced by directly exercising Authority Graph's verifyAuthority for a couple of representative actions. */
  readonly authorityDecisions: readonly AuthorityDecision[];
  readonly trustedPartnerHandshake: HandshakeDecisionResult;
  readonly enforcementOutcomes: {
        readonly draftClosureEmail: EnforcementOutcome<string>;
        readonly sendClientFollowUpPending: EnforcementOutcome<string>;
        readonly sendClientFollowUpApproved: EnforcementOutcome<string>;
        readonly sendClientFollowUpDuplicate: EnforcementOutcome<string>;
        readonly invoiceSupportMissingEvidence: EnforcementOutcome<string>;
        readonly unknownAgentRead: EnforcementOutcome<string>;
        readonly trustedPartnerRead: EnforcementOutcome<string>;
        readonly approvePaymentAdapterDenied: EnforcementOutcome<string>;
        readonly draftClosureEmailDryRun: EnforcementOutcome<string>;
  };
}

/**
 * Builds the shared "Datasys Agent Republic" world across all five AOC
 * runtimes, then drives a representative set of real scenarios through them
 * so every Control Plane panel has genuine, varied state to display:
 * an allowed + executed action, a pending-then-approved approval (plus a
 * suppressed duplicate), an evidence-required denial, an unrecognized-actor
 * denial, a successful external-agent handshake + read, an adapter denial,
 * a dry run, and one revoked capability token.
 */
export async function buildControlPlaneDemoFixture(): Promise<ControlPlaneRuntimeBundle> {
  const fixture = buildDatasysEnforcementFixture();
  const { authorityRuntime, approvalRuntime, handshakeRuntime, enforcementRuntime, aocGuard, recognitionRuntime, world } = fixture;

  authorityRuntime.assignRole({
    id: 'role-assignment-victor-project-manager',
    actorId: VICTOR_ACTOR_ID,
    roleId: 'role-project-manager',
    assignedByActorId: world.datasys.id,
    trustDomainId: TRUST_DOMAIN_ID,
    resourceScopes: [PROJECT_SCOPE],
  });

  const authorityDecisions: AuthorityDecision[] = [];
  authorityDecisions.push(
    authorityRuntime.verifyAuthority(
      authorityRuntime.buildAuthorityChainRequest({
        actorId: PMFREAK_ACTOR_ID,
        principalActorId: VICTOR_ACTOR_ID,
        trustDomainId: TRUST_DOMAIN_ID,
        action: DRAFT_CLOSURE_EMAIL,
        resourceScope: PROJECT_SCOPE,
      }),
    ),
  );
  authorityDecisions.push(
    authorityRuntime.verifyAuthority(
      authorityRuntime.buildAuthorityChainRequest({
        actorId: PMFREAK_ACTOR_ID,
        principalActorId: VICTOR_ACTOR_ID,
        trustDomainId: TRUST_DOMAIN_ID,
        action: SIGN_CONTRACT,
        resourceScope: PROJECT_SCOPE,
      }),
    ),
  );

  const draftClosureEmail = await aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => 'draft saved');

  const pendingActionRequestId = 'action-request-control-plane-follow-up';
  const sendClientFollowUpPending = await aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: pendingActionRequestId }), () => 'unused');
  const approvalProofId = approveSendClientFollowUp(fixture, sendClientFollowUpPending.decision.recognitionDecisionId!, pendingActionRequestId);

  const followUpIdempotencyKey = 'idempotency-key-control-plane-follow-up';
  const sendClientFollowUpApproved = await aocGuard.enforce(
    buildSendClientFollowUpGuardInput({ actionRequestId: pendingActionRequestId, approvalProofId, idempotencyKey: followUpIdempotencyKey }),
    () => 'sent',
  );
  const sendClientFollowUpDuplicate = await aocGuard.enforce(
    buildSendClientFollowUpGuardInput({ actionRequestId: pendingActionRequestId, approvalProofId, idempotencyKey: followUpIdempotencyKey }),
    () => 'sent-again',
  );

  const invoiceSupportMissingEvidence = await aocGuard.enforce(
    {
      actorId: PMFREAK_ACTOR_ID,
      principalActorId: VICTOR_ACTOR_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      action: 'prepare_invoice_support',
      resourceScope: PROJECT_SCOPE,
      capability: 'project_closure.invoice_support',
      sideEffectType: 'write',
      metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-invoice-support' },
    },
    () => 'invoice support prepared',
  );

  const unknownAgentRead = await aocGuard.enforce(buildUnknownAgentReadGuardInput(), () => 'summary');

  const trustedPartnerHandshake = completeTrustedPartnerHandshake(fixture);
  const trustedPartnerRead = await aocGuard.enforce(buildTrustedPartnerReadGuardInput(trustedPartnerHandshake), () => 'summary');

  enforcementRuntime.registerAdapter(paymentsAdapter);
  const approvePaymentAdapterDenied = await aocGuard.enforce(buildApprovePaymentGuardInput(), () => 'approved');

  const draftClosureEmailDryRun = await aocGuard.enforce(
    buildDraftClosureEmailGuardInput({ mode: 'dry_run', actionRequestId: 'action-request-dry-run-demo' }),
    () => 'draft saved',
  );

  recognitionRuntime.revokeCapabilityToken(VICTOR_LEGAL_TOKEN_ID, TRUST_DOMAIN_ID);

  return {
    trustDomainId: world.trustDomainId,
    recognitionRuntime,
    authorityRuntime,
    approvalRuntime,
    handshakeRuntime,
    enforcementRuntime,
    aocGuard,
    world,
    knownActorIds: [world.datasys.id, world.victor.id, world.pmfreak.id, UNKNOWN_AGENT_ACTOR_ID, TRUSTED_PARTNER_AGENT_ID],
    knownPassportIds: [world.victorPassport.id, world.pmfreakPassport.id, world.trustedPartnerPassport.id],
    knownCapabilityTokenIds: [
      world.pmfreakDraftingToken.id,
      world.pmfreakInvoiceToken.id,
      world.pmfreakCommunicationToken.id,
      world.pmfreakPaymentToken.id,
      world.victorFinancialToken.id,
      world.victorLegalToken.id,
      world.trustedPartnerToken.id,
    ],
    authorityDecisions,
    trustedPartnerHandshake,
    enforcementOutcomes: {
      draftClosureEmail,
      sendClientFollowUpPending,
      sendClientFollowUpApproved,
      sendClientFollowUpDuplicate,
      invoiceSupportMissingEvidence,
      unknownAgentRead,
      trustedPartnerRead,
      approvePaymentAdapterDenied,
      draftClosureEmailDryRun,
    },
  };
}
