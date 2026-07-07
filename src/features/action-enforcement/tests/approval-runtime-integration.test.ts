import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ApprovalRuntime } from '../../approval-runtime/runtime/approval-runtime.js';
import { createApprovalRuntimeContext, createManualApprovalClock, createSequentialApprovalIdGenerator, type ApprovalRuntimeContext } from '../../approval-runtime/runtime/approval-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import { approveSendClientFollowUp, buildSendClientFollowUpGuardInput } from '../fixtures/approval-required-action.fixture.js';
import { bridgeRecognitionRuntime, buildDatasysEnforcementFixture, PROJECT_SCOPE, SEND_CLIENT_FOLLOW_UP, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/datasys-enforcement.fixture.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../sdk/aoc-guard.js';

const NOW = '2026-01-01T00:00:00.000Z';
const ACTION_REQUEST_ID = 'action-request-approval-integration-demo';

describe('Approval Runtime integration', () => {
  it('1. Recognition with a valid approval allows enforcement execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const pendingOutcome = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => 'unused');
    assert.equal(pendingOutcome.decision.type, 'approval_required');
    assert.ok(pendingOutcome.decision.recognitionDecisionId);

    const approvalProofId = approveSendClientFollowUp(fixture, pendingOutcome.decision.recognitionDecisionId!, ACTION_REQUEST_ID);

    let ran = false;
    const finalOutcome = await fixture.aocGuard.enforce(
      buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId }),
      () => ((ran = true), 'sent'),
    );
    assert.equal(finalOutcome.decision.type, 'execute_allowed');
    assert.equal(ran, true);
  });

  it('2. Recognition requiring approval blocks enforcement', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput(), () => ((ran = true), 'sent'));
    assert.equal(outcome.decision.type, 'approval_required');
    assert.equal(ran, false);
  });

  it('3. Recognition with a revoked approval blocks enforcement', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const pendingOutcome = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => 'unused');
    const approvalProofId = approveSendClientFollowUp(fixture, pendingOutcome.decision.recognitionDecisionId!, ACTION_REQUEST_ID);

    fixture.approvalRuntime.revokeApproval({ approvalProofId, revokedByActorId: 'actor-datasys', reason: 'Compliance hold.' });

    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
      buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId }),
      () => ((ran = true), 'sent'),
    );
    assert.notEqual(outcome.decision.type, 'execute_allowed');
    assert.equal(ran, false);
  });

  it('4. Recognition with an expired approval blocks enforcement', async () => {
    const recognitionCtx: RuntimeContext = { clock: createManualClock(NOW), idGenerator: createSequentialIdGenerator() };
    const approvalClock = createManualApprovalClock(NOW);
    const approvalCtx: ApprovalRuntimeContext = { clock: approvalClock, ids: createSequentialApprovalIdGenerator() };
    const approvalRuntime = new ApprovalRuntime(approvalCtx);
    const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, undefined, approvalRuntime);

    recognitionRuntime.registerActor({ id: 'actor-datasys', type: 'organization', displayName: 'Datasys' });
    recognitionRuntime.createTrustDomain({ id: TRUST_DOMAIN_ID, name: 'Datasys Agent Republic', issuerActorId: 'actor-datasys', acceptedIssuerIds: ['actor-datasys'], acceptedActorTypes: ['human', 'agent'] });
    recognitionRuntime.registerActor({ id: VICTOR_ACTOR_ID, type: 'human', displayName: 'Victor Valverde', issuerId: 'actor-datasys', trustDomainId: TRUST_DOMAIN_ID });
    recognitionRuntime.registerActor({ id: 'actor-pmfreak-closure-agent', type: 'agent', displayName: 'PMFreak Closure Agent', issuerId: 'actor-datasys', trustDomainId: TRUST_DOMAIN_ID });
    recognitionRuntime.issuePassport({ id: 'passport-pmfreak', type: 'agent_passport', subjectActorId: 'actor-pmfreak-closure-agent', issuerActorId: 'actor-datasys', trustDomainId: TRUST_DOMAIN_ID });
    recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-communication',
      subjectActorId: 'actor-pmfreak-closure-agent',
      principalActorId: VICTOR_ACTOR_ID,
      issuerActorId: VICTOR_ACTOR_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      capability: 'project_closure.client_communication',
      actions: [SEND_CLIENT_FOLLOW_UP],
      resourceScopes: [PROJECT_SCOPE],
      approvalRequirement: { actions: [SEND_CLIENT_FOLLOW_UP], requiredApproverActorIds: [VICTOR_ACTOR_ID] },
      riskLevel: 'high',
    });
    approvalRuntime.registerApproverRecognitionStatus(VICTOR_ACTOR_ID, 'recognized');

    const enforcementRuntime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), bridgeRecognitionRuntime(recognitionRuntime));
    const aocGuard = createAocGuard(enforcementRuntime);

    const pending = await aocGuard.enforce(
      {
        actorId: 'actor-pmfreak-closure-agent',
        principalActorId: VICTOR_ACTOR_ID,
        trustDomainId: TRUST_DOMAIN_ID,
        action: SEND_CLIENT_FOLLOW_UP,
        resourceScope: PROJECT_SCOPE,
        actionRequestId: ACTION_REQUEST_ID,
        sideEffectType: 'send_message',
        metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-communication' },
      },
      () => 'unused',
    );
    assert.equal(pending.decision.type, 'approval_required');

    const requirement = approvalRuntime.createApprovalRequirement({
      id: 'approval-requirement-expiring',
      type: 'single_approval',
      trustDomainId: TRUST_DOMAIN_ID,
      action: SEND_CLIENT_FOLLOW_UP,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requiredApproverActorIds: [VICTOR_ACTOR_ID],
      minimumApprovals: 1,
      requiresSegregationOfDuties: false,
      evidenceRequirements: [],
      expiresInMinutes: 1,
    });
    const request = approvalRuntime.createApprovalRequest({
      trustDomainId: TRUST_DOMAIN_ID,
      actionRequestId: ACTION_REQUEST_ID,
      requestedByActorId: 'actor-pmfreak-closure-agent',
      targetActorId: 'actor-pmfreak-closure-agent',
      principalActorId: VICTOR_ACTOR_ID,
      action: SEND_CLIENT_FOLLOW_UP,
      resourceScope: PROJECT_SCOPE,
      riskLevel: 'high',
      requirement,
      evidence: [],
    });
    approvalClock.advance(2 * 60_000);
    const approvalResult = approvalRuntime.approve({ approvalRequestId: request.id, approverActorId: VICTOR_ACTOR_ID, evidenceReviewed: [] });
    assert.equal(approvalResult.decision.type, 'expired');

    let ran = false;
    const finalOutcome = await aocGuard.enforce(
      {
        actorId: 'actor-pmfreak-closure-agent',
        principalActorId: VICTOR_ACTOR_ID,
        trustDomainId: TRUST_DOMAIN_ID,
        action: SEND_CLIENT_FOLLOW_UP,
        resourceScope: PROJECT_SCOPE,
        actionRequestId: ACTION_REQUEST_ID,
        sideEffectType: 'send_message',
        metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-communication' },
      },
      () => ((ran = true), 'sent'),
    );
    assert.notEqual(finalOutcome.decision.type, 'execute_allowed');
    assert.equal(ran, false);
  });

  it('5. approvalProofId is included in the EnforcementProof when available', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const pendingOutcome = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID }), () => 'unused');
    const approvalProofId = approveSendClientFollowUp(fixture, pendingOutcome.decision.recognitionDecisionId!, ACTION_REQUEST_ID);

    const finalOutcome = await fixture.aocGuard.enforce(
      buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId }),
      () => 'sent',
    );
    assert.equal(finalOutcome.proof?.approvalProofId, approvalProofId);
  });
});
