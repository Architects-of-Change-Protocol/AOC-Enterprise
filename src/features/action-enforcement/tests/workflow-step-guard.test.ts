import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../sdk/aoc-guard.js';
import { WorkflowStepGuard } from '../sdk/workflow-step-guard.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp(result: RecognitionVerificationResult) {
  const recognitionIntegration: EnforcementRecognitionIntegration = { verifyAction: () => result };
  const runtime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), recognitionIntegration);
  return new WorkflowStepGuard(createAocGuard(runtime));
}

const ALLOW: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };
const DENY: RecognitionVerificationResult = { type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' };

function baseInput(execute: () => string) {
  return {
    stepId: 'send-client-follow-up',
    actorId: 'actor-pmfreak-closure-agent',
    trustDomainId: 'trust-domain-1',
    action: 'send_client_follow_up',
    resourceScope: 'project:HMP-14665',
    execute,
  };
}

describe('WorkflowStepGuard', () => {
  it('1. an allowed workflow step executes', async () => {
    const guard = setUp(ALLOW);
    let ran = false;
    await guard.runStep(baseInput(() => ((ran = true), 'done')));
    assert.equal(ran, true);
  });

  it('2. a blocked workflow step does not execute', async () => {
    const guard = setUp(DENY);
    let ran = false;
    const outcome = await guard.runStep(baseInput(() => ((ran = true), 'done')));
    assert.equal(ran, false);
    assert.equal(outcome.decision.allowedToExecute, false);
  });

  it('3. a dry-run workflow step does not execute', async () => {
    const guard = setUp(ALLOW);
    let ran = false;
    const outcome = await guard.runStep({ ...baseInput(() => ((ran = true), 'done')), mode: 'dry_run' });
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'dry_run_allowed');
  });

  it('4. idempotency suppresses a duplicate step', async () => {
    const guard = setUp(ALLOW);
    let count = 0;
    const input = { ...baseInput(() => ((count += 1), 'done')), idempotencyKey: 'workflow-step-key-1' };
    await guard.runStep(input);
    const second = await guard.runStep(input);
    assert.equal(count, 1);
    assert.equal(second.decision.type, 'duplicate_suppressed');
  });

  it('5. the step result is captured', async () => {
    const guard = setUp(ALLOW);
    const outcome = await guard.runStep(baseInput(() => 'step-result'));
    assert.equal(outcome.result.value, 'step-result');
  });
});
