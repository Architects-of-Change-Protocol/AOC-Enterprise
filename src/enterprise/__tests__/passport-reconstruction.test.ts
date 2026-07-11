import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createAgentPassportService, type AgentPassportService } from '../passport/service.js';
import { verifyEventChain } from '../passport/events.js';
import { AgentPassportError } from '../passport/errors.js';
import type { AgentPassportStore } from '../passport/passport-store.js';
import type { IssueAgentPassportInput } from '../passport/service.js';

const ORG = { organizationId: 'org-1', system: false } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

function buildStoreAndService(): { store: AgentPassportStore; service: AgentPassportService } {
  const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
  const service = createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}` });
  return { store, service };
}

function issuanceInput(overrides: Partial<IssueAgentPassportInput> = {}): IssueAgentPassportInput {
  return {
    subject: { agentId: 'agent-1', agentType: 'autonomous_agent' },
    organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
    actorId: 'user-1',
    ...overrides,
  };
}

describe('Agent Passport -- reconstruction from events', () => {
  it('reconstructs current state by folding the full ordered event history', async () => {
    const { service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    await service.suspendPassport(ORG, passport.passportId, { suspendedBy: 'user-2' });
    const reactivated = await service.reactivatePassport(ORG, passport.passportId, 'user-2');

    assert.equal(reactivated.status, 'active');
    assert.equal(reactivated.provenance.reconstructedThroughSequence, 4);
  });

  it('capability/authority/delegation references accumulate and can be removed', async () => {
    const { service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput());

    const withCapability = await service.referenceCapability(ORG, passport.passportId, { capabilityId: 'cap-1', capabilityType: 'read', status: 'active' }, 'user-1');
    assert.equal(withCapability.capabilities.length, 1);

    const withAuthority = await service.referenceAuthority(
      ORG,
      passport.passportId,
      { authorityId: 'auth-1', authorityType: 'delegated', issuedBy: 'org-1-authority', issuedAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      'user-1',
    );
    assert.equal(withAuthority.authorities.length, 1);

    const withDelegation = await service.referenceDelegation(
      ORG,
      passport.passportId,
      { delegationId: 'del-1', delegatorId: 'agent-0', delegateId: 'agent-1', scope: {}, validFrom: '2026-01-01T00:00:00.000Z', status: 'active' },
      'user-1',
    );
    assert.equal(withDelegation.delegations.length, 1);

    const removed = await service.removeCapabilityReference(ORG, passport.passportId, 'cap-1', 'user-1');
    assert.equal(removed.capabilities.length, 0);
    assert.equal(removed.authorities.length, 1, 'authority references are unaffected by removing a capability reference');
  });

  it('re-referencing the same capabilityId replaces the prior reference (keyed by capabilityId, never duplicated)', async () => {
    const { service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput());
    await service.referenceCapability(ORG, passport.passportId, { capabilityId: 'cap-1', capabilityType: 'read', status: 'active' }, 'user-1');
    const updated = await service.referenceCapability(ORG, passport.passportId, { capabilityId: 'cap-1', capabilityType: 'write', status: 'active' }, 'user-1');
    assert.equal(updated.capabilities.length, 1);
    assert.equal(updated.capabilities[0]?.capabilityType, 'write');
  });

  it('event chain: sequence is continuous and each event links to the previous event digest', async () => {
    const { store, service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    const events = await store.listEvents(ORG, passport.passportId);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.sequence, 1);
    assert.equal(events[1]?.sequence, 2);
    assert.equal(events[0]?.previousEventDigest, undefined);
    assert.equal(events[1]?.previousEventDigest, events[0]?.eventDigest);

    const chain = verifyEventChain(events);
    assert.equal(chain.valid, true);
    assert.deepEqual(chain.failures, []);
  });

  it('event chain: tampered payload is detected by digest recomputation', async () => {
    const { store, service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput());
    const events = await store.listEvents(ORG, passport.passportId);
    const original = events[0];
    assert.ok(original);

    const tampered = { ...original, payload: { ...original.payload, subject: { agentId: 'attacker-agent', agentType: 'autonomous_agent' } } };
    const chain = verifyEventChain([tampered]);
    assert.equal(chain.valid, false);
    assert.ok(chain.failures.some((message) => message.includes('does not match its recomputed digest')));
  });

  it('event chain: a broken previousEventDigest link is detected', async () => {
    const { store, service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    const events = await store.listEvents(ORG, passport.passportId);
    const [first, second] = events;
    assert.ok(first && second);

    const brokenSecond = { ...second, previousEventDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000' };
    const chain = verifyEventChain([first, brokenSecond]);
    assert.equal(chain.valid, false);
    assert.ok(chain.failures.some((message) => message.includes('chain break')));
  });

  it('event chain: a duplicated/gapped sequence is detected', async () => {
    const { store, service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    const events = await store.listEvents(ORG, passport.passportId);
    const [first, second] = events;
    assert.ok(first && second);

    const duplicated = { ...second, sequence: 1 };
    const chain = verifyEventChain([first, duplicated]);
    assert.equal(chain.valid, false);
    assert.ok(chain.failures.some((message) => message.includes('gap or duplicate')));
  });

  it('reconstruct() reports an empty passport as PASSPORT_NOT_FOUND rather than a corrupted/incomplete result', async () => {
    const { service } = buildStoreAndService();
    await assert.rejects(service.getPassport(ORG, 'no-such-passport'), (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_NOT_FOUND');
  });

  it('computeHistorySummary derives bounded metrics from references, never a collapsed trust score', async () => {
    const { service } = buildStoreAndService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    await service.suspendPassport(ORG, passport.passportId, { suspendedBy: 'user-2' });
    await service.reactivatePassport(ORG, passport.passportId, 'user-2');

    const summary = await service.getHistorySummary(ORG, passport.passportId);
    assert.equal(summary.suspensions, 1);
    assert.equal(summary.revocations, 0);
    assert.equal(summary.governanceEvaluationsReferenced, 0);
    assert.equal(summary.evidenceBundlesReferenced, 0);
    assert.ok(!('trustScore' in summary));
  });
});
