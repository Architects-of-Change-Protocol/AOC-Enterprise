import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../sdk/aoc-guard.js';
import { WebhookGuard } from '../sdk/webhook-guard.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUp(result: RecognitionVerificationResult) {
  const recognitionIntegration: EnforcementRecognitionIntegration = { verifyAction: () => result };
  const runtime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), recognitionIntegration);
  return { runtime, webhookGuard: new WebhookGuard(createAocGuard(runtime)) };
}

const ALLOW: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };
const NO_STANDING: RecognitionVerificationResult = { type: 'unrecognized_actor', reasonCode: 'NO_HANDSHAKE', reason: 'no handshake on file' };
const REVOKED: RecognitionVerificationResult = { type: 'revoked', reasonCode: 'VISA_REVOKED', reason: 'visa revoked' };

function baseInput(execute: () => string) {
  return {
    webhookId: 'webhook-partner-status-update',
    actorId: 'external-agent-trusted-partner-research-agent',
    trustDomainId: 'trust-domain-1',
    action: 'read_project_summary',
    resourceScope: 'project:HMP-14665',
    execute,
  };
}

describe('WebhookGuard', () => {
  it('1. an allowed webhook action executes', async () => {
    const { webhookGuard } = setUp(ALLOW);
    let ran = false;
    await webhookGuard.handle(baseInput(() => ((ran = true), 'ok')));
    assert.equal(ran, true);
  });

  it('2. an external agent without valid standing is blocked', async () => {
    const { webhookGuard } = setUp(NO_STANDING);
    let ran = false;
    const outcome = await webhookGuard.handle(baseInput(() => ((ran = true), 'ok')));
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'execution_blocked');
  });

  it('3. an external agent with a valid visa/ingress grant executes', async () => {
    const { webhookGuard } = setUp(ALLOW);
    let ran = false;
    await webhookGuard.handle({ ...baseInput(() => ((ran = true), 'ok')), visaId: 'visa-1', ingressGrantId: 'ingress-1', handshakeProofId: 'handshake-proof-1' });
    assert.equal(ran, true);
  });

  it('4. a revoked visa blocks webhook-triggered execution', async () => {
    const { webhookGuard } = setUp(REVOKED);
    let ran = false;
    const outcome = await webhookGuard.handle({ ...baseInput(() => ((ran = true), 'ok')), visaId: 'visa-1' });
    assert.equal(ran, false);
    assert.equal(outcome.decision.type, 'execution_blocked');
  });

  it('5. the webhook handler is not called when blocked', async () => {
    const { webhookGuard } = setUp(NO_STANDING);
    let called = false;
    await webhookGuard.handle({
      ...baseInput(() => {
        called = true;
        return 'ok';
      }),
    });
    assert.equal(called, false);
  });
});
