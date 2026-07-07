import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../fixtures/allowed-action.fixture.js';
import { approveSendClientFollowUp, buildSendClientFollowUpGuardInput } from '../fixtures/approval-required-action.fixture.js';
import { buildDatasysEnforcementFixture, PMFREAK_ACTOR_ID, PROJECT_SCOPE, TRUST_DOMAIN_ID, VICTOR_ACTOR_ID } from '../fixtures/datasys-enforcement.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../fixtures/denied-action.fixture.js';
import { completeTrustedPartnerHandshake, buildTrustedPartnerReadGuardInput } from '../fixtures/external-agent-action.fixture.js';
import { buildApprovePaymentGuardInput, paymentsAdapter } from '../fixtures/side-effect-action.fixture.js';

describe('Action Enforcement demo scenarios', () => {
  it('1. PMFreak Closure Agent drafts the closure email: allowed, executed once, proof created', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let count = 0;
    const outcome = await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => {
      count += 1;
      return 'draft saved';
    });
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(count, 1);
    assert.equal(outcome.result.status, 'executed');
    assert.equal(outcome.result.value, 'draft saved');
    assert.ok(outcome.proof);
  });

  it('2. PMFreak Closure Agent tries send_client_follow_up without approval: approval_required, no execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput(), () => ((ran = true), 'sent'));
    assert.equal(outcome.decision.type, 'approval_required');
    assert.equal(ran, false);
  });

  it('3. PMFreak Closure Agent tries prepare_invoice_support without required evidence: evidence_required, no execution', async () => {
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
      () => ((ran = true), 'invoice support prepared'),
    );
    assert.equal(outcome.decision.type, 'evidence_required');
    assert.equal(ran, false);
  });

  it('4. Unknown External Agent tries read_project_summary without a handshake: blocked, no execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildUnknownAgentReadGuardInput(), () => ((ran = true), 'summary'));
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('5. Trusted Partner Research Agent has a valid visa/ingress and reads the project summary: allowed, executed once', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    let count = 0;
    const outcome = await fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => {
      count += 1;
      return 'summary';
    });
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(count, 1);
  });

  it('6. Trusted Partner Research Agent has an expired visa: blocked, no execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const handshake = completeTrustedPartnerHandshake(fixture);
    if (handshake.visa) {
      fixture.handshakeRuntime.expireAgentVisa(handshake.visa.id);
    }
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildTrustedPartnerReadGuardInput(handshake), () => ((ran = true), 'summary'));
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('7. duplicate idempotency key on send_client_follow_up: first runs, second is duplicate_suppressed', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const actionRequestId = 'action-request-demo-idempotency';
    const pending = await fixture.aocGuard.enforce(buildSendClientFollowUpGuardInput({ actionRequestId }), () => 'unused');
    const approvalProofId = approveSendClientFollowUp(fixture, pending.decision.recognitionDecisionId!, actionRequestId);

    let count = 0;
    const first = await fixture.aocGuard.enforce(
      buildSendClientFollowUpGuardInput({ actionRequestId, approvalProofId, idempotencyKey: 'idempotency-key-demo-follow-up' }),
      () => {
        count += 1;
        return 'sent';
      },
    );
    assert.equal(first.decision.type, 'execute_allowed');
    assert.equal(count, 1);

    const second = await fixture.aocGuard.enforce(
      buildSendClientFollowUpGuardInput({ actionRequestId, approvalProofId, idempotencyKey: 'idempotency-key-demo-follow-up' }),
      () => {
        count += 1;
        return 'sent-again';
      },
    );
    assert.equal(second.decision.type, 'duplicate_suppressed');
    assert.equal(count, 1);
  });

  it('8. dry-run allowed action: dry_run_allowed, no execution, side effect not executed', async () => {
    const fixture = buildDatasysEnforcementFixture();
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput({ mode: 'dry_run' }), () => ((ran = true), 'draft saved'));
    assert.equal(outcome.decision.type, 'dry_run_allowed');
    assert.equal(ran, false);
    assert.notEqual(outcome.request.sideEffects[0]?.status, 'executed');
  });

  it('9. adapter denies approve_payment: adapter_denied, no execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    fixture.enforcementRuntime.registerAdapter(paymentsAdapter);
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildApprovePaymentGuardInput(), () => ((ran = true), 'approved'));
    assert.equal(outcome.decision.type, 'adapter_denied');
    assert.equal(ran, false);
  });

  it('10. emergency deny enabled: emergency_denied, no execution', async () => {
    const fixture = buildDatasysEnforcementFixture();
    fixture.enforcementRuntime.setEmergencyDeny(true);
    let ran = false;
    const outcome = await fixture.aocGuard.enforce(buildDraftClosureEmailGuardInput(), () => ((ran = true), 'draft saved'));
    assert.equal(outcome.decision.type, 'emergency_denied');
    assert.equal(ran, false);
  });
});
