import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { approveSendClientFollowUp, buildSendClientFollowUpGuardInput } from '../../../features/action-enforcement/fixtures/approval-required-action.fixture.js';
import { PMFREAK_ACTOR_ID, PROJECT_SCOPE, VICTOR_ACTOR_ID } from '../../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { AOC_KERNEL_REASON_CODES } from '../../reason-codes/reason-codes.js';
import { buildKernelParityWorld, toKernelRequest } from './support.js';

const ACTION_REQUEST_ID = 'action-request-approval-characterization';

describe('Kernel characterization: approval required', () => {
  it('action requires human approval, none yet granted -> approval_required, executor never invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const input = buildSendClientFollowUpGuardInput();

    const legacyDecision = fixture.aocGuard.preflight(input);
    assert.equal(legacyDecision.type, 'approval_required');

    const kernelResult = await kernel.evaluate(toKernelRequest(input));
    assert.equal(kernelResult.status, 'approval_required');
    assert.equal(kernelResult.approval.status, 'pending');
    assert.ok(kernelResult.reasonCodes.includes(AOC_KERNEL_REASON_CODES.APPROVAL_REQUIRED) || kernelResult.reasonCodes.includes(AOC_KERNEL_REASON_CODES.APPROVAL_PENDING));
  });

  it('approval granted -> allowed, executor invoked exactly once', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const input = buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID });

    const pending = fixture.aocGuard.preflight(input);
    assert.equal(pending.type, 'approval_required');
    const approvalProofId = approveSendClientFollowUp(fixture, pending.recognitionDecisionId!, ACTION_REQUEST_ID);

    const approvedInput = buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId });
    const legacyDecision = fixture.aocGuard.preflight(approvedInput);
    assert.equal(legacyDecision.type, 'execute_allowed');

    let executed = false;
    const kernelOutcome = await kernel.enforce(toKernelRequest(approvedInput), () => {
      executed = true;
      return 'sent';
    });
    assert.equal(kernelOutcome.status, 'allowed');
    assert.equal(kernelOutcome.approval.status, 'granted');
    assert.equal(kernelOutcome.execution.executed, true);
    assert.equal(kernelOutcome.execution.value, 'sent');
    assert.equal(executed, true);
  });

  it('approval rejected (revoked after grant) -> not allowed, executor never invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const input = buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID });
    const pending = fixture.aocGuard.preflight(input);
    const approvalProofId = approveSendClientFollowUp(fixture, pending.recognitionDecisionId!, ACTION_REQUEST_ID);
    fixture.approvalRuntime.revokeApproval({ approvalProofId, revokedByActorId: 'actor-datasys', reason: 'Compliance hold.' });

    const revokedInput = buildSendClientFollowUpGuardInput({ actionRequestId: ACTION_REQUEST_ID, approvalProofId });
    const legacyDecision = fixture.aocGuard.preflight(revokedInput);
    assert.notEqual(legacyDecision.type, 'execute_allowed');

    let executed = false;
    const kernelOutcome = await kernel.enforce(toKernelRequest(revokedInput), () => {
      executed = true;
      return 'sent';
    });
    assert.notEqual(kernelOutcome.status, 'allowed');
    assert.equal(executed, false);
  });
});

describe('Kernel characterization: evidence failure', () => {
  it('mandatory evidence missing -> evidence pending (approval_required status), executor never invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const input = {
      actorId: PMFREAK_ACTOR_ID,
      principalActorId: VICTOR_ACTOR_ID,
      trustDomainId: fixture.world.trustDomainId,
      action: 'prepare_invoice_support',
      resourceScope: PROJECT_SCOPE,
      capability: 'project_closure.invoice_support',
      sideEffectType: 'write' as const,
      metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-invoice-support' },
    };

    const legacyDecision = fixture.aocGuard.preflight(input);
    assert.equal(legacyDecision.type, 'evidence_required');

    let executed = false;
    const kernelOutcome = await kernel.enforce(toKernelRequest(input), () => {
      executed = true;
      return 'unused';
    });
    assert.equal(kernelOutcome.status, 'approval_required');
    assert.ok(kernelOutcome.reasonCodes.includes(AOC_KERNEL_REASON_CODES.EVIDENCE_REQUIRED));
    assert.equal(kernelOutcome.execution.executed, false);
    assert.equal(executed, false);
  });

  it('required evidence present -> allowed, executor invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const input = {
      actorId: PMFREAK_ACTOR_ID,
      principalActorId: VICTOR_ACTOR_ID,
      trustDomainId: fixture.world.trustDomainId,
      action: 'prepare_invoice_support',
      resourceScope: PROJECT_SCOPE,
      capability: 'project_closure.invoice_support',
      sideEffectType: 'write' as const,
      metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-invoice-support', evidence: [{ type: 'invoice_backup', reference: 'invoice:HMP-14665' }] },
    };

    const legacyDecision = fixture.aocGuard.preflight(input);
    assert.equal(legacyDecision.type, 'execute_allowed');

    const kernelOutcome = await kernel.evaluate(toKernelRequest(input));
    assert.equal(kernelOutcome.status, 'allowed');
    assert.equal(kernelOutcome.evidence.length, 1);
    assert.equal(kernelOutcome.evidence[0]?.passed, true);
  });
});
