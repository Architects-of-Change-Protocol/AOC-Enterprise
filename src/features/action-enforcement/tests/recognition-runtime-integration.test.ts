import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../fixtures/allowed-action.fixture.js';
import { buildDatasysEnforcementFixture, DRAFT_CLOSURE_EMAIL, EMAIL_THREAD_EVIDENCE, PMFREAK_ACTOR_ID, PMFREAK_DRAFTING_TOKEN_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/datasys-enforcement.fixture.js';
import { buildSendClientFollowUpGuardInput } from '../fixtures/approval-required-action.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../fixtures/denied-action.fixture.js';

const OTHER_PROJECT_SCOPE = 'project:GCH-15992';

describe('Recognition Runtime integration', () => {
  it('1. enforcement calls Recognition Runtime before execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let recognitionCalled = false;
    const originalVerify = fixture.recognitionRuntime.submitActionRequest.bind(fixture.recognitionRuntime);
    fixture.recognitionRuntime.submitActionRequest = (request) => {
      recognitionCalled = true;
      return originalVerify(request);
    };
    let executed = false;
    await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => {
      executed = true;
      return 'ok';
    });
    assert.equal(recognitionCalled, true);
    assert.equal(executed, true);
  });

  it('2. Recognition allow permits execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(ran, true);
  });

  it('3. Recognition require_human_approval blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'approval_required');
    assert.equal(ran, false);
  });

  it('4. Recognition require_more_evidence blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
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
      () => ((ran = true), 'ok'),
    );
    assert.equal(outcome.decision.type, 'evidence_required');
    assert.equal(ran, false);
  });

  it('5. Recognition unrecognized_actor blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildUnknownAgentReadGuardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'execution_blocked');
    assert.equal(ran, false);
  });

  it('6. Recognition revoked blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    fixture.recognitionRuntime.revokeCapabilityToken(PMFREAK_DRAFTING_TOKEN_ID, TRUST_DOMAIN_ID);
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'execution_blocked');
    assert.equal(ran, false);
  });

  it('7. Recognition expired blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    fixture.recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-drafting-expired',
      subjectActorId: PMFREAK_ACTOR_ID,
      principalActorId: VICTOR_ACTOR_ID,
      issuerActorId: VICTOR_ACTOR_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      capability: 'project_closure.drafting',
      actions: [DRAFT_CLOSURE_EMAIL],
      resourceScopes: [PROJECT_SCOPE],
      riskLevel: 'medium',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
      buildDraftClosureEmailGuardInput({ metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting-expired', evidence: EMAIL_THREAD_EVIDENCE } }),
      () => ((ran = true), 'ok'),
    );
    assert.equal(outcome.decision.type, 'expired');
    assert.equal(ran, false);
  });

  it('8. Recognition out_of_scope blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
      buildDraftClosureEmailGuardInput({ resourceScope: OTHER_PROJECT_SCOPE }),
      () => ((ran = true), 'ok'),
    );
    assert.equal(outcome.decision.type, 'execution_blocked');
    assert.equal(ran, false);
  });

  it('9. Recognition policy_violation blocks execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    // Forge a self-issued authority grant for a non-delegable action -- Authority Graph flags this as policy_violation.
    fixture.authorityRuntime.store.importGrant({
      id: 'authority-grant-forged-self-issued',
      issuerActorId: PMFREAK_ACTOR_ID,
      subjectActorId: PMFREAK_ACTOR_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      capability: 'payments.approval',
      actions: ['approve_payment'],
      resourceScopes: [PROJECT_SCOPE],
      canDelegate: false,
      status: 'active',
      issuedAt: '2026-01-01T00:00:00.000Z',
    });
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(
      {
        actorId: PMFREAK_ACTOR_ID,
        trustDomainId: TRUST_DOMAIN_ID,
        action: 'approve_payment',
        resourceScope: PROJECT_SCOPE,
        capability: 'payments.approval',
        sideEffectType: 'financial',
        adapterId: 'unregistered-adapter-does-not-exist',
        metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-payment' },
      },
      () => ((ran = true), 'ok'),
    );
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('10. existing Recognition Runtime behavior remains unchanged when called directly', () => {
    const fixture = buildDatasysEnforcementFixture();
    const decision = fixture.recognitionRuntime.submitActionRequest(
      fixture.recognitionRuntime.buildActionRequest({
        actorId: PMFREAK_ACTOR_ID,
        passportId: 'passport-pmfreak',
        capabilityTokenId: PMFREAK_DRAFTING_TOKEN_ID,
        principalActorId: VICTOR_ACTOR_ID,
        trustDomainId: TRUST_DOMAIN_ID,
        action: DRAFT_CLOSURE_EMAIL,
        resource: PROJECT_SCOPE,
        evidence: EMAIL_THREAD_EVIDENCE,
      }),
    );
    assert.equal(decision.type, 'allow');
  });
});
