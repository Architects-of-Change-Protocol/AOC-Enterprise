import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import { NonDelegableActionError } from '../runtime/authority-runtime-errors.js';
import {
  buildDatasysAuthorityGraphWorld,
  OTHER_PROJECT_SCOPE,
  PROJECT_SCOPE,
  UNKNOWN_AGENT_ACTOR_ID,
} from '../fixtures/datasys-authority-graph.fixture.js';
import { buildSelfIssuedGrantFixture } from '../fixtures/invalid-delegation.fixture.js';
import { buildPmfreakDelegationFixture, PMFREAK_DELEGATED_ACTIONS } from '../fixtures/pmfreak-delegation.fixture.js';
import { buildRevokedAncestorScenario } from '../fixtures/revoked-authority.fixture.js';
import { buildVictorAuthorityFixture } from '../fixtures/victor-authority.fixture.js';

const NOW = '2026-01-01T00:00:00.000Z';

function assertThrowsInstance(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  try {
    fn();
    assert.ok(false, 'expected function to throw');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}`);
  }
}

function setUp() {
  const runtime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  return { runtime };
}

describe('demo scenarios: Datasys Agent Republic authority graph', () => {
  it('1. Datasys grants Victor PM authority; Victor delegates drafting to PMFreak; PMFreak drafts the closure email => authority_valid', () => {
    const { runtime } = setUp();
    const world = buildDatasysAuthorityGraphWorld(runtime);
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);
    buildPmfreakDelegationFixture(runtime, world, victorAuthority);

    const decision = runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: world.pmfreakActorId,
        trustDomainId: world.trustDomainId,
        action: 'draft_closure_email',
        resourceScope: PROJECT_SCOPE,
      }),
    );

    assert.equal(decision.type, 'authority_valid');
    assert.equal(decision.valid, true);
    assert.equal(decision.chain?.terminalActorId, world.pmfreakActorId);
    assert.equal(decision.chain?.rootIssuerActorId, world.datasysActorId);
  });

  it('2. PMFreak tries to draft for GCH-15992 using HMP-14665 authority => scope_expansion_detected', () => {
    const { runtime } = setUp();
    const world = buildDatasysAuthorityGraphWorld(runtime);
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);
    buildPmfreakDelegationFixture(runtime, world, victorAuthority);

    const decision = runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: world.pmfreakActorId,
        trustDomainId: world.trustDomainId,
        action: 'draft_closure_email',
        resourceScope: OTHER_PROJECT_SCOPE,
      }),
    );

    assert.equal(decision.type, 'scope_expansion_detected');
  });

  it('3. PMFreak attempts to self-issue approve_payment => self_issuance_detected', () => {
    const { runtime } = setUp();
    const world = buildDatasysAuthorityGraphWorld(runtime);
    buildSelfIssuedGrantFixture(runtime, world);

    const decision = runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: world.pmfreakActorId,
        trustDomainId: world.trustDomainId,
        action: 'approve_payment',
        resourceScope: PROJECT_SCOPE,
      }),
    );

    assert.equal(decision.type, 'self_issuance_detected');
  });

  it('4. Datasys revokes Victor\'s PM authority; PMFreak tries to act again => ancestor_revoked', () => {
    const { runtime } = setUp();
    const scenario = buildRevokedAncestorScenario(runtime);

    const decision = runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: scenario.world.pmfreakActorId,
        trustDomainId: scenario.world.trustDomainId,
        action: 'draft_closure_email',
        resourceScope: PROJECT_SCOPE,
      }),
    );

    assert.equal(decision.type, 'ancestor_revoked');
  });

  it('5. Victor tries to delegate send_final_invoice, which is non-delegable, and is rejected at creation time', () => {
    const { runtime } = setUp();
    const world = buildDatasysAuthorityGraphWorld(runtime);
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);

    assertThrowsInstance(() => {
      runtime.createDelegationGrant({
        delegatorActorId: world.victorActorId,
        delegateActorId: world.pmfreakActorId,
        delegateActorType: 'agent',
        trustDomainId: world.trustDomainId,
        sourceAuthorityGrantId: victorAuthority.victorGrant.id,
        capability: 'project_closure.drafting',
        actions: [...PMFREAK_DELEGATED_ACTIONS, 'send_final_invoice'],
        resourceScopes: [PROJECT_SCOPE],
      });
    }, NonDelegableActionError);
  });

  it('6. Unknown External Agent has no authority chain; Authority Graph does not resolve or excuse it', () => {
    const { runtime } = setUp();
    const world = buildDatasysAuthorityGraphWorld(runtime);
    buildVictorAuthorityFixture(runtime, world);

    const decision = runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: UNKNOWN_AGENT_ACTOR_ID,
        trustDomainId: world.trustDomainId,
        action: 'read_internal_documents',
        resourceScope: 'documents:internal',
      }),
    );

    // Authority Graph never grants standing to an actor it has no record of --
    // it reports authority_missing. Recognition Runtime's own rogue-actor
    // policy is what classifies and short-circuits this as unrecognized_actor
    // *before* Authority Graph is ever consulted (see
    // recognition-runtime-integration.test.ts, scenario 8).
    assert.equal(decision.type, 'authority_missing');
    assert.equal(decision.valid, false);
  });
});
