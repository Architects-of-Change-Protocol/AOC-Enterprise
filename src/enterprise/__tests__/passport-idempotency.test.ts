import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createAgentPassportService } from '../passport/service.js';
import { AgentPassportError } from '../passport/errors.js';
import type { IssueAgentPassportInput } from '../passport/service.js';

const ORG_A = { organizationId: 'org-a', system: false } as const;
const ORG_B = { organizationId: 'org-b', system: false } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

function buildService() {
  const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
  return createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}` });
}

function issuanceInput(overrides: Partial<IssueAgentPassportInput> = {}, organizationId = 'org-a'): IssueAgentPassportInput {
  return {
    subject: { agentId: 'agent-1', agentType: 'autonomous_agent' },
    organization: { organizationId, recognizedBy: `${organizationId}-registry` },
    actorId: 'user-1',
    ...overrides,
  };
}

describe('Agent Passport issuance -- idempotency', () => {
  it('first issuance with an idempotency key creates a new Passport', async () => {
    const service = buildService();
    const result = await service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'key-1' }));
    assert.equal(result.created, true);
  });

  it('repeated identical issuance replays the original Passport rather than creating a second one', async () => {
    const service = buildService();
    const first = await service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'key-1' }));
    const second = await service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'key-1' }));

    assert.equal(second.created, false);
    assert.equal(second.passport.passportId, first.passport.passportId);
  });

  it('same key, different subject -> PASSPORT_IDEMPOTENCY_CONFLICT', async () => {
    const service = buildService();
    await service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'key-1' }));

    await assert.rejects(
      service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'key-1', subject: { agentId: 'agent-2', agentType: 'autonomous_agent' } })),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_IDEMPOTENCY_CONFLICT',
    );
  });

  it('idempotency keys are tenant-scoped: the same key in a different organization is independent', async () => {
    const service = buildService();
    const inOrgA = await service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'shared-key' }, 'org-a'));
    const inOrgB = await service.issuePassport(ORG_B, issuanceInput({ idempotencyKey: 'shared-key' }, 'org-b'));

    assert.equal(inOrgA.created, true);
    assert.equal(inOrgB.created, true);
    assert.notEqual(inOrgA.passport.passportId, inOrgB.passport.passportId);
  });

  it('without an idempotency key, a duplicate issuance for the same agent fails with PASSPORT_ALREADY_EXISTS, not a silent replay', async () => {
    const service = buildService();
    await service.issuePassport(ORG_A, issuanceInput());
    await assert.rejects(
      service.issuePassport(ORG_A, issuanceInput()),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ALREADY_EXISTS',
    );
  });

  it('exactly one Passport results from repeated identical issuance calls (simulated concurrency)', async () => {
    const service = buildService();
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.issuePassport(ORG_A, issuanceInput({ idempotencyKey: 'race-key' }))),
    );
    const fulfilled = attempts.filter((entry) => entry.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof service.issuePassport>>>[];
    assert.ok(fulfilled.length >= 1);
    const passportIds = new Set(fulfilled.map((entry) => entry.value.passport.passportId));
    assert.equal(passportIds.size, 1, 'every successful attempt resolved to the same Passport');
  });
});
