import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createAgentPassportService, type AgentPassportService } from '../passport/service.js';
import { AgentPassportError } from '../passport/errors.js';
import type { IssueAgentPassportInput } from '../passport/service.js';

const SYSTEM = { system: true } as const;
const ORG = { organizationId: 'org-1', system: false } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

function buildService(): AgentPassportService {
  const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
  return createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}` });
}

function issuanceInput(overrides: Partial<IssueAgentPassportInput> = {}): IssueAgentPassportInput {
  return {
    subject: { agentId: 'agent-1', agentType: 'autonomous_agent', displayName: 'Test Agent' },
    organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
    actorId: 'user-1',
    ...overrides,
  };
}

describe('Agent Passport Lifecycle', () => {
  it('issues a draft Passport by default', async () => {
    const service = buildService();
    const { passport, created } = await service.issuePassport(ORG, issuanceInput());
    assert.equal(created, true);
    assert.equal(passport.status, 'draft');
    assert.equal(passport.subject.agentId, 'agent-1');
    assert.equal(passport.organization.organizationId, 'org-1');
  });

  it('supports direct active issuance via activateImmediately', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    assert.equal(passport.status, 'active');
    assert.ok(passport.lifecycle.activatedAt);
  });

  it('activates a draft Passport', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput());
    const activated = await service.activatePassport(ORG, passport.passportId, 'user-1');
    assert.equal(activated.status, 'active');
  });

  it('suspends and reactivates an active Passport', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));

    const suspended = await service.suspendPassport(ORG, passport.passportId, { suspendedBy: 'user-2', reason: 'under review' });
    assert.equal(suspended.status, 'suspended');
    assert.equal(suspended.lifecycle.suspendedReason, 'under review');
    assert.equal(suspended.lifecycle.suspendedBy, 'user-2');

    const reactivated = await service.reactivatePassport(ORG, passport.passportId, 'user-2');
    assert.equal(reactivated.status, 'active');
  });

  it('revokes a Passport, appending an explicit reason and reasonCode', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    const revoked = await service.revokePassport(ORG, passport.passportId, { reasonCode: 'POLICY_VIOLATION', reason: 'violated data handling policy', revokedBy: 'user-2' });
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.lifecycle.revokedReasonCode, 'POLICY_VIOLATION');
    assert.equal(revoked.lifecycle.revokedBy, 'user-2');
  });

  it('retires a Passport from active', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    const retired = await service.retirePassport(ORG, passport.passportId, { retiredBy: 'user-2', reason: 'decommissioned' });
    assert.equal(retired.status, 'retired');
  });

  it('supports explicit expiration as an appended event (v1 has no background scheduler -- mission section 27)', async () => {
    const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
    const service = createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-expiry-test` });
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));

    const { passport: expired } = await store.appendEvent(ORG, {
      passportId: passport.passportId,
      organizationId: 'org-1',
      eventType: 'AgentPassportExpired',
      payload: {},
      actorId: 'system',
      actorType: 'system',
    });
    assert.equal(expired.status, 'expired');

    await assert.rejects(
      service.reactivatePassport(ORG, passport.passportId, 'user-1'),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ALREADY_REVOKED',
    );
  });

  it('rejects an invalid transition: cannot suspend a draft Passport', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput());
    await assert.rejects(
      service.suspendPassport(ORG, passport.passportId, { suspendedBy: 'user-1' }),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_INVALID_STATE_TRANSITION',
    );
  });

  it('rejects duplicate activation of an already-active Passport', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    await assert.rejects(
      service.activatePassport(ORG, passport.passportId, 'user-1'),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_INVALID_STATE_TRANSITION',
    );
  });

  it('a revoked Passport cannot be reactivated (terminal)', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    await service.revokePassport(ORG, passport.passportId, { reasonCode: 'X', reason: 'x', revokedBy: 'user-1' });
    await assert.rejects(
      service.reactivatePassport(ORG, passport.passportId, 'user-1'),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ALREADY_REVOKED',
    );
  });

  it('a retired Passport cannot be reactivated (terminal)', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    await service.retirePassport(ORG, passport.passportId, { retiredBy: 'user-1' });
    await assert.rejects(
      service.reactivatePassport(ORG, passport.passportId, 'user-1'),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ALREADY_REVOKED',
    );
  });

  it('only one non-terminal Passport may exist per (organization, agentId); a new one may be issued only after the prior one reaches a terminal status', async () => {
    const service = buildService();
    await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));

    await assert.rejects(
      service.issuePassport(ORG, issuanceInput()),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_ALREADY_EXISTS',
    );

    const existing = await service.findByAgentId(ORG, 'agent-1');
    assert.ok(existing);
    await service.revokePassport(ORG, existing.passportId, { reasonCode: 'X', reason: 'x', revokedBy: 'user-1' });

    const reissued = await service.issuePassport(ORG, issuanceInput());
    assert.equal(reissued.created, true);
    assert.notEqual(reissued.passport.passportId, existing.passportId);
  });

  it('findByAgentId returns null once the only Passport for that agent is terminal', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput({ activateImmediately: true }));
    await service.retirePassport(ORG, passport.passportId, { retiredBy: 'user-1' });
    const found = await service.findByAgentId(ORG, 'agent-1');
    assert.equal(found, null);
  });

  it('a system caller can reconstruct without an organization scope, but findByAgentId always requires one', async () => {
    const service = buildService();
    const { passport } = await service.issuePassport(ORG, issuanceInput());
    const load = await service.getPassport(SYSTEM, passport.passportId);
    assert.equal(load.status, 'complete');

    await assert.rejects(
      service.findByAgentId(SYSTEM, 'agent-1'),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_TENANT_SCOPE_REQUIRED',
    );
  });
});
