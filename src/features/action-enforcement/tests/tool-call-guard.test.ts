import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../sdk/aoc-guard.js';
import { ToolCallGuard } from '../sdk/tool-call-guard.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp(result: RecognitionVerificationResult) {
  const recognitionIntegration: EnforcementRecognitionIntegration = { verifyAction: () => result };
  const runtime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), recognitionIntegration);
  return new ToolCallGuard(createAocGuard(runtime));
}

const ALLOW: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };
const DENY: RecognitionVerificationResult = { type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' };
const APPROVAL: RecognitionVerificationResult = { type: 'require_human_approval', reasonCode: 'APPROVAL', reason: 'needs approval' };
const EVIDENCE: RecognitionVerificationResult = { type: 'require_more_evidence', reasonCode: 'EVIDENCE', reason: 'needs evidence' };

function baseInput(execute: () => string) {
  return {
    actorId: 'actor-pmfreak-closure-agent',
    trustDomainId: 'trust-domain-1',
    toolName: 'send_email',
    action: 'send_client_follow_up',
    resourceScope: 'project:HMP-14665',
    capability: 'client_communication',
    execute,
  };
}

describe('ToolCallGuard', () => {
  it('1. an allowed tool call executes', async () => {
    const guard = setUp(ALLOW);
    let ran = false;
    await guard.execute(baseInput(() => ((ran = true), 'sent')));
    assert.equal(ran, true);
  });

  it('2. a blocked tool call does not execute', async () => {
    const guard = setUp(DENY);
    let ran = false;
    const outcome = await guard.execute(baseInput(() => ((ran = true), 'sent')));
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'execution_blocked');
  });

  it('3. an approval-required tool call does not execute', async () => {
    const guard = setUp(APPROVAL);
    let ran = false;
    const outcome = await guard.execute(baseInput(() => ((ran = true), 'sent')));
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'approval_required');
  });

  it('4. an evidence-required tool call does not execute', async () => {
    const guard = setUp(EVIDENCE);
    let ran = false;
    const outcome = await guard.execute(baseInput(() => ((ran = true), 'sent')));
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'evidence_required');
  });

  it('5. the tool result is returned in the ExecutionResult', async () => {
    const guard = setUp(ALLOW);
    const outcome = await guard.execute(baseInput(() => 'sent-ok'));
    assert.equal(outcome.result.value, 'sent-ok');
  });

  it('6. a thrown tool error is captured', async () => {
    const guard = setUp(ALLOW);
    const outcome = await guard.execute({
      ...baseInput(() => 'unused'),
      execute: () => {
        throw new Error('smtp down');
      },
    });
    assert.equal(outcome.result.status, 'failed');
    assert.equal(outcome.result.errorMessage, 'smtp down');
  });

  it('7. idempotency suppresses a duplicate tool call', async () => {
    const guard = setUp(ALLOW);
    let count = 0;
    const input = { ...baseInput(() => ((count += 1), 'sent')), idempotencyKey: 'tool-call-key-1' };
    await guard.execute(input);
    const second = await guard.execute(input);
    assert.equal(count, 1);
    assert.equal(second.decision.type, 'duplicate_suppressed');
  });
});
