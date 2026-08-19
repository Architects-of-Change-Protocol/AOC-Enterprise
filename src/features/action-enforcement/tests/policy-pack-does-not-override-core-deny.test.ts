import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import type { EnforcementRecognitionIntegration, RecognitionVerificationResult } from '../domain/enforcement-context.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import { AdapterRegistry } from '../services/adapter-registry.js';
import { EnforcementDecisionService } from '../services/enforcement-decision-service.js';
import { EnforcementLedger } from '../services/enforcement-ledger.js';
import { EnforcementPolicyEvaluator } from '../services/enforcement-policy-evaluator.js';
import { EnforcementPreflightService } from '../services/enforcement-preflight-service.js';
import { EnforcementStore } from '../services/enforcement-store.js';
import { IdempotencyService } from '../services/idempotency-service.js';
import { PolicyPackEnforcementService } from '../services/policy-pack-enforcement-service.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';

const NOW = '2026-01-01T00:00:00.000Z';

/** Always allows -- proves that a policy pack "allow" never gets a chance to matter once an earlier core Soberanía layer already denied. */
const ALWAYS_ALLOW_POLICY_PACK = { evaluatePolicyForEnforcement: () => ({ type: 'policy_allowed' as const, allowed: true, reasonCode: 'OK', reason: 'ok' }) };

function fakeRecognition(result: RecognitionVerificationResult): EnforcementRecognitionIntegration {
  return { verifyAction: () => result };
}

function buildRequest(overrides: Partial<EnforcementRequest> = {}): EnforcementRequest {
  return {
    id: 'enforcement-request-1',
    mode: 'execute',
    status: 'submitted',
    trustDomainId: 'trust-domain-1',
    actorId: 'actor-1',
    action: 'approve_payment',
    resourceScope: 'project:1',
    target: { id: 'target-1', type: 'tool_call', name: 'approve_payment' },
    intent: { id: 'intent-1', action: 'approve_payment', resourceScope: 'project:1', riskLevel: 'medium', sideEffectType: 'write' },
    sideEffects: [],
    submittedAt: NOW,
    ...overrides,
  };
}

interface SetUpOptions {
  readonly recognitionResult: RecognitionVerificationResult;
  readonly emergencyDeny?: boolean;
  readonly adapter?: EnforcementAdapter;
}

function setUp(options: SetUpOptions) {
  const ctx = createEnforcementRuntimeContext(NOW);
  const store = new EnforcementStore();
  const ledger = new EnforcementLedger(ctx, store);
  const decisionService = new EnforcementDecisionService(ctx, store);
  const policyEvaluator = new EnforcementPolicyEvaluator();
  const adapterRegistry = new AdapterRegistry(store);
  if (options.adapter) {
    adapterRegistry.register(options.adapter);
  }
  const idempotencyService = new IdempotencyService(ctx);
  const policyPackService = new PolicyPackEnforcementService(ctx, ALWAYS_ALLOW_POLICY_PACK);
  const preflightService = new EnforcementPreflightService(
    ctx,
    store,
    ledger,
    decisionService,
    policyEvaluator,
    adapterRegistry,
    idempotencyService,
    fakeRecognition(options.recognitionResult),
    () => options.emergencyDeny ?? false,
    policyPackService,
  );
  return { store, idempotencyService, preflightService };
}

describe('Policy pack "allow" never overrides an existing Soberanía denial', () => {
  it('1. does not override an unrecognized actor', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'unrecognized_actor', reasonCode: 'ROGUE', reason: 'rogue' } });
    const decision = preflightService.preflight(store.saveRequest(buildRequest()));
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'execution_blocked');
  });

  it('2. does not override a revoked capability', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'revoked', reasonCode: 'REVOKED', reason: 'revoked' } });
    const decision = preflightService.preflight(store.saveRequest(buildRequest()));
    assert.equal(decision.allowedToExecute, false);
  });

  it('3. does not override an expired capability', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'expired', reasonCode: 'EXPIRED', reason: 'expired' } });
    const decision = preflightService.preflight(store.saveRequest(buildRequest()));
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'expired');
  });

  it('4. does not override invalid authority', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'invalid_passport', reasonCode: 'INVALID_AUTHORITY', reason: 'invalid authority' } });
    const decision = preflightService.preflight(store.saveRequest(buildRequest()));
    assert.equal(decision.allowedToExecute, false);
  });

  it('5. does not override missing approval', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'require_human_approval', reasonCode: 'APPROVAL', reason: 'needs approval' } });
    const decision = preflightService.preflight(store.saveRequest(buildRequest()));
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'approval_required');
  });

  it('6. does not override invalid external standing', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'revoked', reasonCode: 'STANDING_REVOKED', reason: 'standing revoked' } });
    const decision = preflightService.preflight(
      store.saveRequest(buildRequest({ visaId: 'visa-1', ingressGrantId: 'ingress-1', handshakeProofId: 'handshake-proof-1' })),
    );
    assert.equal(decision.allowedToExecute, false);
  });

  it('7. does not override an adapter deny', () => {
    const adapter: EnforcementAdapter = { id: 'adapter-1', type: 'tool_call', name: 'Adapter', deniedActions: ['approve_payment'], requiresIdempotencyKey: false };
    const { store, preflightService } = setUp({ recognitionResult: { type: 'allow', reasonCode: 'OK', reason: 'ok' }, adapter });
    const decision = preflightService.preflight(
      store.saveRequest(buildRequest({ target: { id: 'target-1', type: 'tool_call', name: 'approve_payment', adapterId: adapter.id } })),
    );
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'adapter_denied');
  });

  it('8. does not override emergency deny', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'allow', reasonCode: 'OK', reason: 'ok' }, emergencyDeny: true });
    const decision = preflightService.preflight(store.saveRequest(buildRequest()));
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'emergency_denied');
  });

  it('9. does not override dry-run no-execution', () => {
    const { store, preflightService } = setUp({ recognitionResult: { type: 'allow', reasonCode: 'OK', reason: 'ok' } });
    const decision = preflightService.preflight(store.saveRequest(buildRequest({ mode: 'dry_run' })));
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'dry_run_allowed');
  });

  it('10. does not override duplicate-suppressed idempotency', () => {
    const { store, idempotencyService, preflightService } = setUp({ recognitionResult: { type: 'allow', reasonCode: 'OK', reason: 'ok' } });
    const request = store.saveRequest(buildRequest({ idempotencyKey: 'idem-key-1' }));
    idempotencyService.check('idem-key-1', 'earlier-request');
    idempotencyService.recordSuccess('idem-key-1', 'earlier-result');
    const decision = preflightService.preflight(request);
    assert.equal(decision.allowedToExecute, false);
    assert.equal(decision.type, 'duplicate_suppressed');
  });
});
