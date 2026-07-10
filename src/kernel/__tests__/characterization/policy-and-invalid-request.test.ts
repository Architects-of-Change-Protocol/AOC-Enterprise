import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftClosureEmailGuardInput } from '../../../features/action-enforcement/fixtures/allowed-action.fixture.js';
import {
  bridgeRecognitionRuntime,
  buildDatasysEnforcementFixture,
  CHANGE_BANK_ACCOUNT,
  PROJECT_SCOPE,
  TRUST_DOMAIN_ID,
  VICTOR_ACTOR_ID,
} from '../../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { createActionEnforcementRuntime } from '../../../features/action-enforcement/runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext, createManualEnforcementClock, createSequentialEnforcementIdGenerator } from '../../../features/action-enforcement/runtime/enforcement-runtime-context.js';
import { createAocGuard, type GuardActionRequestInput } from '../../../features/action-enforcement/sdk/aoc-guard.js';
import type { EnforcementPolicyPackEvaluationInput, EnforcementPolicyPackEvaluationResult, EnforcementPolicyPackIntegration } from '../../../features/action-enforcement/domain/policy-pack-enforcement.js';
import { AocKernel } from '../../AocKernel.js';
import { KernelValidationError } from '../../errors/kernel-errors.js';
import { assertRejectsInstance } from '../assert-helpers.js';
import { NOW, buildKernelParityWorld, toKernelRequest } from './support.js';

/**
 * A minimal, real `EnforcementPolicyPackIntegration` implementation (not a
 * mocking library) that hard-denies `change_bank_account` regardless of
 * recognition/authority/approval -- this is what
 * `docs/kernel/AOC_KERNEL_CURRENT_EXECUTION_MODEL.md` sec. 10 documents as
 * "domain policy mismatch": a domain-specific rule can still block an
 * action every core AOC layer already allowed.
 */
const BANK_ACCOUNT_CHANGE_DENIAL_INTEGRATION: EnforcementPolicyPackIntegration = {
  evaluatePolicyForEnforcement(input: EnforcementPolicyPackEvaluationInput): EnforcementPolicyPackEvaluationResult {
    if (input.action === CHANGE_BANK_ACCOUNT) {
      return {
        type: 'policy_denied',
        allowed: false,
        reasonCode: 'PAYMENTS_BASIC_BANK_ACCOUNT_CHANGE_DENIED',
        reason: 'The payments-basic policy pack denies bank account changes by default.',
        matchedRuleIds: ['payments-basic-rule-change-bank-account-denied'],
      };
    }
    return { type: 'policy_allowed', allowed: true, reasonCode: 'POLICY_ALLOWED', reason: 'No domain policy pack rule applies to this action.' };
  },
};

describe('Kernel characterization: policy denial', () => {
  it('domain policy mismatch: policy pack denies an action every core AOC layer already allowed', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const legacyRuntime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), bridgeRecognitionRuntime(fixture.recognitionRuntime), {
      policyPackIntegration: BANK_ACCOUNT_CHANGE_DENIAL_INTEGRATION,
    });
    const legacyGuard = createAocGuard(legacyRuntime);
    const kernel = new AocKernel({
      recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime),
      policyPackProvider: BANK_ACCOUNT_CHANGE_DENIAL_INTEGRATION,
      clock: createManualEnforcementClock(NOW),
      idGenerator: createSequentialEnforcementIdGenerator(),
    });

    const input: GuardActionRequestInput = {
      actorId: VICTOR_ACTOR_ID,
      trustDomainId: TRUST_DOMAIN_ID,
      action: CHANGE_BANK_ACCOUNT,
      resourceScope: PROJECT_SCOPE,
      capability: 'finance.bank_details',
      sideEffectType: 'financial',
      riskLevel: 'critical',
      metadata: { passportId: 'passport-victor', capabilityTokenId: 'cap-victor-financial' },
    };

    let executed = false;
    const legacyOutcome = await legacyGuard.enforce(input, () => ((executed = true), 'changed'));
    assert.equal(legacyOutcome.decision.type, 'execution_blocked');
    assert.equal(legacyOutcome.decision.policyMatchedRuleIds?.includes('payments-basic-rule-change-bank-account-denied'), true);
    assert.equal(executed, false);

    const kernelOutcome = await kernel.enforce(toKernelRequest(input), () => ((executed = true), 'changed'));
    assert.equal(kernelOutcome.status, 'denied');
    assert.equal(kernelOutcome.execution.executed, false);
    assert.equal(executed, false);
  });

  it('conflicting policy outcome: emergency deny overrides an otherwise-allowed request', async () => {
    const fixture = buildDatasysEnforcementFixture();
    const legacyRuntime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), bridgeRecognitionRuntime(fixture.recognitionRuntime), { emergencyDeny: true });
    const legacyGuard = createAocGuard(legacyRuntime);
    const kernel = new AocKernel({
      recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime),
      emergencyDeny: true,
      clock: createManualEnforcementClock(NOW),
      idGenerator: createSequentialEnforcementIdGenerator(),
    });

    const input = buildDraftClosureEmailGuardInput();
    const legacyDecision = legacyGuard.preflight(input);
    assert.equal(legacyDecision.type, 'emergency_denied');

    const kernelResult = await kernel.evaluate(toKernelRequest(input));
    assert.equal(kernelResult.status, 'denied');
  });
});

describe('Kernel characterization: invalid request', () => {
  it('rejects a request with a missing/empty actor id before reaching the wrapped engine', async () => {
    const { kernel } = buildKernelParityWorld();
    await assertRejectsInstance(
      () => kernel.evaluate({ requestId: 'req-1', actor: { id: '', trustDomainId: TRUST_DOMAIN_ID }, action: { type: 'draft_closure_email', resourceScope: PROJECT_SCOPE }, requestedAt: NOW }),
      KernelValidationError,
    );
  });

  it('rejects a request with a missing action type', async () => {
    const { kernel } = buildKernelParityWorld();
    await assertRejectsInstance(
      () => kernel.evaluate({ requestId: 'req-2', actor: { id: VICTOR_ACTOR_ID, trustDomainId: TRUST_DOMAIN_ID }, action: { type: '', resourceScope: PROJECT_SCOPE }, requestedAt: NOW }),
      KernelValidationError,
    );
  });

  it('rejects a request with a missing resourceScope', async () => {
    const { kernel } = buildKernelParityWorld();
    await assertRejectsInstance(
      () => kernel.evaluate({ requestId: 'req-3', actor: { id: VICTOR_ACTOR_ID, trustDomainId: TRUST_DOMAIN_ID }, action: { type: 'draft_closure_email', resourceScope: '' }, requestedAt: NOW }),
      KernelValidationError,
    );
  });

  it('rejects a request with an invalid requestedAt timestamp', async () => {
    const { kernel } = buildKernelParityWorld();
    await assertRejectsInstance(
      () =>
        kernel.evaluate({
          requestId: 'req-4',
          actor: { id: VICTOR_ACTOR_ID, trustDomainId: TRUST_DOMAIN_ID },
          action: { type: 'draft_closure_email', resourceScope: PROJECT_SCOPE },
          requestedAt: 'not-a-timestamp',
        }),
      KernelValidationError,
    );
  });
});
