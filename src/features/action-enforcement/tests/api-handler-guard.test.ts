import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../sdk/aoc-guard.js';
import { ApiHandlerGuard } from '../sdk/api-handler-guard.js';

const NOW = '2026-01-01T00:00:00.000Z';

interface FakeRequest {
  readonly actorId: string;
  readonly projectId: string;
}

function setUp(result: RecognitionVerificationResult) {
  const recognitionIntegration: EnforcementRecognitionIntegration = { verifyAction: () => result };
  const runtime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), recognitionIntegration);
  return new ApiHandlerGuard(createAocGuard(runtime));
}

const ALLOW: RecognitionVerificationResult = { type: 'allow', reasonCode: 'OK', reason: 'ok' };
const DENY: RecognitionVerificationResult = { type: 'policy_violation', reasonCode: 'DENIED', reason: 'denied' };

describe('ApiHandlerGuard', () => {
  it('1. an allowed handler executes', async () => {
    const guard = setUp(ALLOW);
    let ran = false;
    const POST = guard.wrap<FakeRequest, { ok: true }>({
      action: 'send_client_follow_up',
      trustDomainFromRequest: () => 'trust-domain-1',
      actorFromRequest: (req) => req.actorId,
      resourceScopeFromRequest: (req) => `project:${req.projectId}`,
      handler: async () => {
        ran = true;
        return { ok: true };
      },
    });
    await POST({ actorId: 'actor-1', projectId: 'HMP-14665' });
    assert.equal(ran, true);
  });

  it('2. a blocked handler does not execute', async () => {
    const guard = setUp(DENY);
    let ran = false;
    const POST = guard.wrap<FakeRequest, { ok: true }>({
      action: 'send_client_follow_up',
      trustDomainFromRequest: () => 'trust-domain-1',
      actorFromRequest: (req) => req.actorId,
      resourceScopeFromRequest: (req) => `project:${req.projectId}`,
      handler: async () => {
        ran = true;
        return { ok: true };
      },
    });
    const result = await POST({ actorId: 'actor-1', projectId: 'HMP-14665' });
    assert.equal(ran, false);
    assert.equal(result.blocked, true);
  });

  it('3. the request mapper builds a correctly-scoped enforcement request', async () => {
    const guard = setUp(ALLOW);
    let capturedScope: string | undefined;
    const POST = guard.wrap<FakeRequest, { ok: true }>({
      action: 'send_client_follow_up',
      trustDomainFromRequest: () => 'trust-domain-1',
      actorFromRequest: (req) => req.actorId,
      resourceScopeFromRequest: (req) => `project:${req.projectId}`,
      handler: async () => ({ ok: true }),
    });
    const result = await POST({ actorId: 'actor-1', projectId: 'GCH-15992' });
    if (!result.blocked) {
      capturedScope = result.outcome.request.resourceScope;
    }
    assert.equal(capturedScope, 'project:GCH-15992');
  });

  it('4. the handler return value is captured', async () => {
    const guard = setUp(ALLOW);
    const POST = guard.wrap<FakeRequest, { message: string }>({
      action: 'send_client_follow_up',
      trustDomainFromRequest: () => 'trust-domain-1',
      actorFromRequest: (req) => req.actorId,
      resourceScopeFromRequest: (req) => `project:${req.projectId}`,
      handler: async () => ({ message: 'delivered' }),
    });
    const result = await POST({ actorId: 'actor-1', projectId: 'HMP-14665' });
    assert.equal(result.blocked, false);
    if (!result.blocked) {
      assert.equal(result.value.message, 'delivered');
    }
  });

  it('5. a handler error is captured', async () => {
    const guard = setUp(ALLOW);
    const POST = guard.wrap<FakeRequest, { ok: true }>({
      action: 'send_client_follow_up',
      trustDomainFromRequest: () => 'trust-domain-1',
      actorFromRequest: (req) => req.actorId,
      resourceScopeFromRequest: (req) => `project:${req.projectId}`,
      handler: async () => {
        throw new Error('downstream failure');
      },
    });
    const result = await POST({ actorId: 'actor-1', projectId: 'HMP-14665' });
    assert.equal(result.outcome.result.status, 'failed');
    assert.equal(result.outcome.result.errorMessage, 'downstream failure');
  });

  it('6. an adapter-denied handler does not execute', async () => {
    let ran = false;
    const denyingRuntime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), { verifyAction: () => ALLOW });
    denyingRuntime.registerAdapter({ id: 'adapter-payments', type: 'api_handler', name: 'Payments', deniedActions: ['approve_payment'], requiresIdempotencyKey: false });
    const deniedGuard = new ApiHandlerGuard(createAocGuard(denyingRuntime));
    const deniedPOST = deniedGuard.wrap<FakeRequest, { ok: true }>({
      action: 'approve_payment',
      adapterId: 'adapter-payments',
      trustDomainFromRequest: () => 'trust-domain-1',
      actorFromRequest: (req) => req.actorId,
      resourceScopeFromRequest: (req) => `project:${req.projectId}`,
      handler: async () => {
        ran = true;
        return { ok: true };
      },
    });
    const result = await deniedPOST({ actorId: 'actor-1', projectId: 'HMP-14665' });
    assert.equal(ran, false);
    assert.equal(result.blocked, true);
    assert.equal(result.outcome.decision.type, 'adapter_denied');
  });
});
