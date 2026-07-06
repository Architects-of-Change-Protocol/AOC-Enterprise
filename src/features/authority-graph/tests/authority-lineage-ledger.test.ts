import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityLineageLedger } from '../services/authority-lineage-ledger.js';
import { createAuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import {
  buildDatasysAuthorityGraphWorld,
  PROJECT_SCOPE,
  UNKNOWN_AGENT_ACTOR_ID,
} from '../fixtures/datasys-authority-graph.fixture.js';
import { buildPmfreakDelegationFixture } from '../fixtures/pmfreak-delegation.fixture.js';
import { buildVictorAuthorityFixture } from '../fixtures/victor-authority.fixture.js';

const NOW = '2026-01-01T00:00:00.000Z';

function setUpRuntime() {
  const runtime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(NOW));
  const world = buildDatasysAuthorityGraphWorld(runtime);
  return { runtime, world };
}

describe('AuthorityLineageLedger', () => {
  it('1. records an authority_grant_issued event', () => {
    const { runtime, world } = setUpRuntime();
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);

    const events = runtime.getAuthorityEvents({ authorityGrantId: victorAuthority.victorGrant.id });
    assert.ok(events.some((event) => event.type === 'authority_grant_issued'));
  });

  it('2. records an authority_grant_revoked event', () => {
    const { runtime, world } = setUpRuntime();
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);
    runtime.revokeAuthorityGrant(victorAuthority.victorGrant.id, world.datasysActorId, 'no longer employed');

    const events = runtime.getAuthorityEvents({ authorityGrantId: victorAuthority.victorGrant.id });
    assert.ok(events.some((event) => event.type === 'authority_grant_revoked'));
  });

  it('3. records a delegation_grant_issued event', () => {
    const { runtime, world } = setUpRuntime();
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);
    const { pmfreakDelegation } = buildPmfreakDelegationFixture(runtime, world, victorAuthority);

    const events = runtime.getAuthorityEvents({ delegationGrantId: pmfreakDelegation.id });
    assert.ok(events.some((event) => event.type === 'delegation_grant_issued'));
  });

  it('4. records a delegation_grant_revoked event', () => {
    const { runtime, world } = setUpRuntime();
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);
    const { pmfreakDelegation } = buildPmfreakDelegationFixture(runtime, world, victorAuthority);
    runtime.revokeDelegationGrant(pmfreakDelegation.id, world.victorActorId, 'project closed');

    const events = runtime.getAuthorityEvents({ delegationGrantId: pmfreakDelegation.id });
    assert.ok(events.some((event) => event.type === 'delegation_grant_revoked'));
  });

  it('5. records an authority_chain_resolved event', () => {
    const { runtime, world } = setUpRuntime();
    const victorAuthority = buildVictorAuthorityFixture(runtime, world);
    buildPmfreakDelegationFixture(runtime, world, victorAuthority);

    runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: world.pmfreakActorId,
        trustDomainId: world.trustDomainId,
        action: 'draft_closure_email',
        resourceScope: PROJECT_SCOPE,
      }),
    );

    const events = runtime.getAuthorityEvents({ trustDomainId: world.trustDomainId });
    assert.ok(events.some((event) => event.type === 'authority_chain_resolved'));
  });

  it('6. records an authority_chain_valid event for a valid chain', () => {
    const { runtime, world } = setUpRuntime();
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

    assert.equal(decision.valid, true);
    const events = runtime.getAuthorityEvents({ trustDomainId: world.trustDomainId });
    assert.ok(events.some((event) => event.type === 'authority_chain_valid'));
  });

  it('7. records an authority_chain_invalid event for an invalid chain', () => {
    const { runtime, world } = setUpRuntime();
    buildVictorAuthorityFixture(runtime, world);

    const decision = runtime.verifyAuthority(
      runtime.buildAuthorityChainRequest({
        actorId: UNKNOWN_AGENT_ACTOR_ID,
        trustDomainId: world.trustDomainId,
        action: 'read_internal_documents',
        resourceScope: 'documents:internal',
      }),
    );

    assert.equal(decision.valid, false);
    const events = runtime.getAuthorityEvents({ trustDomainId: world.trustDomainId });
    assert.ok(events.some((event) => event.type === 'authority_chain_invalid'));
  });

  it('8. records an authority_proof_created event linked to the resulting proof', () => {
    const { runtime, world } = setUpRuntime();
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

    const events = runtime.getAuthorityEvents({ authorityDecisionId: decision.id });
    const proofEvent = events.find((event) => event.type === 'authority_proof_created');
    assert.ok(proofEvent);
    assert.equal(proofEvent?.authorityProofId, decision.proofId);
  });

  it('9. event hash is deterministic for identical inputs', () => {
    const ledgerA = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));
    const ledgerB = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));

    const input = {
      type: 'authority_grant_issued' as const,
      trustDomainId: 'trust-domain-1',
      issuerActorId: 'actor-datasys',
      subjectActorId: 'actor-victor',
      authorityGrantId: 'authority-grant-1',
      payload: { capability: 'project_closure.management' },
    };

    const eventA = ledgerA.recordEvent(input);
    const eventB = ledgerB.recordEvent(input);

    assert.equal(eventA.eventHash, eventB.eventHash);
  });

  it('10. maintains a previousHash/eventHash chain across events', () => {
    const ledger = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));

    const first = ledger.recordEvent({
      type: 'authority_grant_issued',
      trustDomainId: 'trust-domain-1',
      authorityGrantId: 'authority-grant-1',
      payload: {},
    });
    const second = ledger.recordEvent({
      type: 'authority_grant_revoked',
      trustDomainId: 'trust-domain-1',
      authorityGrantId: 'authority-grant-1',
      payload: {},
    });

    assert.equal(first.previousHash, undefined);
    assert.equal(second.previousHash, first.eventHash);
    assert.notEqual(second.eventHash, first.eventHash);
  });

  it('11. can retrieve the trail filtered by trustDomainId', () => {
    const ledger = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));
    ledger.recordEvent({ type: 'authority_grant_issued', trustDomainId: 'domain-a', payload: {} });
    ledger.recordEvent({ type: 'authority_grant_issued', trustDomainId: 'domain-b', payload: {} });

    const trail = ledger.getEventTrail({ trustDomainId: 'domain-a' });
    assert.equal(trail.length, 1);
    assert.equal(trail[0]?.trustDomainId, 'domain-a');
  });

  it('12. can retrieve the trail filtered by authorityGrantId', () => {
    const ledger = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));
    ledger.recordEvent({ type: 'authority_grant_issued', trustDomainId: 'domain-a', authorityGrantId: 'grant-1', payload: {} });
    ledger.recordEvent({ type: 'authority_grant_issued', trustDomainId: 'domain-a', authorityGrantId: 'grant-2', payload: {} });
    ledger.recordEvent({ type: 'authority_grant_revoked', trustDomainId: 'domain-a', authorityGrantId: 'grant-1', payload: {} });

    const trail = ledger.getEventTrail({ authorityGrantId: 'grant-1' });
    assert.equal(trail.length, 2);
    assert.ok(trail.every((event) => event.authorityGrantId === 'grant-1'));
  });

  it('13. can retrieve the trail filtered by delegationGrantId', () => {
    const ledger = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));
    ledger.recordEvent({ type: 'delegation_grant_issued', trustDomainId: 'domain-a', delegationGrantId: 'delegation-1', payload: {} });
    ledger.recordEvent({ type: 'delegation_grant_issued', trustDomainId: 'domain-a', delegationGrantId: 'delegation-2', payload: {} });
    ledger.recordEvent({ type: 'delegation_grant_revoked', trustDomainId: 'domain-a', delegationGrantId: 'delegation-1', payload: {} });

    const trail = ledger.getEventTrail({ delegationGrantId: 'delegation-1' });
    assert.equal(trail.length, 2);
    assert.ok(trail.every((event) => event.delegationGrantId === 'delegation-1'));
  });

  it('returns the full trail when no filter is given, in recorded order', () => {
    const ledger = new AuthorityLineageLedger(createAuthorityRuntimeContext(NOW));
    ledger.recordEvent({ type: 'authority_grant_issued', trustDomainId: 'domain-a', payload: {} });
    ledger.recordEvent({ type: 'authority_grant_revoked', trustDomainId: 'domain-a', payload: {} });

    const trail = ledger.getEventTrail();
    assert.deepEqual(
      trail.map((event) => event.type),
      ['authority_grant_issued', 'authority_grant_revoked'],
    );
  });
});
