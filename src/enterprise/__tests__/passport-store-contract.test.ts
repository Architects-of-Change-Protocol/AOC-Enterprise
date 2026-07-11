import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createSqlitePassportStore } from '../passport/sqlite-passport-store.js';
import { AgentPassportError } from '../passport/errors.js';
import type { AgentPassportStore } from '../passport/passport-store.js';

const ORG = { organizationId: 'org-1', system: false } as const;
const SYSTEM = { system: true } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
});

const providers: readonly { readonly name: string; readonly build: () => Promise<AgentPassportStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryPassportStore({ now: buildClock(), nextId, enterpriseVersion: 'contract-test-1.0.0' }) },
  { name: 'sqlite (:memory:)', build: async () => createSqlitePassportStore(':memory:', { now: buildClock(), nextId, enterpriseVersion: 'contract-test-1.0.0' }) },
];

for (const provider of providers) {
  describe(`AgentPassportStore contract -- ${provider.name}`, () => {
    async function open(): Promise<AgentPassportStore> {
      const store = await provider.build();
      closers.push(() => store.close());
      return store;
    }

    it(`providerKind is reported correctly`, async () => {
      const store = await open();
      assert.ok(store.providerKind === 'memory' || store.providerKind === 'sqlite');
    });

    it('appends a Created event and reconstructs it', async () => {
      const store = await open();
      const passportId = nextId('passport');
      const { passport } = await store.appendEvent(ORG, {
        passportId,
        organizationId: 'org-1',
        eventType: 'AgentPassportCreated',
        payload: {
          subject: { agentId: 'agent-x', agentType: 'autonomous_agent' },
          organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' },
          passportVersion: '1.0.0',
        },
        actorId: 'user-1',
        actorType: 'user',
      });
      assert.equal(passport.status, 'draft');

      const load = await store.reconstruct(ORG, passportId);
      assert.equal(load.status, 'complete');
      assert.equal(load.passport?.subject.agentId, 'agent-x');
    });

    it('enforces the lifecycle state machine on append', async () => {
      const store = await open();
      const passportId = nextId('passport');
      await store.appendEvent(ORG, {
        passportId,
        organizationId: 'org-1',
        eventType: 'AgentPassportCreated',
        payload: { subject: { agentId: 'agent-y', agentType: 'autonomous_agent' }, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' }, passportVersion: '1.0.0' },
        actorId: 'user-1',
        actorType: 'user',
      });

      await assert.rejects(
        store.appendEvent(ORG, { passportId, organizationId: 'org-1', eventType: 'AgentPassportSuspended', payload: { suspendedBy: 'user-1' }, actorId: 'user-1', actorType: 'user' }),
        (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_INVALID_STATE_TRANSITION',
      );
    });

    it('enforces uniqueness: only one non-terminal Passport per (organization, agentId)', async () => {
      const store = await open();
      const first = nextId('passport');
      await store.appendEvent(ORG, {
        passportId: first,
        organizationId: 'org-1',
        eventType: 'AgentPassportCreated',
        payload: { subject: { agentId: 'agent-dup', agentType: 'autonomous_agent' }, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' }, passportVersion: '1.0.0' },
        actorId: 'user-1',
        actorType: 'user',
      });

      const second = nextId('passport');
      await assert.rejects(
        store.appendEvent(ORG, {
          passportId: second,
          organizationId: 'org-1',
          eventType: 'AgentPassportCreated',
          payload: { subject: { agentId: 'agent-dup', agentType: 'autonomous_agent' }, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' }, passportVersion: '1.0.0' },
          actorId: 'user-1',
          actorType: 'user',
        }),
        (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ALREADY_EXISTS',
      );
    });

    it('idempotency: resolveIdempotency reports new/replay/conflict correctly', async () => {
      const store = await open();
      const passportId = nextId('passport');
      const subject = { agentId: 'agent-idem', agentType: 'autonomous_agent' };
      const { computeDigest } = await import('../governance-store/digest.js');
      const subjectDigest = computeDigest(subject);

      const before = await store.resolveIdempotency(ORG, { idempotency: { idempotencyKey: 'key-1', scope: 'org-1' }, subjectDigest });
      assert.equal(before.kind, 'new');

      await store.appendEvent(ORG, {
        passportId,
        organizationId: 'org-1',
        eventType: 'AgentPassportCreated',
        payload: { subject, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' }, passportVersion: '1.0.0' },
        actorId: 'user-1',
        actorType: 'user',
        idempotency: { idempotencyKey: 'key-1', scope: 'org-1' },
      });

      const replay = await store.resolveIdempotency(ORG, { idempotency: { idempotencyKey: 'key-1', scope: 'org-1' }, subjectDigest });
      assert.deepEqual(replay, { kind: 'replay', passportId });

      const conflict = await store.resolveIdempotency(ORG, { idempotency: { idempotencyKey: 'key-1', scope: 'org-1' }, subjectDigest: 'sha256:' + '0'.repeat(64) });
      assert.equal(conflict.kind, 'conflict');
    });

    it('tenant isolation: a caller from another organization cannot read this Passport', async () => {
      const store = await open();
      const passportId = nextId('passport');
      await store.appendEvent(ORG, {
        passportId,
        organizationId: 'org-1',
        eventType: 'AgentPassportCreated',
        payload: { subject: { agentId: 'agent-tenant', agentType: 'autonomous_agent' }, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' }, passportVersion: '1.0.0' },
        actorId: 'user-1',
        actorType: 'user',
      });

      const otherOrg = { organizationId: 'org-2', system: false } as const;
      await assert.rejects(store.reconstruct(otherOrg, passportId), (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ACCESS_SCOPE_VIOLATION');

      const systemLoad = await store.reconstruct(SYSTEM, passportId);
      assert.equal(systemLoad.status, 'complete');
    });

    it('findByAgentId requires an explicit organization scope even for system callers', async () => {
      const store = await open();
      await assert.rejects(store.findByAgentId(SYSTEM, 'agent-x'), (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_TENANT_SCOPE_REQUIRED');
    });

    it('health() reports readable/writable status', async () => {
      const store = await open();
      const health = await store.health();
      assert.equal(health.status, 'healthy');
      assert.equal(health.readable, true);
      assert.equal(health.writable, true);
    });

    it('use after close() fails predictably', async () => {
      const store = await provider.build();
      await store.close();
      await assert.rejects(
        store.appendEvent(ORG, { passportId: 'x', organizationId: 'org-1', eventType: 'AgentPassportCreated', payload: {}, actorId: 'a', actorType: 'user' }),
        (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_STORE_UNAVAILABLE',
      );
    });
  });
}

describe('AgentPassportStore -- SQLite persistence across reopen', () => {
  it('a Passport survives closing and reopening the same on-disk database', async () => {
    const path = `.data/test-passport-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
    const store1 = await createSqlitePassportStore(path, { now: buildClock(), nextId, enterpriseVersion: 'contract-test-1.0.0' });
    const passportId = nextId('passport');
    await store1.appendEvent(ORG, {
      passportId,
      organizationId: 'org-1',
      eventType: 'AgentPassportCreated',
      payload: { subject: { agentId: 'agent-reopen', agentType: 'autonomous_agent' }, organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry', boundAt: '2026-01-01T00:00:00.000Z' }, passportVersion: '1.0.0' },
      actorId: 'user-1',
      actorType: 'user',
    });
    await store1.close();

    const store2 = await createSqlitePassportStore(path, { now: buildClock(), nextId, enterpriseVersion: 'contract-test-1.0.0' });
    closers.push(() => store2.close());
    const reloaded = await store2.reconstruct(ORG, passportId);
    assert.equal(reloaded.status, 'complete');
    assert.equal(reloaded.passport?.subject.agentId, 'agent-reopen');
  });
});
