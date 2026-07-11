import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryPassportStore } from '../passport/in-memory-passport-store.js';
import { createAgentPassportService, type AgentPassportService } from '../passport/service.js';
import { AGENT_PASSPORT_VIEW_TYPES } from '../passport/disclosure.js';
import { AgentPassportError } from '../passport/errors.js';
import type { AgentPassport } from '../passport/contracts.js';

const ORG = { organizationId: 'org-1', system: false } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

function buildService(): AgentPassportService {
  const store = createInMemoryPassportStore({ now: buildClock(), enterpriseVersion: 'test-1.0.0' });
  return createAgentPassportService({ store, now: buildClock(), nextId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}` });
}

async function issueRichPassport(service: AgentPassportService): Promise<AgentPassport> {
  const { passport } = await service.issuePassport(ORG, {
    subject: { agentId: 'agent-1', agentType: 'autonomous_agent', displayName: 'Closure Bot', systemOwnerId: 'secret-owner-id', modelProvider: 'internal' },
    organization: { organizationId: 'org-1', recognizedBy: 'org-1-registry' },
    actorId: 'user-1',
    activateImmediately: true,
  });
  return service.referenceCapability(ORG, passport.passportId, { capabilityId: 'cap-1', capabilityType: 'read', status: 'active' }, 'user-1');
}

describe('Agent Passport -- Disclosure Views', () => {
  it('every view type builds successfully with a distinct view digest', async () => {
    const service = buildService();
    const passport = await issueRichPassport(service);

    const views = await Promise.all(AGENT_PASSPORT_VIEW_TYPES.map((viewType) => service.buildView(ORG, passport.passportId, viewType, 'system')));
    assert.equal(views.length, 5);

    const digests = new Set(views.map((view) => view.integrity.viewDigest));
    assert.equal(digests.size, 5, 'every view has its own distinct viewDigest');

    const stateDigests = new Set(views.map((view) => view.provenance.passportStateDigest));
    assert.equal(stateDigests.size, 1, 'every view shares the same passportStateDigest, since they all project the same Passport state');
  });

  it('PUBLIC and CUSTOMER views never disclose systemOwnerId/modelProvider or evidence references', async () => {
    const service = buildService();
    const passport = await issueRichPassport(service);

    for (const viewType of ['PUBLIC', 'CUSTOMER'] as const) {
      const view = await service.buildView(ORG, passport.passportId, viewType, 'system');
      assert.ok(!('systemOwnerId' in view.subject), `${viewType} must not expose systemOwnerId`);
      assert.ok(!('modelProvider' in view.subject), `${viewType} must not expose modelProvider`);
      assert.equal(view.evidenceReferences.length, 0, `${viewType} must not expose Evidence References`);
    }
  });

  it('INTERNAL and AUDITOR views expose more than PARTNER/CUSTOMER/PUBLIC (minimal disclosure is a strict ordering)', async () => {
    const service = buildService();
    const passport = await issueRichPassport(service);

    const internal = await service.buildView(ORG, passport.passportId, 'INTERNAL', 'system');
    const publicView = await service.buildView(ORG, passport.passportId, 'PUBLIC', 'system');

    assert.ok(Object.keys(internal.subject).length > Object.keys(publicView.subject).length);
    assert.ok(internal.claims.length >= publicView.claims.length);
  });

  it('no view ever leaks raw event payloads', async () => {
    const service = buildService();
    const passport = await issueRichPassport(service);
    const view = await service.buildView(ORG, passport.passportId, 'INTERNAL', 'system');
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes('eventDigest'), 'a view must never embed raw event fields');
    assert.ok(!serialized.includes('previousEventDigest'));
  });

  it('an unknown view type is rejected', async () => {
    const service = buildService();
    const passport = await issueRichPassport(service);
    await assert.rejects(
      service.buildView(ORG, passport.passportId, 'NOT_A_VIEW', 'system'),
      (error: unknown) => error instanceof AgentPassportError && error.code === 'PASSPORT_VALIDATION_ERROR',
    );
  });

  it('a revoked Passport still yields a view reporting the revoked status (views disclose, never hide, lifecycle status)', async () => {
    const service = buildService();
    const passport = await issueRichPassport(service);
    await service.revokePassport(ORG, passport.passportId, { reasonCode: 'X', reason: 'x', revokedBy: 'user-1' });
    const view = await service.buildView(ORG, passport.passportId, 'PUBLIC', 'system');
    assert.equal(view.status, 'revoked');
    const notRevokedClaim = view.claims.find((claim) => claim.claimType === 'passport.not-revoked');
    assert.equal(notRevokedClaim?.value, false);
  });
});
