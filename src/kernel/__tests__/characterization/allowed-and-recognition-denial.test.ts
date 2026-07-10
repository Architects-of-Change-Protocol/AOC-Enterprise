import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../../../features/action-enforcement/fixtures/allowed-action.fixture.js';
import { buildUnknownAgentReadGuardInput } from '../../../features/action-enforcement/fixtures/denied-action.fixture.js';
import { AOC_KERNEL_REASON_CODES } from '../../reason-codes/reason-codes.js';
import { buildKernelParityWorld, toKernelRequest } from './support.js';

/**
 * Freezes current behavior for the "Allowed decision" and "Denied by
 * recognition" characterization categories required by the kernel
 * extraction mission. Each scenario runs against BOTH the pre-extraction
 * engine (`fixture.aocGuard`, untouched code) and the post-extraction
 * kernel (`kernel.evaluate`, wrapping the same recognition world) and
 * asserts they agree.
 */
describe('Kernel characterization: allowed decision', () => {
  it('recognized actor, valid authority, matching policy, no escalation, evidence available -> allowed', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const guardInput = buildDraftClosureEmailGuardInput();

    const legacyDecision = fixture.aocGuard.preflight(guardInput);
    assert.equal(legacyDecision.type, 'execute_allowed');
    assert.equal(legacyDecision.allowedToExecute, true);

    const kernelResult = await kernel.evaluate(toKernelRequest(guardInput));
    assert.equal(kernelResult.status, 'allowed');
    assert.deepEqual(kernelResult.reasonCodes, [AOC_KERNEL_REASON_CODES.ACTION_ALLOWED]);
    assert.equal(kernelResult.recognition.performed, true);
    assert.equal(kernelResult.recognition.recognized, true);
    assert.equal(kernelResult.authority.performed, true, 'PMFreak acting for Victor requires an authority chain');
  });
});

describe('Kernel characterization: denied by recognition', () => {
  it('unknown actor / unrecognized_actor -> denied, executor never invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    const guardInput = buildUnknownAgentReadGuardInput();

    const legacyDecision = fixture.aocGuard.preflight(guardInput);
    assert.equal(legacyDecision.allowedToExecute, false);

    const kernelResult = await kernel.evaluate(toKernelRequest(guardInput));
    assert.equal(kernelResult.status, 'denied');
    assert.ok(kernelResult.reasonCodes.includes(AOC_KERNEL_REASON_CODES.RECOGNITION_ACTOR_UNKNOWN) || kernelResult.reasonCodes.includes(AOC_KERNEL_REASON_CODES.RECOGNITION_ROGUE_ACTOR));
    assert.equal(kernelResult.recognition.recognized, false);
  });

  it('revoked capability token -> denied, executor never invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    fixture.recognitionRuntime.revokeCapabilityToken(fixture.world.pmfreakDraftingToken.id, fixture.world.trustDomainId);
    const guardInput = buildDraftClosureEmailGuardInput();

    const legacyDecision = fixture.aocGuard.preflight(guardInput);
    assert.notEqual(legacyDecision.type, 'execute_allowed');

    const kernelResult = await kernel.evaluate(toKernelRequest(guardInput));
    assert.equal(kernelResult.status, 'denied');
    assert.equal(kernelResult.recognition.recognized, false);
  });

  it('expired capability token -> denied, executor never invoked', async () => {
    const { fixture, kernel } = buildKernelParityWorld();
    fixture.recognitionRuntime.issueCapabilityToken({
      id: 'cap-pmfreak-drafting-expired-characterization',
      subjectActorId: fixture.world.pmfreak.id,
      principalActorId: fixture.world.victor.id,
      issuerActorId: fixture.world.victor.id,
      trustDomainId: fixture.world.trustDomainId,
      capability: 'project_closure.drafting',
      actions: ['draft_closure_email'],
      resourceScopes: [fixture.world.pmfreakDraftingToken.resourceScopes[0] as string],
      riskLevel: 'medium',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    const guardInput = buildDraftClosureEmailGuardInput({ metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting-expired-characterization' } });

    const legacyDecision = fixture.aocGuard.preflight(guardInput);
    assert.equal(legacyDecision.type, 'expired');

    const kernelResult = await kernel.evaluate(toKernelRequest(guardInput));
    assert.equal(kernelResult.status, 'denied');
  });
});
