import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../authority-graph/runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../recognition-runtime/runtime/runtime-context.js';
import { bridgeRecognitionRuntime } from '../fixtures/datasys-enforcement.fixture.js';
import { createActionEnforcementRuntime } from '../runtime/action-enforcement-runtime.js';
import { createEnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { createAocGuard } from '../sdk/aoc-guard.js';

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-datasys-agent-republic';
const PROJECT_SCOPE = 'project:HMP-14665';
const DATASYS = 'actor-datasys';
const VICTOR = 'actor-victor-valverde';
const PMFREAK = 'actor-pmfreak-closure-agent';
const DRAFT_CLOSURE_EMAIL = 'draft_closure_email';

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
  const draftingToken = recognitionRuntime.issueCapabilityToken({
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

  return { recognitionRuntime, authorityRuntime, draftingToken, victorGrant, aocGuard };
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

describe('Authority Graph integration', () => {
  it('1. Recognition with valid authority allows enforcement execution', async () => {
    const { aocGuard } = setUp();
    let ran = false;
    const outcome = await aocGuard.enforce(guardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'execute_allowed');
    assert.equal(ran, true);
  });

  it('2. Recognition with authority_missing blocks enforcement', async () => {
    const { aocGuard } = setUp();
    let ran = false;
    // 'summarize_project_status' is a valid capability-token action, but Victor's authority grant never covers it -- Authority Graph reports AUTHORITY_CHAIN_MISSING.
    const outcome = await aocGuard.enforce(guardInput({ action: 'summarize_project_status' }), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.allowedToExecute, false);
    assert.equal(ran, false);
  });

  it('3. Recognition with an ancestor_revoked authority chain blocks enforcement', async () => {
    const { aocGuard, authorityRuntime, victorGrant } = setUp();
    authorityRuntime.revokeAuthorityGrant(victorGrant.id, DATASYS, "Datasys revoked Victor's authority.");
    let ran = false;
    const outcome = await aocGuard.enforce(guardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'execution_blocked');
    assert.equal(ran, false);
  });

  it('4. Recognition with an ancestor_expired authority chain blocks enforcement', async () => {
    const { aocGuard } = setUp({ victorGrantExpiresAt: '2025-01-01T00:00:00.000Z' });
    let ran = false;
    const outcome = await aocGuard.enforce(guardInput(), () => ((ran = true), 'ok'));
    assert.equal(outcome.decision.type, 'expired');
    assert.equal(ran, false);
  });

  it('5. authorityProofId is included in the EnforcementProof when available', async () => {
    const { aocGuard } = setUp();
    const outcome = await aocGuard.enforce(guardInput(), () => 'ok');
    assert.ok(outcome.proof?.authorityProofId);
  });
});
