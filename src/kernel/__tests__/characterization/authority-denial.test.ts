import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../../../features/authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../../features/authority-graph/runtime/authority-runtime-context.js';
import { bridgeRecognitionRuntime } from '../../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { createAocRecognitionRuntime } from '../../../features/recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../../features/recognition-runtime/runtime/runtime-context.js';
import { createActionEnforcementRuntime } from '../../../features/action-enforcement/runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext, createManualEnforcementClock, createSequentialEnforcementIdGenerator } from '../../../features/action-enforcement/runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../../../features/action-enforcement/sdk/aoc-guard.js';
import { AocKernel } from '../../AocKernel.js';
import { toKernelRequest } from './support.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-datasys-agent-republic';
const PROJECT_SCOPE = 'project:HMP-14665';
const DATASYS = 'actor-datasys';
const VICTOR = 'actor-victor-valverde';
const PMFREAK = 'actor-pmfreak-closure-agent';
const DRAFT_CLOSURE_EMAIL = 'draft_closure_email';

/**
 * Mirrors `setUp()` in `action-enforcement/tests/authority-graph-integration.test.ts`
 * (not exported from that file) so this characterization suite builds its own
 * real, full authority-chain world -- rather than importing test internals --
 * and wires an `AocKernel` parity instance on top of the identical
 * recognition/authority runtimes the pre-extraction `aocGuard` uses.
 */
function setUp(options: { readonly victorGrantExpiresAt?: string } = {}) {
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const recognitionCtx: RuntimeContext = { clock: createManualClock(NOW), idGenerator: createSequentialIdGenerator() };
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime);

  recognitionRuntime.registerActor({ id: DATASYS, type: 'organization', displayName: 'Datasys' });
  recognitionRuntime.createTrustDomain({
    id: TRUST_DOMAIN,
    name: 'Datasys Agent Republic',
    issuerActorId: DATASYS,
    acceptedIssuerIds: [DATASYS],
    acceptedActorTypes: ['human', 'organization', 'agent'],
  });
  recognitionRuntime.registerActor({ id: VICTOR, type: 'human', displayName: 'Victor Valverde', issuerId: DATASYS, trustDomainId: TRUST_DOMAIN });
  recognitionRuntime.registerActor({ id: PMFREAK, type: 'agent', displayName: 'PMFreak Closure Agent', issuerId: DATASYS, trustDomainId: TRUST_DOMAIN });

  recognitionRuntime.issuePassport({ id: 'passport-pmfreak', type: 'agent_passport', subjectActorId: PMFREAK, issuerActorId: DATASYS, trustDomainId: TRUST_DOMAIN });
  recognitionRuntime.issueCapabilityToken({
    id: 'cap-pmfreak-drafting',
    subjectActorId: PMFREAK,
    principalActorId: VICTOR,
    issuerActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.drafting',
    actions: [DRAFT_CLOSURE_EMAIL, 'summarize_project_status'],
    resourceScopes: [PROJECT_SCOPE],
    riskLevel: 'medium',
  });

  authorityRuntime.registerRootIssuer(TRUST_DOMAIN, DATASYS);
  const victorGrant = authorityRuntime.issueAuthorityGrant({
    issuerActorId: DATASYS,
    subjectActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    capability: 'project_closure.management',
    actions: [DRAFT_CLOSURE_EMAIL],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
    ...(options.victorGrantExpiresAt !== undefined ? { expiresAt: options.victorGrantExpiresAt } : {}),
  });
  authorityRuntime.createDelegationGrant({
    delegatorActorId: VICTOR,
    delegateActorId: PMFREAK,
    delegateActorType: 'agent',
    trustDomainId: TRUST_DOMAIN,
    sourceAuthorityGrantId: victorGrant.id,
    capability: 'project_closure.drafting',
    actions: [DRAFT_CLOSURE_EMAIL],
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  const enforcementRuntime = createActionEnforcementRuntime(createEnforcementRuntimeContext(NOW), bridgeRecognitionRuntime(recognitionRuntime));
  const aocGuard = createAocGuard(enforcementRuntime);
  const kernel = new AocKernel({
    recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime),
    clock: createManualEnforcementClock(NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  });

  return { recognitionRuntime, authorityRuntime, victorGrant, aocGuard, kernel };
}

function guardInput(overrides: Record<string, unknown> = {}) {
  return {
    actorId: PMFREAK,
    principalActorId: VICTOR,
    trustDomainId: TRUST_DOMAIN,
    action: DRAFT_CLOSURE_EMAIL,
    resourceScope: PROJECT_SCOPE,
    sideEffectType: 'write' as const,
    metadata: { passportId: 'passport-pmfreak', capabilityTokenId: 'cap-pmfreak-drafting' },
    ...overrides,
  };
}

describe('Kernel characterization: denied by authority', () => {
  it('missing capability / authority chain never granted for this action -> denied', async () => {
    const { aocGuard, kernel } = setUp();
    const input = guardInput({ action: 'summarize_project_status' });

    const legacyDecision = aocGuard.preflight(input);
    assert.equal(legacyDecision.allowedToExecute, false);

    const kernelResult = await kernel.evaluate(toKernelRequest(input));
    assert.equal(kernelResult.status, 'denied');
  });

  it('delegation revoked (ancestor authority grant revoked) -> denied', async () => {
    const { aocGuard, authorityRuntime, victorGrant, kernel } = setUp();
    authorityRuntime.revokeAuthorityGrant(victorGrant.id, DATASYS, "Datasys revoked Victor's authority.");
    const input = guardInput();

    const legacyDecision = aocGuard.preflight(input);
    assert.equal(legacyDecision.type, 'execution_blocked');

    const kernelResult = await kernel.evaluate(toKernelRequest(input));
    assert.equal(kernelResult.status, 'denied');
  });

  it('delegation expired (ancestor authority grant expired) -> denied', async () => {
    const { aocGuard, kernel } = setUp({ victorGrantExpiresAt: '2025-01-01T00:00:00.000Z' });
    const input = guardInput();

    const legacyDecision = aocGuard.preflight(input);
    assert.equal(legacyDecision.type, 'expired');

    const kernelResult = await kernel.evaluate(toKernelRequest(input));
    assert.equal(kernelResult.status, 'denied');
  });
});
